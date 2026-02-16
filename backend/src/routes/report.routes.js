import dayjs from "dayjs";
import express from "express";
import { LedgerType, RoleCode } from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, authorizeRoles } from "../middleware/auth.js";
import { parseDateRange } from "../lib/common.js";
import { queryBranchId } from "../lib/scope.js";

const router = express.Router();

router.use(authRequired);

router.get("/reports/dashboard", async (req, res) => {
  const branchId = queryBranchId(req);
  const start = dayjs().startOf("day").toDate();
  const end = dayjs().endOf("day").toDate();

  const [todaySales, lowStock, ledger] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: {
        branchId,
        invoiceDate: { gte: start, lte: end },
      },
      _sum: { total: true, paidAmount: true, dueAmount: true },
      _count: { id: true },
    }),
    (async () => {
      const products = await prisma.product.findMany({ where: { branchId, isActive: true } });
      const grouped = await prisma.stockBatch.groupBy({
        by: ["productId"],
        where: { branchId, quantityRemaining: { gt: 0 } },
        _sum: { quantityRemaining: true },
      });
      const stockMap = new Map(grouped.map((x) => [x.productId, x._sum.quantityRemaining || 0]));
      return products.filter((p) => (stockMap.get(p.id) || 0) <= Number(p.minStock || 0)).length;
    })(),
    prisma.customerLedger.findMany({
      where: { branchId },
      select: { type: true, amount: true },
    }),
  ]);

  const outstanding = ledger.reduce((acc, item) => {
    if (item.type === LedgerType.DEBIT) {
      return acc + Number(item.amount);
    }
    return acc - Number(item.amount);
  }, 0);

  res.json({
    todaySalesCount: todaySales._count.id || 0,
    todaySalesTotal: todaySales._sum.total || 0,
    todayCollected: todaySales._sum.paidAmount || 0,
    todayDue: todaySales._sum.dueAmount || 0,
    lowStockCount: lowStock,
    customerOutstanding: outstanding,
  });
});

router.get("/reports/daily-sales", async (req, res) => {
  const branchId = queryBranchId(req);
  const date = req.query.date ? dayjs(req.query.date) : dayjs();
  const start = date.startOf("day").toDate();
  const end = date.endOf("day").toDate();

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      branchId,
      invoiceDate: { gte: start, lte: end },
    },
    include: { customer: true, items: true, payments: true },
    orderBy: { invoiceDate: "asc" },
  });

  const totals = invoices.reduce(
    (acc, inv) => {
      acc.total += Number(inv.total);
      acc.paid += Number(inv.paidAmount);
      acc.due += Number(inv.dueAmount);
      return acc;
    },
    { total: 0, paid: 0, due: 0 },
  );

  res.json({
    date: date.format("YYYY-MM-DD"),
    invoiceCount: invoices.length,
    ...totals,
    invoices,
  });
});

router.get("/reports/profit", async (req, res) => {
  const branchId = queryBranchId(req);
  const { start, end } = parseDateRange({
    from: req.query.from,
    to: req.query.to,
  });

  const items = await prisma.salesItem.findMany({
    where: {
      salesInvoice: {
        branchId,
        invoiceDate: { gte: start, lte: end },
      },
    },
    select: {
      lineTotal: true,
      costOfGoods: true,
      quantity: true,
    },
  });

  const revenue = items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
  const cost = items.reduce((sum, item) => sum + Number(item.costOfGoods), 0);
  const grossProfit = revenue - cost;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  res.json({
    from: start,
    to: end,
    revenue,
    cost,
    grossProfit,
    margin,
    soldUnits: items.reduce((sum, item) => sum + Number(item.quantity), 0),
  });
});

router.get("/reports/best-selling", async (req, res) => {
  const branchId = queryBranchId(req);
  const { start, end } = parseDateRange({
    from: req.query.from,
    to: req.query.to,
  });
  const limit = Number(req.query.limit || 10);

  const grouped = await prisma.salesItem.groupBy({
    by: ["productId"],
    where: {
      salesInvoice: {
        branchId,
        invoiceDate: { gte: start, lte: end },
      },
    },
    _sum: {
      quantity: true,
      lineTotal: true,
    },
    orderBy: {
      _sum: { quantity: "desc" },
    },
    take: limit,
  });

  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId) } },
    select: { id: true, name: true, sku: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  res.json(
    grouped.map((g) => ({
      productId: g.productId,
      name: productMap.get(g.productId)?.name || "Unknown",
      sku: productMap.get(g.productId)?.sku || null,
      quantity: g._sum.quantity || 0,
      revenue: g._sum.lineTotal || 0,
    })),
  );
});

router.get("/reports/slow-moving", async (req, res) => {
  const branchId = queryBranchId(req);
  const { start, end } = parseDateRange({
    from: req.query.from || dayjs().subtract(90, "day").format("YYYY-MM-DD"),
    to: req.query.to || dayjs().format("YYYY-MM-DD"),
  });
  const limit = Number(req.query.limit || 20);

  const [products, soldAgg, stockAgg] = await Promise.all([
    prisma.product.findMany({
      where: { branchId, isActive: true },
      include: { baseUnit: true, category: true },
    }),
    prisma.salesItem.groupBy({
      by: ["productId"],
      where: {
        salesInvoice: { branchId, invoiceDate: { gte: start, lte: end } },
      },
      _sum: { quantity: true },
    }),
    prisma.stockBatch.groupBy({
      by: ["productId"],
      where: { branchId, quantityRemaining: { gt: 0 } },
      _sum: { quantityRemaining: true },
    }),
  ]);

  const soldMap = new Map(soldAgg.map((s) => [s.productId, s._sum.quantity || 0]));
  const stockMap = new Map(stockAgg.map((s) => [s.productId, s._sum.quantityRemaining || 0]));

  const slow = products
    .map((p) => ({
      productId: p.id,
      name: p.name,
      sku: p.sku,
      soldQuantity: soldMap.get(p.id) || 0,
      currentStock: stockMap.get(p.id) || 0,
      minStock: p.minStock,
      unit: p.baseUnit.name,
      category: p.category?.name || null,
    }))
    .sort((a, b) => a.soldQuantity - b.soldQuantity || b.currentStock - a.currentStock)
    .slice(0, limit);

  res.json(slow);
});

router.get("/reports/expenses", async (req, res) => {
  const branchId = queryBranchId(req);
  const { start, end } = parseDateRange({
    from: req.query.from,
    to: req.query.to,
  });

  const expenses = await prisma.expense.findMany({
    where: {
      branchId,
      expenseDate: { gte: start, lte: end },
    },
    include: { category: true },
  });

  const byCategoryMap = new Map();
  for (const e of expenses) {
    const key = e.category?.name || "Uncategorized";
    byCategoryMap.set(key, (byCategoryMap.get(key) || 0) + Number(e.amount));
  }

  res.json({
    total: expenses.reduce((sum, e) => sum + Number(e.amount), 0),
    count: expenses.length,
    byCategory: [...byCategoryMap.entries()].map(([name, amount]) => ({ name, amount })),
    expenses,
  });
});

router.get(
  "/reports/branch-summary",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER),
  async (req, res) => {
    const { start, end } = parseDateRange({
      from: req.query.from,
      to: req.query.to,
    });
    const branchFilter =
      req.user.role.code === RoleCode.ADMIN
        ? {}
        : { id: Number(req.user.branchId) };
    const branches = await prisma.branch.findMany({
      where: branchFilter,
      orderBy: { id: "asc" },
    });

    const summaries = [];
    for (const branch of branches) {
      const [sales, expenses, batches, lowStock] = await Promise.all([
        prisma.salesInvoice.aggregate({
          where: { branchId: branch.id, invoiceDate: { gte: start, lte: end } },
          _sum: { total: true, paidAmount: true, dueAmount: true },
          _count: { id: true },
        }),
        prisma.expense.aggregate({
          where: { branchId: branch.id, expenseDate: { gte: start, lte: end } },
          _sum: { amount: true },
        }),
        prisma.stockBatch.findMany({
          where: { branchId: branch.id, quantityRemaining: { gt: 0 } },
          select: { quantityRemaining: true, unitCost: true },
        }),
        (async () => {
          const products = await prisma.product.findMany({ where: { branchId: branch.id, isActive: true } });
          const grouped = await prisma.stockBatch.groupBy({
            by: ["productId"],
            where: { branchId: branch.id, quantityRemaining: { gt: 0 } },
            _sum: { quantityRemaining: true },
          });
          const map = new Map(grouped.map((x) => [x.productId, x._sum.quantityRemaining || 0]));
          return products.filter((p) => (map.get(p.id) || 0) <= Number(p.minStock || 0)).length;
        })(),
      ]);

      const stockValue = batches.reduce(
        (sum, b) => sum + Number(b.quantityRemaining) * Number(b.unitCost),
        0,
      );

      summaries.push({
        branchId: branch.id,
        branchCode: branch.code,
        branchName: branch.name,
        invoices: sales._count.id || 0,
        salesTotal: sales._sum.total || 0,
        collected: sales._sum.paidAmount || 0,
        due: sales._sum.dueAmount || 0,
        expenses: expenses._sum.amount || 0,
        stockValue,
        lowStockItems: lowStock,
      });
    }

    res.json({
      from: start,
      to: end,
      branches: summaries,
    });
  },
);

export default router;
