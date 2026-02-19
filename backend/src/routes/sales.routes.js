import express from "express";
import {
  AuditAction,
  LedgerType,
  MovementType,
  RoleCode,
} from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, authorizeRoles } from "../middleware/auth.js";
import { bodyBranchId, queryBranchId } from "../lib/scope.js";
import { computeTotals } from "../lib/calculations.js";
import { docNumber, safeNumber } from "../lib/common.js";
import { addStockBatch, consumeStockFIFO } from "../lib/stock.js";
import { logAudit } from "../lib/audit.js";
import {
  applyAccountMovement,
  ensureAccountHasFunds,
  normalizeAccountType,
} from "../lib/finance.js";

const router = express.Router();

router.use(authRequired);

function deriveInvoiceStatus(dueAmount, paidAmount) {
  const due = Math.max(safeNumber(dueAmount, 0), 0);
  const paid = Math.max(safeNumber(paidAmount, 0), 0);
  if (due <= 0) {
    return "PAID";
  }
  if (paid > 0) {
    return "PARTIAL";
  }
  return "UNPAID";
}

async function findBranchScopedInvoice(tx, req, invoiceId) {
  const branchId =
    req.user.role.code === RoleCode.ADMIN ? undefined : Number(req.user.branchId);
  return tx.salesInvoice.findFirst({
    where: {
      id: Number(invoiceId),
      ...(branchId ? { branchId } : {}),
    },
  });
}

router.get("/sales", async (req, res) => {
  const branchId = queryBranchId(req);
  const sales = await prisma.salesInvoice.findMany({
    where: { branchId },
    include: {
      customer: true,
      items: { include: { product: true } },
      payments: true,
      returns: { include: { items: true } },
      createdBy: { select: { id: true, fullName: true } },
    },
    orderBy: { invoiceDate: "desc" },
  });
  res.json(sales);
});

router.post(
  "/sales",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.CASHIER),
  async (req, res) => {
    const branchId = bodyBranchId(req, req.body.branchId);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (items.length === 0) {
      return res.status(400).json({ message: "items are required." });
    }
    const paymentMethod = normalizeAccountType(req.body.paymentMethod || "CASH");

    const customerId = req.body.customerId ? Number(req.body.customerId) : null;
    if (customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, branchId },
      });
      if (!customer) {
        return res.status(400).json({ message: "Selected customer does not belong to this branch." });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.create({
        data: {
          number: docNumber("SAL"),
          branchId,
          customerId,
          invoiceDate: req.body.invoiceDate ? new Date(req.body.invoiceDate) : new Date(),
          subtotal: 0,
          discount: safeNumber(req.body.discount, 0),
          tax: safeNumber(req.body.tax, 0),
          total: 0,
          paidAmount: 0,
          dueAmount: 0,
          note: req.body.note || null,
          createdById: req.user.id,
        },
      });

      let subtotal = 0;
      for (const item of items) {
        const productId = Number(item.productId);
        const qty = safeNumber(item.quantity, 0);
        if (qty <= 0) {
          throw new Error("Each sales item quantity must be > 0.");
        }

        const product = await tx.product.findFirst({
          where: { id: productId, branchId, isActive: true },
        });
        if (!product) {
          throw new Error(`Product ${productId} not found in selected branch.`);
        }

        const unitPrice = safeNumber(item.unitPrice, Number(product.sellPrice));
        const lineDiscount = safeNumber(item.discount, 0);
        if (unitPrice < 0 || lineDiscount < 0) {
          throw new Error("Unit price and item discount must be non-negative.");
        }
        if (lineDiscount > qty * unitPrice) {
          throw new Error(`Discount cannot exceed line amount for product ${product.name}.`);
        }

        const lineTotal = qty * unitPrice - lineDiscount;
        const { costOfGoods } = await consumeStockFIFO(tx, {
          productId,
          branchId,
          quantity: qty,
        });

        await tx.salesItem.create({
          data: {
            salesInvoiceId: invoice.id,
            productId,
            quantity: qty,
            unitPrice,
            discount: lineDiscount,
            lineTotal,
            costOfGoods,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId,
            branchId,
            type: MovementType.SALE,
            quantity: -qty,
            unitCost: qty > 0 ? costOfGoods / qty : 0,
            referenceType: "SALES_INVOICE",
            referenceId: invoice.id,
            createdById: req.user.id,
          },
        });

        subtotal += lineTotal;
      }

      const totals = computeTotals({
        subtotal,
        discount: safeNumber(req.body.discount, 0),
        tax: safeNumber(req.body.tax, 0),
        paidAmount: safeNumber(req.body.paidAmount, 0),
      });

      const updated = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          subtotal,
          total: totals.total,
          paidAmount: totals.paid,
          dueAmount: totals.due,
          status: deriveInvoiceStatus(totals.due, totals.paid),
        },
      });

      if (totals.paid > 0) {
        await tx.salesPayment.create({
          data: {
            salesInvoiceId: updated.id,
            amount: totals.paid,
            paymentDate: updated.invoiceDate,
            paymentMethod,
            reference: req.body.paymentReference || null,
          },
        });
        await applyAccountMovement(tx, {
          branchId,
          paymentMethod,
          amount: totals.paid,
          direction: "IN",
          purpose: "sales invoice initial payment",
        });
      }

      if (updated.customerId && totals.due > 0) {
        await tx.customerLedger.create({
          data: {
            customerId: updated.customerId,
            branchId,
            salesInvoiceId: updated.id,
            type: LedgerType.DEBIT,
            amount: totals.due,
            note: `Credit sale on invoice ${updated.number}`,
          },
        });
      }

      if (updated.customerId) {
        const loyaltyPoints = Math.floor(totals.total / 100);
        if (loyaltyPoints > 0) {
          await tx.customer.update({
            where: { id: updated.customerId },
            data: { loyaltyPoints: { increment: loyaltyPoints } },
          });
          await tx.loyaltyTransaction.create({
            data: {
              customerId: updated.customerId,
              points: loyaltyPoints,
              type: "EARN",
              note: `Invoice ${updated.number}`,
            },
          });
        }
      }

      return tx.salesInvoice.findUnique({
        where: { id: updated.id },
        include: {
          customer: true,
          items: { include: { product: true } },
          payments: true,
        },
      });
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.CREATE,
      entityType: "sales_invoice",
      entityId: created.id,
      payload: { number: created.number, total: created.total },
    });

    res.status(201).json(created);
  },
);

router.post(
  "/sales/:id/payments",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.CASHIER),
  async (req, res) => {
    const invoiceId = Number(req.params.id);
    const amount = safeNumber(req.body.amount, 0);
    if (amount <= 0) {
      return res.status(400).json({ message: "amount must be > 0" });
    }
    const paymentMethod = normalizeAccountType(req.body.paymentMethod || "CASH");

    const updated = await prisma.$transaction(async (tx) => {
      const invoice = await findBranchScopedInvoice(tx, req, invoiceId);
      if (!invoice) {
        throw new Error("Sales invoice not found.");
      }
      if (Number(invoice.dueAmount) <= 0) {
        throw new Error("Invoice has no due amount.");
      }
      if (amount > Number(invoice.dueAmount)) {
        throw new Error("Payment amount cannot exceed invoice due.");
      }

      const appliedAmount = amount;
      const paidAmount = Number(invoice.paidAmount) + appliedAmount;
      const dueAmount = Math.max(Number(invoice.dueAmount) - appliedAmount, 0);
      const status = deriveInvoiceStatus(dueAmount, paidAmount);

      await tx.salesPayment.create({
        data: {
          salesInvoiceId: invoice.id,
          amount: appliedAmount,
          paymentMethod,
          paymentDate: req.body.paymentDate ? new Date(req.body.paymentDate) : new Date(),
          reference: req.body.reference || null,
          note: req.body.note || null,
        },
      });

      await applyAccountMovement(tx, {
        branchId: invoice.branchId,
        paymentMethod,
        amount: appliedAmount,
        direction: "IN",
        purpose: `sales payment ${invoice.number}`,
      });

      if (invoice.customerId && appliedAmount > 0) {
        await tx.customerLedger.create({
          data: {
            customerId: invoice.customerId,
            branchId: invoice.branchId,
            salesInvoiceId: invoice.id,
            type: LedgerType.CREDIT,
            amount: appliedAmount,
            note: `Customer payment for invoice ${invoice.number}`,
          },
        });
      }

      return tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount,
          dueAmount,
          status,
        },
      });
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.UPDATE,
      entityType: "sales_payment",
      entityId: updated.id,
      payload: { amount },
    });

    res.json(updated);
  },
);

router.post(
  "/sales/:id/returns",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.CASHIER),
  async (req, res) => {
    const invoiceId = Number(req.params.id);
    const returnItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (returnItems.length === 0) {
      return res.status(400).json({ message: "return items required." });
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findFirst({
        where: {
          id: invoiceId,
          ...(req.user.role.code === RoleCode.ADMIN
            ? {}
            : { branchId: Number(req.user.branchId) }),
        },
        include: {
          items: true,
          returns: { include: { items: true } },
          customer: true,
        },
      });
      if (!invoice) {
        throw new Error("Invoice not found.");
      }

      const soldByProduct = new Map();
      const soldBySalesItem = new Map();
      for (const item of invoice.items) {
        const productId = Number(item.productId);
        soldByProduct.set(productId, (soldByProduct.get(productId) || 0) + Number(item.quantity));
        soldBySalesItem.set(Number(item.id), item);
      }

      const returnedByProduct = new Map();
      const returnedBySalesItem = new Map();
      for (const ret of invoice.returns) {
        for (const item of ret.items) {
          const qty = Number(item.quantity || 0);
          const productId = Number(item.productId);
          returnedByProduct.set(productId, (returnedByProduct.get(productId) || 0) + qty);
          if (item.salesItemId) {
            const salesItemId = Number(item.salesItemId);
            returnedBySalesItem.set(
              salesItemId,
              (returnedBySalesItem.get(salesItemId) || 0) + qty,
            );
          }
        }
      }

      const previousReturnTotal = invoice.returns.reduce(
        (sum, current) => sum + Number(current.total || 0),
        0,
      );

      let total = 0;
      const createdReturn = await tx.salesReturn.create({
        data: {
          number: docNumber("RET"),
          salesInvoiceId: invoice.id,
          returnDate: req.body.returnDate ? new Date(req.body.returnDate) : new Date(),
          total: 0,
          refundAmount: 0,
          reason: req.body.reason || null,
          createdById: req.user.id,
        },
      });

      for (const item of returnItems) {
        const productId = Number(item.productId);
        const qty = safeNumber(item.quantity, 0);
        let salesItem = null;
        let maxReturnableQty = 0;
        if (item.salesItemId) {
          const salesItemId = Number(item.salesItemId);
          salesItem = soldBySalesItem.get(salesItemId) || null;
          if (
            !salesItem ||
            salesItem.productId !== productId
          ) {
            throw new Error("Invalid sales item selected for return.");
          }

          maxReturnableQty = Math.max(
            Number(salesItem.quantity || 0) - Number(returnedBySalesItem.get(Number(salesItem.id)) || 0),
            0,
          );
        } else {
          const soldQty = soldByProduct.get(productId) || 0;
          const returnedQty = returnedByProduct.get(productId) || 0;
          maxReturnableQty = Math.max(soldQty - returnedQty, 0);
          salesItem = invoice.items.find((entry) => Number(entry.productId) === productId) || null;
        }

        if (qty <= 0 || qty > maxReturnableQty) {
          throw new Error(`Invalid return quantity for product ${productId}.`);
        }

        const unitPrice = safeNumber(item.unitPrice, salesItem?.unitPrice || 0);
        const lineTotal = qty * unitPrice;
        total += lineTotal;

        await tx.salesReturnItem.create({
          data: {
            salesReturnId: createdReturn.id,
            salesItemId: salesItem?.id || null,
            productId,
            quantity: qty,
            unitPrice,
            lineTotal,
          },
        });

        await addStockBatch(tx, {
          productId,
          branchId: invoice.branchId,
          quantity: qty,
          unitCost:
            salesItem?.costOfGoods && salesItem.quantity > 0
              ? salesItem.costOfGoods / salesItem.quantity
              : 0,
          sellPrice: unitPrice,
          batchNumber: `RET-${invoice.number}`,
          expiryDate: null,
        });

        await tx.stockMovement.create({
          data: {
            productId,
            branchId: invoice.branchId,
            type: MovementType.RETURN,
            quantity: qty,
            unitCost: 0,
            referenceType: "SALES_RETURN",
            referenceId: createdReturn.id,
            createdById: req.user.id,
          },
        });

        returnedByProduct.set(
          productId,
          (returnedByProduct.get(productId) || 0) + qty,
        );
        if (salesItem?.id) {
          returnedBySalesItem.set(
            Number(salesItem.id),
            (returnedBySalesItem.get(Number(salesItem.id)) || 0) + qty,
          );
        }
      }

      const requestedRefund = safeNumber(req.body.refundAmount, 0);
      const refundMethod = normalizeAccountType(req.body.refundMethod || "CASH");
      if (requestedRefund < 0) {
        throw new Error("Refund amount cannot be negative.");
      }

      const refundAmount = Math.min(
        requestedRefund,
        total,
        Number(invoice.paidAmount),
      );

      const effectiveInvoiceTotal = Math.max(
        Number(invoice.total) - previousReturnTotal - total,
        0,
      );
      const paidAmount = Math.max(Number(invoice.paidAmount) - refundAmount, 0);
      const dueAmount = Math.max(effectiveInvoiceTotal - paidAmount, 0);

      if (refundAmount > 0) {
        await ensureAccountHasFunds(tx, {
          branchId: invoice.branchId,
          paymentMethod: refundMethod,
          amount: refundAmount,
          purpose: `sales return refund ${createdReturn.number}`,
        });
      }

      await tx.salesReturn.update({
        where: { id: createdReturn.id },
        data: {
          total,
          refundAmount,
        },
      });

      const updatedInvoice = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount,
          dueAmount,
          status: deriveInvoiceStatus(dueAmount, paidAmount),
        },
      });

      if (refundAmount > 0) {
        await applyAccountMovement(tx, {
          branchId: invoice.branchId,
          paymentMethod: refundMethod,
          amount: refundAmount,
          direction: "OUT",
          purpose: `sales return refund ${createdReturn.number}`,
        });
      }

      const ledgerCredit = Math.max(total - refundAmount, 0);
      if (invoice.customerId && ledgerCredit > 0) {
        await tx.customerLedger.create({
          data: {
            customerId: invoice.customerId,
            branchId: invoice.branchId,
            salesInvoiceId: invoice.id,
            type: LedgerType.CREDIT,
            amount: ledgerCredit,
            note: `Sales return ${createdReturn.number} for invoice ${invoice.number}`,
          },
        });
      }

      const points = Math.floor(total / 100);
      if (invoice.customerId && points > 0) {
        const customer = await tx.customer.findUnique({
          where: { id: invoice.customerId },
        });
        if (customer) {
          const reversedPoints = Math.min(points, Number(customer.loyaltyPoints || 0));
          if (reversedPoints > 0) {
            await tx.customer.update({
              where: { id: invoice.customerId },
              data: { loyaltyPoints: Number(customer.loyaltyPoints) - reversedPoints },
            });
            await tx.loyaltyTransaction.create({
              data: {
                customerId: invoice.customerId,
                points: -reversedPoints,
                type: "REVERSAL",
                note: `Return ${createdReturn.number}`,
              },
            });
          }
        }
      }

      return tx.salesReturn.findUnique({
        where: { id: createdReturn.id },
        include: {
          items: { include: { product: true } },
          salesInvoice: true,
          createdBy: { select: { id: true, fullName: true } },
        },
      }).then((created) => ({
        ...created,
        invoiceAfterReturn: updatedInvoice,
      }));
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.CREATE,
      entityType: "sales_return",
      entityId: result.id,
      payload: { total: result.total, refund: result.refundAmount },
    });

    res.status(201).json(result);
  },
);

export default router;
