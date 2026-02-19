import { LedgerType } from "@prisma/client";
import { getAccountBalances } from "./finance.js";
import { money, resolveFiscalYearPeriod } from "./company.js";

export async function computeProfitSummary(tx, { branchId, start, end }) {
  const salesWhere = {
    salesInvoice: {
      branchId,
      ...(start || end
        ? {
            invoiceDate: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
    },
  };
  const expenseWhere = {
    branchId,
    ...(start || end
      ? {
          expenseDate: {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
          },
        }
      : {}),
  };

  const [salesItems, expenses] = await Promise.all([
    tx.salesItem.aggregate({
      where: salesWhere,
      _sum: { lineTotal: true, costOfGoods: true },
    }),
    tx.expense.aggregate({
      where: expenseWhere,
      _sum: { amount: true },
    }),
  ]);

  const revenue = money(salesItems._sum.lineTotal || 0);
  const costOfGoods = money(salesItems._sum.costOfGoods || 0);
  const operatingExpense = money(expenses._sum.amount || 0);
  const grossProfit = money(revenue - costOfGoods);
  const netProfit = money(grossProfit - operatingExpense);

  return {
    revenue,
    costOfGoods,
    grossProfit,
    operatingExpense,
    netProfit,
  };
}

function toClosedMeta(record) {
  if (!record) {
    return null;
  }
  return {
    id: record.id,
    fiscalYear: record.fiscalYear,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    closedAt: record.closedAt,
    note: record.note || null,
    closedBy: record.closedBy
      ? {
          id: record.closedBy.id,
          username: record.closedBy.username,
          fullName: record.closedBy.fullName,
        }
      : null,
  };
}

export async function buildBalanceSheetReport(tx, { company, branchId }) {
  const [
    branch,
    accountBalances,
    ledgerByType,
    payables,
    stockBatches,
    allTimeProfit,
    withdrawalSummary,
  ] = await Promise.all([
    tx.branch.findUnique({
      where: { id: branchId },
      select: { id: true, code: true, name: true },
    }),
    getAccountBalances(tx, branchId),
    tx.customerLedger.groupBy({
      by: ["type"],
      where: { branchId },
      _sum: { amount: true },
    }),
    tx.purchaseInvoice.aggregate({
      where: { branchId },
      _sum: { dueAmount: true },
    }),
    tx.stockBatch.findMany({
      where: { branchId, quantityRemaining: { gt: 0 } },
      select: { quantityRemaining: true, unitCost: true },
    }),
    computeProfitSummary(tx, { branchId }),
    tx.ownerWithdrawal.aggregate({
      where: { companyId: company.id, branchId },
      _sum: { amount: true },
    }),
  ]);

  if (!branch) {
    return null;
  }

  const receivables = ledgerByType.reduce((sum, row) => {
    const value = Number(row._sum.amount || 0);
    if (row.type === LedgerType.DEBIT) {
      return sum + value;
    }
    return sum - value;
  }, 0);
  const accountsTotal = money(accountBalances.total || 0);
  const inventoryValue = money(
    stockBatches.reduce(
      (sum, batch) => sum + Number(batch.quantityRemaining || 0) * Number(batch.unitCost || 0),
      0,
    ),
  );
  const assetsTotal = money(accountsTotal + receivables + inventoryValue);

  const supplierPayables = money(payables._sum.dueAmount || 0);
  const liabilitiesTotal = supplierPayables;

  const openingCapital = money(company.openingCapital || 0);
  const retainedEarnings = money(allTimeProfit.netProfit || 0);
  const ownerWithdrawals = money(withdrawalSummary._sum.amount || 0);
  const equityTotal = money(openingCapital + retainedEarnings - ownerWithdrawals);

  const liabilitiesAndEquity = money(liabilitiesTotal + equityTotal);
  const balanceGap = money(assetsTotal - liabilitiesAndEquity);

  return {
    generatedAt: new Date(),
    company: {
      id: company.id,
      name: company.name,
      ownerName: company.ownerName,
    },
    branch,
    assets: {
      cashAndAccounts: accountsTotal,
      accountBreakdown: accountBalances.balances,
      inventoryValue,
      receivables: money(receivables),
      total: assetsTotal,
    },
    liabilities: {
      supplierPayables,
      total: liabilitiesTotal,
    },
    equity: {
      openingCapital,
      retainedEarnings,
      ownerWithdrawals,
      total: equityTotal,
    },
    equation: {
      assets: assetsTotal,
      liabilitiesAndEquity,
      balanceGap,
    },
  };
}

export async function buildYearEndOwnerReport(tx, { company, branchId, fiscalYear }) {
  const period = resolveFiscalYearPeriod(company, fiscalYear);

  const [
    branch,
    salesSummary,
    purchaseSummary,
    profit,
    withdrawalSummary,
    accountBalances,
    yearEndReceivables,
    yearEndPayables,
    closeRecord,
  ] = await Promise.all([
    tx.branch.findUnique({
      where: { id: branchId },
      select: { id: true, code: true, name: true },
    }),
    tx.salesInvoice.aggregate({
      where: {
        branchId,
        invoiceDate: {
          gte: period.periodStart,
          lte: period.periodEnd,
        },
      },
      _sum: { total: true, paidAmount: true, dueAmount: true },
      _count: { id: true },
    }),
    tx.purchaseInvoice.aggregate({
      where: {
        branchId,
        invoiceDate: {
          gte: period.periodStart,
          lte: period.periodEnd,
        },
      },
      _sum: { total: true, paidAmount: true, dueAmount: true },
      _count: { id: true },
    }),
    computeProfitSummary(tx, {
      branchId,
      start: period.periodStart,
      end: period.periodEnd,
    }),
    tx.ownerWithdrawal.aggregate({
      where: {
        companyId: company.id,
        branchId,
        withdrawnAt: {
          gte: period.periodStart,
          lte: period.periodEnd,
        },
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
    getAccountBalances(tx, branchId),
    tx.customerLedger.groupBy({
      by: ["type"],
      where: { branchId },
      _sum: { amount: true },
    }),
    tx.purchaseInvoice.aggregate({
      where: { branchId },
      _sum: { dueAmount: true },
    }),
    tx.fiscalYearClose.findUnique({
      where: {
        branchId_fiscalYear: {
          branchId,
          fiscalYear: period.fiscalYear,
        },
      },
      include: {
        closedBy: {
          select: { id: true, username: true, fullName: true },
        },
      },
    }),
  ]);

  if (!branch) {
    return null;
  }

  const periodWithdrawals = money(withdrawalSummary._sum.amount || 0);
  const maxByProfit = money(Math.max(0, profit.netProfit - periodWithdrawals));
  const maxByCash = money(Math.max(0, accountBalances.total || 0));
  const suggestedOwnerTake = money(Math.min(maxByProfit, maxByCash));
  const closingReceivables = yearEndReceivables.reduce((sum, row) => {
    const value = Number(row._sum.amount || 0);
    if (row.type === LedgerType.DEBIT) {
      return sum + value;
    }
    return sum - value;
  }, 0);
  const closingPayables = money(yearEndPayables._sum.dueAmount || 0);

  return {
    fiscalYear: period.fiscalYear,
    period: {
      start: period.periodStart,
      end: period.periodEnd,
      label: period.periodLabel,
    },
    company: {
      id: company.id,
      name: company.name,
      ownerName: company.ownerName,
      startDate: company.startDate,
      openingCapital: money(company.openingCapital || 0),
      currency: company.currency,
    },
    branch,
    revenue: money(salesSummary._sum.total || 0),
    salesCollected: money(salesSummary._sum.paidAmount || 0),
    salesDue: money(salesSummary._sum.dueAmount || 0),
    salesInvoices: salesSummary._count.id || 0,
    purchaseTotal: money(purchaseSummary._sum.total || 0),
    purchasePaid: money(purchaseSummary._sum.paidAmount || 0),
    purchaseDue: money(purchaseSummary._sum.dueAmount || 0),
    purchaseInvoices: purchaseSummary._count.id || 0,
    grossProfit: profit.grossProfit,
    operatingExpense: profit.operatingExpense,
    netProfit: profit.netProfit,
    ownerWithdrawals: periodWithdrawals,
    ownerWithdrawalCount: withdrawalSummary._count.id || 0,
    yearEndPosition: {
      accountBalances: accountBalances.balances,
      availableFunds: money(accountBalances.total || 0),
      receivables: money(closingReceivables),
      payables: closingPayables,
    },
    ownerTakeGuide: {
      maxByProfit,
      maxByCash,
      suggestedTakeNow: suggestedOwnerTake,
    },
    closed: toClosedMeta(closeRecord),
  };
}
