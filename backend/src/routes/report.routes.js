import dayjs from "dayjs";
import express from "express";
import { LedgerType, RoleCode } from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, authorizeRoles } from "../middleware/auth.js";
import { parseDateRange } from "../lib/common.js";
import { queryBranchId } from "../lib/scope.js";
import { getAccountBalances } from "../lib/finance.js";

const router = express.Router();

router.use(authRequired);

router.get("/reports/dashboard", async (req, res) => {
  const branchId = queryBranchId(req);
  const dayStart = dayjs().startOf("day").toDate();
  const dayEnd = dayjs().endOf("day").toDate();
  const monthStart = dayjs().startOf("month").toDate();
  const monthEnd = dayjs().endOf("month").toDate();

  const [
    todaySales,
    monthSales,
    monthSalesItems,
    lowStock,
    ledger,
    purchaseDue,
    monthExpenses,
    stockBatches,
    accountBalances,
    topSellingRows,
  ] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: {
        branchId,
        invoiceDate: { gte: dayStart, lte: dayEnd },
      },
      _sum: { total: true, paidAmount: true, dueAmount: true },
      _count: { id: true },
    }),
    prisma.salesInvoice.aggregate({
      where: {
        branchId,
        invoiceDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { total: true, paidAmount: true, dueAmount: true },
      _count: { id: true },
    }),
    prisma.salesItem.aggregate({
      where: {
        salesInvoice: {
          branchId,
          invoiceDate: { gte: monthStart, lte: monthEnd },
        },
      },
      _sum: {
        lineTotal: true,
        costOfGoods: true,
        quantity: true,
      },
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
    prisma.purchaseInvoice.aggregate({
      where: { branchId },
      _sum: { dueAmount: true },
    }),
    prisma.expense.aggregate({
      where: {
        branchId,
        expenseDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    }),
    prisma.stockBatch.findMany({
      where: { branchId, quantityRemaining: { gt: 0 } },
      select: { quantityRemaining: true, unitCost: true },
    }),
    getAccountBalances(prisma, branchId),
    prisma.salesItem.groupBy({
      by: ["productId"],
      where: {
        salesInvoice: {
          branchId,
          invoiceDate: { gte: monthStart, lte: monthEnd },
        },
      },
      _sum: {
        quantity: true,
        lineTotal: true,
      },
      orderBy: {
        _sum: { quantity: "desc" },
      },
      take: 5,
    }),
  ]);

  const outstanding = ledger.reduce((acc, item) => {
    if (item.type === LedgerType.DEBIT) {
      return acc + Number(item.amount);
    }
    return acc - Number(item.amount);
  }, 0);

  const inventoryValue = stockBatches.reduce(
    (sum, batch) => sum + Number(batch.quantityRemaining || 0) * Number(batch.unitCost || 0),
    0,
  );
  const monthRevenue = Number(monthSalesItems._sum.lineTotal || 0);
  const monthCost = Number(monthSalesItems._sum.costOfGoods || 0);
  const monthProfit = monthRevenue - monthCost;
  const topProductIds = topSellingRows.map((row) => row.productId);
  const topProducts = topProductIds.length
    ? await prisma.product.findMany({
        where: { id: { in: topProductIds } },
        select: { id: true, name: true, sku: true },
      })
    : [];
  const productMap = new Map(topProducts.map((product) => [product.id, product]));

  res.json({
    todaySalesCount: todaySales._count.id || 0,
    todaySalesTotal: todaySales._sum.total || 0,
    todayCollected: todaySales._sum.paidAmount || 0,
    todayDue: todaySales._sum.dueAmount || 0,
    monthSalesCount: monthSales._count.id || 0,
    monthSalesTotal: monthSales._sum.total || 0,
    monthCollected: monthSales._sum.paidAmount || 0,
    monthDue: monthSales._sum.dueAmount || 0,
    monthProfit,
    monthExpenses: monthExpenses._sum.amount || 0,
    supplierOutstanding: purchaseDue._sum.dueAmount || 0,
    inventoryValue,
    lowStockCount: lowStock,
    customerOutstanding: outstanding,
    accountBalances,
    topProducts: topSellingRows.map((row) => ({
      productId: row.productId,
      name: productMap.get(row.productId)?.name || "Unknown",
      sku: productMap.get(row.productId)?.sku || null,
      quantity: row._sum.quantity || 0,
      revenue: row._sum.lineTotal || 0,
    })),
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

router.get("/reports/accounts-receivable", async (req, res) => {
  const branchId = queryBranchId(req);
  const customers = await prisma.customer.findMany({
    where: { branchId },
    select: { id: true, name: true, phone: true, email: true },
    orderBy: { name: "asc" },
  });

  if (customers.length === 0) {
    return res.json({
      count: 0,
      totalOutstanding: 0,
      customers: [],
    });
  }

  const customerIds = customers.map((customer) => customer.id);
  const [ledgerRows, salesSummary] = await Promise.all([
    prisma.customerLedger.groupBy({
      by: ["customerId", "type"],
      where: {
        branchId,
        customerId: { in: customerIds },
      },
      _sum: { amount: true },
    }),
    prisma.salesInvoice.groupBy({
      by: ["customerId"],
      where: {
        branchId,
        customerId: { in: customerIds },
      },
      _sum: { dueAmount: true, total: true },
      _count: { id: true },
      _max: { invoiceDate: true },
    }),
  ]);

  const ledgerByCustomer = new Map();
  for (const row of ledgerRows) {
    const current = ledgerByCustomer.get(row.customerId) || { debit: 0, credit: 0 };
    if (row.type === "DEBIT") {
      current.debit += Number(row._sum.amount || 0);
    } else {
      current.credit += Number(row._sum.amount || 0);
    }
    ledgerByCustomer.set(row.customerId, current);
  }
  const salesByCustomer = new Map(salesSummary.map((row) => [row.customerId, row]));

  const receivables = customers
    .map((customer) => {
      const ledger = ledgerByCustomer.get(customer.id) || { debit: 0, credit: 0 };
      const sales = salesByCustomer.get(customer.id);
      const outstanding = Number(ledger.debit || 0) - Number(ledger.credit || 0);
      return {
        customerId: customer.id,
        name: customer.name,
        phone: customer.phone || null,
        email: customer.email || null,
        invoices: sales?._count?.id || 0,
        totalSales: Number(sales?._sum?.total || 0),
        dueOnInvoices: Number(sales?._sum?.dueAmount || 0),
        outstanding,
        lastInvoiceDate: sales?._max?.invoiceDate || null,
      };
    })
    .filter((row) => row.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  return res.json({
    count: receivables.length,
    totalOutstanding: receivables.reduce((sum, row) => sum + row.outstanding, 0),
    customers: receivables,
  });
});

router.get("/reports/accounts-payable", async (req, res) => {
  const branchId = queryBranchId(req);
  const suppliers = await prisma.supplier.findMany({
    where: { branchId },
    select: { id: true, name: true, contactPerson: true, phone: true },
    orderBy: { name: "asc" },
  });

  if (suppliers.length === 0) {
    return res.json({
      count: 0,
      totalOutstanding: 0,
      suppliers: [],
    });
  }

  const supplierIds = suppliers.map((supplier) => supplier.id);
  const [invoiceSummary, paymentsSummary] = await Promise.all([
    prisma.purchaseInvoice.groupBy({
      by: ["supplierId"],
      where: {
        branchId,
        supplierId: { in: supplierIds },
      },
      _sum: { total: true, paidAmount: true, dueAmount: true },
      _count: { id: true },
      _max: { invoiceDate: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ["supplierId"],
      where: {
        supplierId: { in: supplierIds },
      },
      _sum: { amount: true },
      _count: { id: true },
      _max: { paymentDate: true },
    }),
  ]);

  const invoiceMap = new Map(invoiceSummary.map((row) => [row.supplierId, row]));
  const paymentMap = new Map(paymentsSummary.map((row) => [row.supplierId, row]));

  const payableRows = suppliers
    .map((supplier) => {
      const invoice = invoiceMap.get(supplier.id);
      const payments = paymentMap.get(supplier.id);
      const outstanding = Number(invoice?._sum?.dueAmount || 0);
      return {
        supplierId: supplier.id,
        name: supplier.name,
        contactPerson: supplier.contactPerson || null,
        phone: supplier.phone || null,
        invoices: invoice?._count?.id || 0,
        totalPurchased: Number(invoice?._sum?.total || 0),
        paidOnInvoices: Number(invoice?._sum?.paidAmount || 0),
        outstanding,
        paymentCount: payments?._count?.id || 0,
        totalPayments: Number(payments?._sum?.amount || 0),
        lastInvoiceDate: invoice?._max?.invoiceDate || null,
        lastPaymentDate: payments?._max?.paymentDate || null,
      };
    })
    .filter((row) => row.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  return res.json({
    count: payableRows.length,
    totalOutstanding: payableRows.reduce((sum, row) => sum + row.outstanding, 0),
    suppliers: payableRows,
  });
});

router.get("/reports/cash-flow", async (req, res) => {
  const branchId = queryBranchId(req);
  const { start, end } = parseDateRange({
    from: req.query.from,
    to: req.query.to,
  });

  const [salesPayments, supplierPayments, expenses] = await Promise.all([
    prisma.salesPayment.findMany({
      where: {
        paymentDate: { gte: start, lte: end },
        salesInvoice: { branchId },
      },
      select: { amount: true, paymentMethod: true, paymentDate: true },
    }),
    prisma.supplierPayment.findMany({
      where: {
        paymentDate: { gte: start, lte: end },
        supplier: { branchId },
      },
      select: { amount: true, paymentMethod: true, paymentDate: true },
    }),
    prisma.expense.findMany({
      where: {
        branchId,
        expenseDate: { gte: start, lte: end },
      },
      select: { amount: true, paymentMethod: true, expenseDate: true },
    }),
  ]);

  const methods = ["CASH", "BANK", "CARD", "OTHER"];
  const byMethod = new Map(
    methods.map((method) => [
      method,
      {
        method,
        inflow: 0,
        outflow: 0,
        net: 0,
      },
    ]),
  );

  for (const payment of salesPayments) {
    const method = methods.includes(String(payment.paymentMethod || "").toUpperCase())
      ? String(payment.paymentMethod).toUpperCase()
      : "OTHER";
    const row = byMethod.get(method);
    row.inflow += Number(payment.amount || 0);
  }
  for (const payment of supplierPayments) {
    const method = methods.includes(String(payment.paymentMethod || "").toUpperCase())
      ? String(payment.paymentMethod).toUpperCase()
      : "OTHER";
    const row = byMethod.get(method);
    row.outflow += Number(payment.amount || 0);
  }
  for (const expense of expenses) {
    const method = methods.includes(String(expense.paymentMethod || "").toUpperCase())
      ? String(expense.paymentMethod).toUpperCase()
      : "OTHER";
    const row = byMethod.get(method);
    row.outflow += Number(expense.amount || 0);
  }
  const rows = [...byMethod.values()].map((row) => ({
    ...row,
    net: row.inflow - row.outflow,
  }));

  return res.json({
    from: start,
    to: end,
    inflow: rows.reduce((sum, row) => sum + row.inflow, 0),
    outflow: rows.reduce((sum, row) => sum + row.outflow, 0),
    net: rows.reduce((sum, row) => sum + row.net, 0),
    byMethod: rows,
    salesPaymentCount: salesPayments.length,
    supplierPaymentCount: supplierPayments.length,
    expenseCount: expenses.length,
  });
});

router.get("/reports/income-statement", async (req, res) => {
  const branchId = queryBranchId(req);
  const { start, end } = parseDateRange({
    from: req.query.from,
    to: req.query.to,
  });

  const [salesItems, expenseSummary] = await Promise.all([
    prisma.salesItem.findMany({
      where: {
        salesInvoice: {
          branchId,
          invoiceDate: { gte: start, lte: end },
        },
      },
      select: {
        lineTotal: true,
        costOfGoods: true,
      },
    }),
    prisma.expense.aggregate({
      where: {
        branchId,
        expenseDate: { gte: start, lte: end },
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  const revenue = salesItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const costOfGoods = salesItems.reduce((sum, item) => sum + Number(item.costOfGoods || 0), 0);
  const grossProfit = revenue - costOfGoods;
  const operatingExpense = Number(expenseSummary._sum.amount || 0);
  const netProfit = grossProfit - operatingExpense;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  return res.json({
    from: start,
    to: end,
    revenue,
    costOfGoods,
    grossProfit,
    grossMargin,
    operatingExpense,
    netProfit,
    netMargin,
    expenseCount: expenseSummary._count.id || 0,
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
