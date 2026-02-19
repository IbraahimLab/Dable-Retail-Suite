import dayjs from "dayjs";
import express from "express";
import { AuditAction, RoleCode } from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, authorizeRoles } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import { safeNumber } from "../lib/common.js";
import { bodyBranchId } from "../lib/scope.js";
import { ACCOUNT_TYPES, accountTypeFromPaymentMethod, applyAccountMovement, getAccountBalances } from "../lib/finance.js";
import { ensureCompany, money, normalizeCompanyPayload } from "../lib/company.js";
import { buildBalanceSheetReport, buildYearEndOwnerReport } from "../lib/year-end.js";

const router = express.Router();
const ACCOUNT_KEYS = ACCOUNT_TYPES.map((type) => `account.balance.${type}`);

function branchScopeFromQuery(req) {
  if (req.user.role.code !== RoleCode.ADMIN) {
    return Number(req.user.branchId);
  }
  if (req.query.branchId === undefined || req.query.branchId === null || req.query.branchId === "") {
    return null;
  }
  const branchId = Number(req.query.branchId);
  if (!Number.isFinite(branchId) || branchId <= 0) {
    throw new Error("Valid branchId is required.");
  }
  return branchId;
}

function parseDateOrNull(value) {
  if (!value) {
    return null;
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.toDate();
}

router.use(authRequired);

router.get("/company/profile", async (_req, res) => {
  const company = await ensureCompany(prisma, { name: "Dable Company" });
  res.json(company);
});

router.put(
  "/company/profile",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER),
  async (req, res) => {
    const current = await ensureCompany(prisma, { name: "Dable Company" });

    if (req.body.startDate !== undefined && req.body.startDate !== null) {
      const parsedStartDate = parseDateOrNull(req.body.startDate);
      if (!parsedStartDate) {
        return res.status(400).json({ message: "startDate must be a valid date." });
      }
    }
    if (req.body.fiscalYearStartMonth !== undefined) {
      const month = Number(req.body.fiscalYearStartMonth);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ message: "fiscalYearStartMonth must be between 1 and 12." });
      }
    }
    if (req.body.openingCapital !== undefined && safeNumber(req.body.openingCapital, -1) < 0) {
      return res.status(400).json({ message: "openingCapital cannot be negative." });
    }

    const payload = normalizeCompanyPayload(req.body, current);
    if (!payload.name) {
      return res.status(400).json({ message: "Company name is required." });
    }

    const company = await prisma.company.update({
      where: { id: current.id },
      data: payload,
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.UPDATE,
      entityType: "company_profile",
      entityId: company.id,
      payload: company,
    });

    return res.json(company);
  },
);

router.get("/company/setup-status", async (_req, res) => {
  const company = await ensureCompany(prisma, { name: "Dable Company" });
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  const branchIds = branches.map((branch) => branch.id);
  const settings = branchIds.length
    ? await prisma.setting.findMany({
        where: {
          branchId: { in: branchIds },
          key: { in: ACCOUNT_KEYS },
        },
        select: { branchId: true, key: true },
      })
    : [];

  const accountCoverage = new Map();
  for (const row of settings) {
    const keySet = accountCoverage.get(row.branchId) || new Set();
    keySet.add(row.key);
    accountCoverage.set(row.branchId, keySet);
  }

  const branchesWithBalances = branches.filter((branch) => {
    const keys = accountCoverage.get(branch.id);
    return keys && keys.size === ACCOUNT_KEYS.length;
  }).length;

  const companyProfileReady = Boolean(company.name && company.startDate);
  const branchesConfigured = branches.length > 0;
  const startupBalancesConfigured = branchesConfigured && branchesWithBalances === branches.length;

  res.json({
    companyProfileReady,
    branchesConfigured,
    startupBalancesConfigured,
    companyStartedOn: company.startDate,
    branchesTotal: branches.length,
    branchesWithBalances,
    readyToOperate: companyProfileReady && branchesConfigured && startupBalancesConfigured,
  });
});

router.get("/owner-withdrawals", authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER), async (req, res) => {
  const company = await ensureCompany(prisma, { name: "Dable Company" });
  let branchId = null;
  try {
    branchId = branchScopeFromQuery(req);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  const start = req.query.from ? dayjs(req.query.from).startOf("day") : null;
  const end = req.query.to ? dayjs(req.query.to).endOf("day") : null;
  if ((start && !start.isValid()) || (end && !end.isValid())) {
    return res.status(400).json({ message: "from/to must be valid dates." });
  }
  const take = Math.max(1, Math.min(500, Number(req.query.take || 120)));

  const where = {
    companyId: company.id,
    ...(branchId ? { branchId } : {}),
    ...(start || end
      ? {
          withdrawnAt: {
            ...(start ? { gte: start.toDate() } : {}),
            ...(end ? { lte: end.toDate() } : {}),
          },
        }
      : {}),
  };

  const [items, stats] = await Promise.all([
    prisma.ownerWithdrawal.findMany({
      where,
      include: {
        branch: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: { withdrawnAt: "desc" },
      take,
    }),
    prisma.ownerWithdrawal.aggregate({
      where,
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  res.json({
    count: stats._count.id || 0,
    totalAmount: money(stats._sum.amount || 0),
    items,
  });
});

router.post(
  "/owner-withdrawals",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER),
  async (req, res) => {
    const company = await ensureCompany(prisma, { name: "Dable Company" });
    const branchId = bodyBranchId(req, req.body.branchId);
    if (!Number.isFinite(branchId) || branchId <= 0) {
      return res.status(400).json({ message: "Valid branchId is required." });
    }

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      return res.status(404).json({ message: "Branch not found." });
    }

    const amount = money(req.body.amount);
    if (amount <= 0) {
      return res.status(400).json({ message: "amount must be > 0." });
    }

    const paymentMethod = accountTypeFromPaymentMethod(req.body.paymentMethod);
    if (!paymentMethod) {
      return res.status(400).json({ message: "paymentMethod must be CASH, BANK or CARD." });
    }

    const withdrawnAt = req.body.withdrawnAt
      ? dayjs(req.body.withdrawnAt).toDate()
      : dayjs().toDate();
    if (Number.isNaN(withdrawnAt.valueOf())) {
      return res.status(400).json({ message: "withdrawnAt must be a valid date." });
    }

    const note = req.body.note ? String(req.body.note).trim() : null;

    const result = await prisma.$transaction(async (tx) => {
      const movement = await applyAccountMovement(tx, {
        branchId,
        paymentMethod,
        amount,
        direction: "OUT",
        purpose: "owner withdrawal",
      });
      const withdrawal = await tx.ownerWithdrawal.create({
        data: {
          companyId: company.id,
          branchId,
          amount,
          paymentMethod,
          withdrawnAt,
          note,
          createdById: req.user.id,
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          createdBy: { select: { id: true, username: true, fullName: true } },
        },
      });
      const balances = await getAccountBalances(tx, branchId);
      return {
        withdrawal,
        accountMovement: movement,
        balances,
      };
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.CREATE,
      entityType: "owner_withdrawal",
      entityId: result.withdrawal.id,
      payload: {
        branchId,
        amount,
        paymentMethod,
      },
    });

    return res.status(201).json(result);
  },
);

router.get(
  "/fiscal-years/close",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER),
  async (req, res) => {
    let branchId = null;
    try {
      branchId = branchScopeFromQuery(req);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const where =
      req.user.role.code === RoleCode.ADMIN
        ? { ...(branchId ? { branchId } : {}) }
        : { branchId: Number(req.user.branchId) };
    const take = Math.max(1, Math.min(500, Number(req.query.take || 100)));

    const rows = await prisma.fiscalYearClose.findMany({
      where,
      include: {
        branch: { select: { id: true, code: true, name: true } },
        closedBy: { select: { id: true, username: true, fullName: true } },
      },
      orderBy: [{ fiscalYear: "desc" }, { closedAt: "desc" }],
      take,
    });

    const closings = rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      branchId: row.branchId,
      branch: row.branch,
      fiscalYear: row.fiscalYear,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      note: row.note || null,
      closedAt: row.closedAt,
      closedBy: row.closedBy
        ? {
            id: row.closedBy.id,
            username: row.closedBy.username,
            fullName: row.closedBy.fullName,
          }
        : null,
    }));

    return res.json({
      count: closings.length,
      closings,
    });
  },
);

router.post(
  "/fiscal-years/close",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER),
  async (req, res) => {
    const company = await ensureCompany(prisma, { name: "Dable Company" });
    const branchId = bodyBranchId(req, req.body.branchId);
    if (!Number.isFinite(branchId) || branchId <= 0) {
      return res.status(400).json({ message: "Valid branchId is required." });
    }

    const yearEndOwner = await buildYearEndOwnerReport(prisma, {
      company,
      branchId,
      fiscalYear: req.body.fiscalYear,
    });
    if (!yearEndOwner) {
      return res.status(404).json({ message: "Branch not found." });
    }
    if (yearEndOwner.closed) {
      return res
        .status(409)
        .json({ message: `Fiscal year ${yearEndOwner.fiscalYear} is already closed for this branch.` });
    }

    const periodEnd = dayjs(yearEndOwner.period.end).endOf("day");
    if (dayjs().isBefore(periodEnd)) {
      return res.status(400).json({
        message: `Fiscal year ${yearEndOwner.fiscalYear} cannot be closed before ${periodEnd.format("YYYY-MM-DD")}.`,
      });
    }

    const balanceSheet = await buildBalanceSheetReport(prisma, { company, branchId });
    if (!balanceSheet) {
      return res.status(404).json({ message: "Branch not found." });
    }

    const note = req.body.note ? String(req.body.note).trim() : null;
    let closeRecord;
    try {
      closeRecord = await prisma.fiscalYearClose.create({
        data: {
          companyId: company.id,
          branchId,
          fiscalYear: yearEndOwner.fiscalYear,
          periodStart: yearEndOwner.period.start,
          periodEnd: yearEndOwner.period.end,
          summary: JSON.stringify({
            yearEndOwner: { ...yearEndOwner, closed: null },
            balanceSheet,
          }),
          note,
          closedById: req.user.id,
        },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          closedBy: { select: { id: true, username: true, fullName: true } },
        },
      });
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("unique")) {
        return res
          .status(409)
          .json({ message: `Fiscal year ${yearEndOwner.fiscalYear} is already closed for this branch.` });
      }
      throw error;
    }

    const closedMeta = {
      id: closeRecord.id,
      fiscalYear: closeRecord.fiscalYear,
      periodStart: closeRecord.periodStart,
      periodEnd: closeRecord.periodEnd,
      closedAt: closeRecord.closedAt,
      note: closeRecord.note || null,
      closedBy: closeRecord.closedBy
        ? {
            id: closeRecord.closedBy.id,
            username: closeRecord.closedBy.username,
            fullName: closeRecord.closedBy.fullName,
          }
        : null,
    };

    await logAudit({
      userId: req.user.id,
      action: AuditAction.CREATE,
      entityType: "fiscal_year_close",
      entityId: closeRecord.id,
      payload: {
        branchId,
        fiscalYear: yearEndOwner.fiscalYear,
        periodStart: yearEndOwner.period.start,
        periodEnd: yearEndOwner.period.end,
      },
    });

    return res.status(201).json({
      closing: closedMeta,
      yearEndOwner: {
        ...yearEndOwner,
        closed: closedMeta,
      },
      balanceSheet,
    });
  },
);

export default router;
