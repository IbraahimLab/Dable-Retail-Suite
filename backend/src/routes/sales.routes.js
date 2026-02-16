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
import { computeTotals, invoiceStatus } from "../lib/calculations.js";
import { docNumber, safeNumber } from "../lib/common.js";
import { addStockBatch, consumeStockFIFO } from "../lib/stock.js";
import { logAudit } from "../lib/audit.js";

const router = express.Router();

router.use(authRequired);

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

    const created = await prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.create({
        data: {
          number: docNumber("SAL"),
          branchId,
          customerId: req.body.customerId ? Number(req.body.customerId) : null,
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

        const product = await tx.product.findUnique({ where: { id: productId } });
        if (!product) {
          throw new Error(`Product ${productId} not found.`);
        }

        const unitPrice = safeNumber(item.unitPrice, Number(product.sellPrice));
        const lineDiscount = safeNumber(item.discount, 0);
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
          status: totals.status,
        },
      });

      if (totals.paid > 0) {
        await tx.salesPayment.create({
          data: {
            salesInvoiceId: updated.id,
            amount: totals.paid,
            paymentDate: updated.invoiceDate,
            paymentMethod: req.body.paymentMethod || "CASH",
            reference: req.body.paymentReference || null,
          },
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

    const updated = await prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findUnique({
        where: { id: invoiceId },
      });
      if (!invoice) {
        throw new Error("Sales invoice not found.");
      }
      const paidAmount = Math.min(Number(invoice.paidAmount) + amount, Number(invoice.total));
      const dueAmount = Math.max(Number(invoice.total) - paidAmount, 0);
      const status = invoiceStatus(invoice.total, paidAmount);

      await tx.salesPayment.create({
        data: {
          salesInvoiceId: invoice.id,
          amount,
          paymentMethod: req.body.paymentMethod || "CASH",
          paymentDate: req.body.paymentDate ? new Date(req.body.paymentDate) : new Date(),
          reference: req.body.reference || null,
          note: req.body.note || null,
        },
      });

      if (invoice.customerId) {
        await tx.customerLedger.create({
          data: {
            customerId: invoice.customerId,
            branchId: invoice.branchId,
            salesInvoiceId: invoice.id,
            type: LedgerType.CREDIT,
            amount,
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
      const invoice = await tx.salesInvoice.findUnique({
        where: { id: invoiceId },
        include: { items: true, returns: { include: { items: true } } },
      });
      if (!invoice) {
        throw new Error("Invoice not found.");
      }

      const soldMap = new Map();
      for (const item of invoice.items) {
        soldMap.set(item.productId, (soldMap.get(item.productId) || 0) + Number(item.quantity));
      }
      const returnedMap = new Map();
      for (const ret of invoice.returns) {
        for (const item of ret.items) {
          returnedMap.set(item.productId, (returnedMap.get(item.productId) || 0) + Number(item.quantity));
        }
      }

      let total = 0;
      const createdReturn = await tx.salesReturn.create({
        data: {
          number: docNumber("RET"),
          salesInvoiceId: invoice.id,
          returnDate: req.body.returnDate ? new Date(req.body.returnDate) : new Date(),
          total: 0,
          refundAmount: safeNumber(req.body.refundAmount, 0),
          reason: req.body.reason || null,
          createdById: req.user.id,
        },
      });

      for (const item of returnItems) {
        const productId = Number(item.productId);
        const qty = safeNumber(item.quantity, 0);
        const soldQty = soldMap.get(productId) || 0;
        const returnedQty = returnedMap.get(productId) || 0;
        if (qty <= 0 || qty > soldQty - returnedQty) {
          throw new Error(`Invalid return quantity for product ${productId}.`);
        }
        const salesItem =
          item.salesItemId
            ? await tx.salesItem.findUnique({ where: { id: Number(item.salesItemId) } })
            : await tx.salesItem.findFirst({
                where: { salesInvoiceId: invoice.id, productId },
                orderBy: { id: "asc" },
              });
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
            salesItem?.costOfGoods && salesItem.quantity > 0 ? salesItem.costOfGoods / salesItem.quantity : 0,
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
      }

      const refundAmount = Math.min(safeNumber(req.body.refundAmount, 0), total);
      const paidAmount = Math.max(Number(invoice.paidAmount) - refundAmount, 0);
      const dueAmount = Math.max(Number(invoice.total) - paidAmount, 0);

      await tx.salesReturn.update({
        where: { id: createdReturn.id },
        data: {
          total,
          refundAmount,
        },
      });

      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount,
          dueAmount,
          status: invoiceStatus(invoice.total, paidAmount),
        },
      });

      if (invoice.customerId) {
        await tx.customerLedger.create({
          data: {
            customerId: invoice.customerId,
            branchId: invoice.branchId,
            salesInvoiceId: invoice.id,
            type: LedgerType.CREDIT,
            amount: total,
            note: `Sales return ${createdReturn.number} for invoice ${invoice.number}`,
          },
        });

        const points = Math.floor(total / 100);
        if (points > 0) {
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: { loyaltyPoints: { decrement: points } },
          });
          await tx.loyaltyTransaction.create({
            data: {
              customerId: invoice.customerId,
              points: -points,
              type: "REVERSAL",
              note: `Return ${createdReturn.number}`,
            },
          });
        }
      }

      return tx.salesReturn.findUnique({
        where: { id: createdReturn.id },
        include: { items: { include: { product: true } }, salesInvoice: true },
      });
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.CREATE,
      entityType: "sales_return",
      entityId: result.id,
      payload: { total: result.total },
    });

    res.status(201).json(result);
  },
);

export default router;
