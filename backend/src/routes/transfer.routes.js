import express from "express";
import {
  AuditAction,
  MovementType,
  RoleCode,
  TransferStatus,
} from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, authorizeRoles } from "../middleware/auth.js";
import { addStockBatch, consumeStockFIFO } from "../lib/stock.js";
import { docNumber, safeNumber } from "../lib/common.js";
import { logAudit } from "../lib/audit.js";

const router = express.Router();

router.use(authRequired);

router.get("/transfers", async (req, res) => {
  const where =
    req.user.role.code === RoleCode.ADMIN
      ? {}
      : {
          OR: [{ sourceBranchId: Number(req.user.branchId) }, { targetBranchId: Number(req.user.branchId) }],
        };
  const transfers = await prisma.stockTransfer.findMany({
    where,
    include: {
      sourceBranch: true,
      targetBranch: true,
      items: { include: { product: true } },
      createdBy: { select: { id: true, fullName: true } },
    },
    orderBy: { transferDate: "desc" },
  });
  res.json(transfers);
});

router.post(
  "/transfers",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.STOCK_KEEPER),
  async (req, res) => {
    const sourceBranchId = Number(req.body.sourceBranchId);
    const targetBranchId = Number(req.body.targetBranchId);
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!sourceBranchId || !targetBranchId || sourceBranchId === targetBranchId || items.length === 0) {
      return res.status(400).json({ message: "Invalid source/target branch or items." });
    }

    const transfer = await prisma.$transaction(async (tx) => {
      const created = await tx.stockTransfer.create({
        data: {
          number: docNumber("TRF"),
          sourceBranchId,
          targetBranchId,
          transferDate: req.body.transferDate ? new Date(req.body.transferDate) : new Date(),
          status: TransferStatus.COMPLETED,
          note: req.body.note || null,
          createdById: req.user.id,
        },
      });

      for (const item of items) {
        const productId = Number(item.productId);
        const qty = safeNumber(item.quantity, 0);
        if (qty <= 0) {
          throw new Error("Transfer quantity must be greater than zero.");
        }
        const { costOfGoods } = await consumeStockFIFO(tx, {
          productId,
          branchId: sourceBranchId,
          quantity: qty,
        });
        const unitCost = qty > 0 ? costOfGoods / qty : 0;

        await tx.stockTransferItem.create({
          data: {
            stockTransferId: created.id,
            productId,
            quantity: qty,
            unitCost,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId,
            branchId: sourceBranchId,
            type: MovementType.TRANSFER_OUT,
            quantity: -qty,
            unitCost,
            referenceType: "STOCK_TRANSFER",
            referenceId: created.id,
            createdById: req.user.id,
          },
        });

        await addStockBatch(tx, {
          productId,
          branchId: targetBranchId,
          quantity: qty,
          unitCost,
          sellPrice: item.sellPrice ? safeNumber(item.sellPrice) : 0,
          batchNumber: `TRF-${created.number}`,
          expiryDate: null,
        });

        await tx.stockMovement.create({
          data: {
            productId,
            branchId: targetBranchId,
            type: MovementType.TRANSFER_IN,
            quantity: qty,
            unitCost,
            referenceType: "STOCK_TRANSFER",
            referenceId: created.id,
            createdById: req.user.id,
          },
        });
      }

      return tx.stockTransfer.findUnique({
        where: { id: created.id },
        include: {
          items: { include: { product: true } },
          sourceBranch: true,
          targetBranch: true,
        },
      });
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.CREATE,
      entityType: "stock_transfer",
      entityId: transfer.id,
      payload: { number: transfer.number },
    });

    res.status(201).json(transfer);
  },
);

export default router;
