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

const router = express.Router();

router.use(authRequired);

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
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!supplierId || items.length === 0) {
      return res.status(400).json({ message: "supplierId and items are required." });
    }

    const subtotal = items.reduce((sum, item) => {
      const qty = safeNumber(item.quantity, 0);
      const unitCost = safeNumber(item.unitCost, 0);
      const discount = safeNumber(item.discount, 0);
      return sum + qty * unitCost - discount;
    }, 0);
    const totals = computeTotals({
      subtotal,
      discount: safeNumber(req.body.discount, 0),
      tax: safeNumber(req.body.tax, 0),
      paidAmount: safeNumber(req.body.paidAmount, 0),
    });

    const created = await prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.create({
        data: {
          number: docNumber("PUR"),
          branchId,
          supplierId,
          status: PurchaseStatus.RECEIVED,
          invoiceDate: req.body.invoiceDate ? new Date(req.body.invoiceDate) : new Date(),
          subtotal,
          discount: safeNumber(req.body.discount, 0),
          tax: safeNumber(req.body.tax, 0),
          total: totals.total,
          paidAmount: totals.paid,
          dueAmount: totals.due,
          note: req.body.note || null,
          createdById: req.user.id,
        },
      });

      for (const item of items) {
        const qty = safeNumber(item.quantity, 0);
        const unitCost = safeNumber(item.unitCost, 0);
        const discount = safeNumber(item.discount, 0);
        const lineTotal = qty * unitCost - discount;
        const purchaseItem = await tx.purchaseItem.create({
          data: {
            purchaseInvoiceId: invoice.id,
            productId: Number(item.productId),
            quantity: qty,
            unitCost,
            discount,
            lineTotal,
            batchNumber: item.batchNumber || docNumber("BAT"),
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          },
        });

        await addStockBatch(tx, {
          productId: Number(item.productId),
          branchId,
          quantity: qty,
          unitCost,
          sellPrice: item.sellPrice ? safeNumber(item.sellPrice) : undefined,
          batchNumber: purchaseItem.batchNumber,
          expiryDate: purchaseItem.expiryDate,
          purchaseItemId: purchaseItem.id,
        });

        await tx.stockMovement.create({
          data: {
            productId: Number(item.productId),
            branchId,
            type: MovementType.PURCHASE,
            quantity: qty,
            unitCost,
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
            paymentMethod: req.body.paymentMethod || "CASH",
            reference: req.body.paymentReference || null,
            note: "Initial payment on purchase creation",
          },
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

    const updated = await prisma.$transaction(async (tx) => {
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: invoiceId },
      });
      if (!invoice) {
        throw new Error("Purchase invoice not found.");
      }

      const paidAmount = Math.min(Number(invoice.paidAmount) + amount, Number(invoice.total));
      const dueAmount = Math.max(Number(invoice.total) - paidAmount, 0);

      await tx.supplierPayment.create({
        data: {
          purchaseInvoiceId: invoice.id,
          supplierId: invoice.supplierId,
          amount,
          paymentMethod: req.body.paymentMethod || "CASH",
          paymentDate: req.body.paymentDate ? new Date(req.body.paymentDate) : new Date(),
          reference: req.body.reference || null,
          note: req.body.note || null,
        },
      });

      return tx.purchaseInvoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount,
          dueAmount,
        },
      });
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.UPDATE,
      entityType: "purchase_payment",
      entityId: updated.id,
      payload: { amount },
    });

    res.json(updated);
  },
);

export default router;
