import express from "express";
import {
  AuditAction,
  MovementType,
  PurchaseStatus,
  RoleCode,
} from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, authorizeRoles } from "../middleware/auth.js";
import { bodyBranchId, queryBranchId } from "../lib/scope.js";
import { computeTotals } from "../lib/calculations.js";
import { docNumber, safeNumber } from "../lib/common.js";
import { addStockBatch } from "../lib/stock.js";
import { logAudit } from "../lib/audit.js";
import {
  applyAccountMovement,
  ensureAccountHasFunds,
  normalizeAccountType,
} from "../lib/finance.js";

const router = express.Router();

router.use(authRequired);

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function derivePurchaseStatus(total, paidAmount, dueAmount) {
  const totalValue = safeNumber(total, 0);
  const paidValue = safeNumber(paidAmount, 0);
  const dueValue = safeNumber(dueAmount, 0);
  if (totalValue > 0 && dueValue <= 0) {
    return PurchaseStatus.RECEIVED;
  }
  if (paidValue > 0) {
    return PurchaseStatus.PARTIAL;
  }
  return PurchaseStatus.ORDERED;
}

async function findBranchScopedPurchaseInvoice(tx, req, invoiceId) {
  const branchId =
    req.user.role.code === RoleCode.ADMIN ? undefined : Number(req.user.branchId);
  return tx.purchaseInvoice.findFirst({
    where: {
      id: Number(invoiceId),
      ...(branchId ? { branchId } : {}),
    },
  });
}

router.get("/purchases", async (req, res) => {
  const branchId = queryBranchId(req);
  const purchases = await prisma.purchaseInvoice.findMany({
    where: { branchId },
    include: {
      supplier: true,
      items: { include: { product: true } },
      payments: true,
      createdBy: { select: { id: true, fullName: true } },
    },
    orderBy: { invoiceDate: "desc" },
  });
  res.json(purchases);
});

router.post(
  "/purchases",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.STOCK_KEEPER),
  async (req, res) => {
    const branchId = bodyBranchId(req, req.body.branchId);
    const supplierId = Number(req.body.supplierId);
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!supplierId || rawItems.length === 0) {
      return res.status(400).json({ message: "supplierId and items are required." });
    }
    const invoiceDiscount = safeNumber(req.body.discount, 0);
    const invoiceTax = safeNumber(req.body.tax, 0);
    const initialPaidAmount = safeNumber(req.body.paidAmount, 0);
    if (invoiceDiscount < 0 || invoiceTax < 0 || initialPaidAmount < 0) {
      return res
        .status(400)
        .json({ message: "discount, tax and paidAmount must be non-negative." });
    }
    const paymentMethod = normalizeAccountType(req.body.paymentMethod || "CASH");

    const created = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, branchId },
      });
      if (!supplier) {
        throw badRequest("Selected supplier does not belong to this branch.");
      }

      const productIds = [...new Set(rawItems.map((item) => Number(item.productId)).filter(Boolean))];
      if (productIds.length === 0) {
        throw badRequest("At least one valid product is required.");
      }
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          branchId,
          isActive: true,
        },
        select: { id: true, name: true },
      });
      if (products.length !== productIds.length) {
        throw badRequest("One or more selected products do not belong to this branch.");
      }
      const productMap = new Map(products.map((product) => [Number(product.id), product]));

      const items = rawItems.map((item, index) => {
        const productId = Number(item.productId);
        const qty = safeNumber(item.quantity, 0);
        const unitCost = safeNumber(item.unitCost, 0);
        const discount = safeNumber(item.discount, 0);
        if (!productMap.has(productId)) {
          throw badRequest(`Row ${index + 1}: invalid product.`);
        }
        if (qty <= 0) {
          throw badRequest(`Row ${index + 1}: quantity must be > 0.`);
        }
        if (unitCost < 0 || discount < 0) {
          throw badRequest(`Row ${index + 1}: unit cost and discount must be non-negative.`);
        }
        if (discount > qty * unitCost) {
          throw badRequest(`Row ${index + 1}: discount cannot exceed line amount.`);
        }
        return {
          productId,
          quantity: qty,
          unitCost,
          discount,
          lineTotal: qty * unitCost - discount,
          batchNumber: item.batchNumber || docNumber("BAT"),
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          sellPrice: item.sellPrice ? safeNumber(item.sellPrice) : undefined,
        };
      });

      const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
      const totals = computeTotals({
        subtotal,
        discount: invoiceDiscount,
        tax: invoiceTax,
        paidAmount: initialPaidAmount,
      });

      if (totals.paid > 0) {
        await ensureAccountHasFunds(tx, {
          branchId,
          paymentMethod,
          amount: totals.paid,
          purpose: "purchase initial payment",
        });
      }

      const invoice = await tx.purchaseInvoice.create({
        data: {
          number: docNumber("PUR"),
          branchId,
          supplierId,
          status: derivePurchaseStatus(totals.total, totals.paid, totals.due),
          invoiceDate: req.body.invoiceDate ? new Date(req.body.invoiceDate) : new Date(),
          subtotal,
          discount: invoiceDiscount,
          tax: invoiceTax,
          total: totals.total,
          paidAmount: totals.paid,
          dueAmount: totals.due,
          note: req.body.note || null,
          createdById: req.user.id,
        },
      });

      for (const item of items) {
        const purchaseItem = await tx.purchaseItem.create({
          data: {
            purchaseInvoiceId: invoice.id,
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            discount: item.discount,
            lineTotal: item.lineTotal,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
          },
        });

        await addStockBatch(tx, {
          productId: item.productId,
          branchId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          sellPrice: item.sellPrice,
          batchNumber: purchaseItem.batchNumber,
          expiryDate: purchaseItem.expiryDate,
          purchaseItemId: purchaseItem.id,
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            branchId,
            type: MovementType.PURCHASE,
            quantity: item.quantity,
            unitCost: item.unitCost,
            referenceType: "PURCHASE_INVOICE",
            referenceId: invoice.id,
            createdById: req.user.id,
          },
        });
      }

      if (totals.paid > 0) {
        await tx.supplierPayment.create({
          data: {
            purchaseInvoiceId: invoice.id,
            supplierId,
            amount: totals.paid,
            paymentDate: invoice.invoiceDate,
            paymentMethod,
            reference: req.body.paymentReference || null,
            note: "Initial payment on purchase creation",
          },
        });

        await applyAccountMovement(tx, {
          branchId,
          paymentMethod,
          amount: totals.paid,
          direction: "OUT",
          purpose: "purchase initial payment",
        });
      }

      return tx.purchaseInvoice.findUnique({
        where: { id: invoice.id },
        include: {
          items: { include: { product: true } },
          supplier: true,
          payments: true,
          branch: true,
        },
      });
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.CREATE,
      entityType: "purchase_invoice",
      entityId: created.id,
      payload: { number: created.number, total: created.total },
    });

    res.status(201).json(created);
  },
);

router.post(
  "/purchases/:id/payments",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER),
  async (req, res) => {
    const invoiceId = Number(req.params.id);
    const amount = safeNumber(req.body.amount, 0);
    if (amount <= 0) {
      return res.status(400).json({ message: "amount must be > 0" });
    }
    const paymentMethod = normalizeAccountType(req.body.paymentMethod || "CASH");

    const updated = await prisma.$transaction(async (tx) => {
      const invoice = await findBranchScopedPurchaseInvoice(tx, req, invoiceId);
      if (!invoice) {
        throw badRequest("Purchase invoice not found.");
      }
      if (Number(invoice.dueAmount || 0) <= 0) {
        throw badRequest("Invoice has no due amount.");
      }
      if (amount > Number(invoice.dueAmount)) {
        throw badRequest("Payment amount cannot exceed invoice due.");
      }

      await ensureAccountHasFunds(tx, {
        branchId: invoice.branchId,
        paymentMethod,
        amount,
        purpose: `purchase payment ${invoice.number}`,
      });

      const paidAmount = Number(invoice.paidAmount) + amount;
      const dueAmount = Math.max(Number(invoice.total) - paidAmount, 0);

      await tx.supplierPayment.create({
        data: {
          purchaseInvoiceId: invoice.id,
          supplierId: invoice.supplierId,
          amount,
          paymentMethod,
          paymentDate: req.body.paymentDate ? new Date(req.body.paymentDate) : new Date(),
          reference: req.body.reference || null,
          note: req.body.note || null,
        },
      });

      await applyAccountMovement(tx, {
        branchId: invoice.branchId,
        paymentMethod,
        amount,
        direction: "OUT",
        purpose: `purchase payment ${invoice.number}`,
      });

      return tx.purchaseInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount,
          dueAmount,
          status: derivePurchaseStatus(invoice.total, paidAmount, dueAmount),
        },
      });
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.UPDATE,
      entityType: "purchase_payment",
      entityId: updated.id,
      payload: { amount, paymentMethod },
    });

    res.json(updated);
  },
);

export default router;
