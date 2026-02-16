import express from "express";
import { AuditAction, MovementType, RoleCode } from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, authorizeRoles } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import { bodyBranchId, queryBranchId } from "../lib/scope.js";
import { docNumber, safeNumber } from "../lib/common.js";
import { addStockBatch, consumeStockFIFO, getProductStock } from "../lib/stock.js";

const router = express.Router();

router.use(authRequired);

router.get("/products", async (req, res) => {
  const branchId = queryBranchId(req);
  const search = String(req.query.search || "").trim();
  const products = await prisma.product.findMany({
    where: {
      branchId,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { sku: { contains: search } },
              { barcode: { contains: search } },
            ],
          }
        : {}),
    },
    include: {
      category: true,
      baseUnit: true,
      supplier: true,
      units: { include: { unit: true } },
    },
    orderBy: { name: "asc" },
  });

  const groupedStock = await prisma.stockBatch.groupBy({
    by: ["productId"],
    where: {
      branchId,
      quantityRemaining: { gt: 0 },
    },
    _sum: { quantityRemaining: true },
  });
  const stockMap = new Map(groupedStock.map((x) => [x.productId, x._sum.quantityRemaining || 0]));

  res.json(
    products.map((p) => ({
      ...p,
      stock: stockMap.get(p.id) || 0,
    })),
  );
});

router.post(
  "/products",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.STOCK_KEEPER),
  async (req, res) => {
    const branchId = bodyBranchId(req, req.body.branchId);
    const units = Array.isArray(req.body.units) ? req.body.units : [];
    const baseUnitId = Number(req.body.baseUnitId);
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          branchId,
          name: req.body.name,
          sku: req.body.sku,
          barcode: req.body.barcode || null,
          categoryId: req.body.categoryId ? Number(req.body.categoryId) : null,
          baseUnitId,
          supplierId: req.body.supplierId ? Number(req.body.supplierId) : null,
          minStock: safeNumber(req.body.minStock, 0),
          sellPrice: safeNumber(req.body.sellPrice, 0),
          description: req.body.description || null,
          isActive: req.body.isActive ?? true,
        },
      });

      await tx.productUnit.upsert({
        where: {
          productId_unitId: {
            productId: created.id,
            unitId: baseUnitId,
          },
        },
        update: { conversionFactor: 1, isDefault: true },
        create: {
          productId: created.id,
          unitId: baseUnitId,
          conversionFactor: 1,
          isDefault: true,
        },
      });

      for (const unit of units) {
        if (!unit.unitId) {
          continue;
        }
        await tx.productUnit.upsert({
          where: {
            productId_unitId: {
              productId: created.id,
              unitId: Number(unit.unitId),
            },
          },
          update: {
            conversionFactor: safeNumber(unit.conversionFactor, 1),
            isDefault: Boolean(unit.isDefault),
          },
          create: {
            productId: created.id,
            unitId: Number(unit.unitId),
            conversionFactor: safeNumber(unit.conversionFactor, 1),
            isDefault: Boolean(unit.isDefault),
          },
        });
      }

      return tx.product.findUnique({
        where: { id: created.id },
        include: { units: { include: { unit: true } }, category: true, supplier: true, baseUnit: true },
      });
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.CREATE,
      entityType: "product",
      entityId: product.id,
      payload: { name: product.name, sku: product.sku },
    });

    res.status(201).json(product);
  },
);

router.put(
  "/products/:id",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.STOCK_KEEPER),
  async (req, res) => {
    const product = await prisma.product.update({
      where: { id: Number(req.params.id) },
      data: {
        name: req.body.name,
        sku: req.body.sku,
        barcode: req.body.barcode || null,
        categoryId: req.body.categoryId ? Number(req.body.categoryId) : null,
        baseUnitId: req.body.baseUnitId ? Number(req.body.baseUnitId) : undefined,
        supplierId: req.body.supplierId ? Number(req.body.supplierId) : null,
        minStock: safeNumber(req.body.minStock, 0),
        sellPrice: safeNumber(req.body.sellPrice, 0),
        description: req.body.description || null,
        isActive: req.body.isActive ?? true,
      },
    });
    await logAudit({
      userId: req.user.id,
      action: AuditAction.UPDATE,
      entityType: "product",
      entityId: product.id,
    });
    res.json(product);
  },
);

router.get("/products/:id/stock", async (req, res) => {
  const productId = Number(req.params.id);
  const branchId = queryBranchId(req);
  const [stock, batches, moves] = await Promise.all([
    getProductStock(prisma, productId, branchId),
    prisma.stockBatch.findMany({
      where: { productId, branchId, quantityRemaining: { gt: 0 } },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.stockMovement.findMany({
      where: { productId, branchId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  res.json({ stock, batches, moves });
});

router.post(
  "/stock/adjust",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.STOCK_KEEPER),
  async (req, res) => {
    const { productId, quantity, unitCost = 0, sellPrice = 0, note, batchNumber, expiryDate } = req.body;
    const branchId = bodyBranchId(req, req.body.branchId);
    const qty = safeNumber(quantity, 0);
    if (!productId || qty === 0) {
      return res.status(400).json({ message: "productId and non-zero quantity are required." });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (qty > 0) {
        await addStockBatch(tx, {
          productId: Number(productId),
          branchId,
          quantity: qty,
          unitCost: safeNumber(unitCost, 0),
          sellPrice: safeNumber(sellPrice, 0),
          batchNumber: batchNumber || docNumber("ADJ"),
          expiryDate: expiryDate || null,
        });
      } else {
        await consumeStockFIFO(tx, {
          productId: Number(productId),
          branchId,
          quantity: Math.abs(qty),
        });
      }

      await tx.stockMovement.create({
        data: {
          productId: Number(productId),
          branchId,
          type: MovementType.ADJUSTMENT,
          quantity: qty,
          unitCost: safeNumber(unitCost, 0),
          note: note || null,
          referenceType: "STOCK_ADJUSTMENT",
          createdById: req.user.id,
        },
      });

      const currentStock = await getProductStock(tx, Number(productId), branchId);
      return { currentStock };
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.UPDATE,
      entityType: "stock_adjustment",
      payload: { productId: Number(productId), branchId, quantity: qty },
    });

    res.json({ message: "Stock adjusted.", ...result });
  },
);

router.get("/alerts/low-stock", async (req, res) => {
  const branchId = queryBranchId(req);
  const products = await prisma.product.findMany({
    where: { branchId, isActive: true },
    include: { baseUnit: true, category: true },
  });
  const grouped = await prisma.stockBatch.groupBy({
    by: ["productId"],
    where: { branchId, quantityRemaining: { gt: 0 } },
    _sum: { quantityRemaining: true },
  });
  const stockMap = new Map(grouped.map((x) => [x.productId, x._sum.quantityRemaining || 0]));
  const low = products
    .map((p) => ({
      ...p,
      stock: stockMap.get(p.id) || 0,
    }))
    .filter((p) => p.stock <= Number(p.minStock || 0))
    .sort((a, b) => a.stock - b.stock);
  res.json(low);
});

router.get("/alerts/expiry", async (req, res) => {
  const branchId = queryBranchId(req);
  const days = Number(req.query.days || 30);
  const toDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const batches = await prisma.stockBatch.findMany({
    where: {
      branchId,
      quantityRemaining: { gt: 0 },
      expiryDate: {
        not: null,
        lte: toDate,
      },
    },
    include: {
      product: { select: { id: true, name: true, sku: true } },
    },
    orderBy: [{ expiryDate: "asc" }],
  });
  res.json(batches);
});

export default router;
