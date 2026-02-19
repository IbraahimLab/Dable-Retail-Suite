import dayjs from "dayjs";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { AuditAction, RoleCode } from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, authorizeRoles } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import { safeNumber } from "../lib/common.js";
import { bodyBranchId, queryBranchId } from "../lib/scope.js";
import {
  accountTypeFromPaymentMethod,
  applyAccountMovement,
  getAccountBalances,
  setAccountBalances,
} from "../lib/finance.js";

const router = express.Router();
const backupsDir = path.join(process.cwd(), "backups");

function dbFilePath() {
  const dbUrl = process.env.DATABASE_URL || "file:./dev.db";
  if (!dbUrl.startsWith("file:")) {
    throw new Error("Only SQLite file URLs are supported for backup/restore.");
  }
  const relativeDbPath = dbUrl.slice("file:".length);
  return path.resolve(process.cwd(), "prisma", relativeDbPath);
}

router.use(authRequired);

router.get("/audit-logs", authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER), async (req, res) => {
  const take = Number(req.query.take || 200);
  const logs = await prisma.auditLog.findMany({
    include: { user: { select: { id: true, username: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 500),
  });
  res.json(logs);
});

router.get("/settings", async (req, res) => {
  const branchId =
    req.query.branchId === "null"
      ? null
      : req.query.branchId
        ? Number(req.query.branchId)
        : Number(req.user.branchId);
  const settings = await prisma.setting.findMany({
    where: { branchId },
    orderBy: { key: "asc" },
  });
  res.json(settings);
});

router.post("/settings", authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER), async (req, res) => {
  const branchId =
    req.body.branchId === null || req.body.branchId === "null"
      ? null
      : req.body.branchId
        ? Number(req.body.branchId)
        : Number(req.user.branchId);
  const saved = await prisma.setting.upsert({
    where: {
      branchId_key: {
        branchId,
        key: req.body.key,
      },
    },
    update: { value: String(req.body.value) },
    create: {
      branchId,
      key: req.body.key,
      value: String(req.body.value),
    },
  });
  res.json(saved);
});

router.get("/finance/accounts", async (req, res) => {
  const branchId = queryBranchId(req);
  const balances = await getAccountBalances(prisma, branchId);
  res.json(balances);
});

router.put("/finance/accounts", authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER), async (req, res) => {
  const branchId = bodyBranchId(req, req.body.branchId);
  const balances = req.body?.balances || {};
  const saved = await prisma.$transaction((tx) =>
    setAccountBalances(tx, {
      branchId,
      balances,
    }),
  );

  await logAudit({
    userId: req.user.id,
    action: AuditAction.UPDATE,
    entityType: "finance_accounts",
    entityId: branchId,
    payload: { branchId, balances: saved.balances },
  });

  res.json(saved);
});

router.post(
  "/finance/accounts/adjust",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER),
  async (req, res) => {
    const branchId = bodyBranchId(req, req.body.branchId);
    const accountType = accountTypeFromPaymentMethod(req.body.accountType);
    const amount = safeNumber(req.body.amount, 0);
    const direction = String(req.body.direction || "IN")
      .trim()
      .toUpperCase();
    const reason = req.body.reason ? String(req.body.reason).trim() : "";

    if (amount <= 0) {
      return res.status(400).json({ message: "amount must be > 0" });
    }
    if (!["IN", "OUT"].includes(direction)) {
      return res.status(400).json({ message: "direction must be IN or OUT" });
    }
    if (!accountType) {
      return res.status(400).json({ message: "accountType must be CASH, BANK or CARD" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const movement = await applyAccountMovement(tx, {
        branchId,
        paymentMethod: accountType,
        amount,
        direction,
        purpose: reason || "manual account adjustment",
      });
      const balances = await getAccountBalances(tx, branchId);
      return {
        movement,
        balances,
      };
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.UPDATE,
      entityType: "finance_account_adjustment",
      entityId: branchId,
      payload: {
        accountType,
        amount,
        direction,
        reason: reason || null,
      },
    });

    res.json(result);
  },
);

router.post("/system/backup", authorizeRoles(RoleCode.ADMIN), async (req, res) => {
  const source = dbFilePath();
  const stamp = dayjs().format("YYYYMMDD-HHmmss");
  const destination = path.join(backupsDir, `backup-${stamp}.db`);
  await fs.promises.copyFile(source, destination);
  const stats = await fs.promises.stat(destination);
  const backup = await prisma.backupHistory.create({
    data: {
      filePath: destination,
      sizeBytes: stats.size,
    },
  });
  await logAudit({
    userId: req.user.id,
    action: AuditAction.BACKUP,
    entityType: "backup",
    entityId: backup.id,
    payload: { path: destination, size: stats.size },
  });
  res.status(201).json({
    id: backup.id,
    filePath: destination,
    fileName: path.basename(destination),
    sizeBytes: stats.size,
  });
});

router.get("/system/backups", authorizeRoles(RoleCode.ADMIN), async (_req, res) => {
  const backups = await prisma.backupHistory.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(
    backups.map((b) => ({
      ...b,
      fileName: path.basename(b.filePath),
      downloadUrl: `/backups/${path.basename(b.filePath)}`,
    })),
  );
});

router.post("/system/restore", authorizeRoles(RoleCode.ADMIN), async (req, res) => {
  const fileName = req.body.fileName;
  if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    return res.status(400).json({ message: "Valid fileName is required." });
  }
  const source = path.join(backupsDir, fileName);
  const target = dbFilePath();
  if (!fs.existsSync(source)) {
    return res.status(404).json({ message: "Backup file not found." });
  }
  await prisma.$disconnect();
  await fs.promises.copyFile(source, target);
  await prisma.$connect();
  await logAudit({
    userId: req.user.id,
    action: AuditAction.UPDATE,
    entityType: "restore",
    payload: { fileName },
  });
  res.json({ message: "Database restored. Restart backend if active sessions fail." });
});

export default router;
