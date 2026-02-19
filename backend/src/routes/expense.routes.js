import express from "express";
import multer from "multer";
import path from "node:path";
import { AuditAction, RoleCode } from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, authorizeRoles } from "../middleware/auth.js";
import { bodyBranchId, queryBranchId } from "../lib/scope.js";
import { parseDateRange, safeNumber } from "../lib/common.js";
import { logAudit } from "../lib/audit.js";
import {
  accountTypeFromPaymentMethod,
  applyAccountMovement,
  ensureAccountHasFunds,
} from "../lib/finance.js";

const router = express.Router();

const receiptDir = path.join(process.cwd(), "uploads", "receipts");
const upload = multer({ dest: receiptDir });

router.use(authRequired);

router.get("/expense-categories", async (_req, res) => {
  const categories = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });
  res.json(categories);
});

router.post(
  "/expense-categories",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER),
  async (req, res) => {
    const category = await prisma.expenseCategory.create({
      data: { name: req.body.name },
    });
    res.status(201).json(category);
  },
);

router.get("/expenses", async (req, res) => {
  const branchId = queryBranchId(req);
  const { start, end } = parseDateRange({
    from: req.query.from,
    to: req.query.to,
  });
  const expenses = await prisma.expense.findMany({
    where: {
      branchId,
      expenseDate: {
        gte: start,
        lte: end,
      },
    },
    include: {
      category: true,
      createdBy: { select: { id: true, fullName: true } },
      branch: true,
    },
    orderBy: { expenseDate: "desc" },
  });
  res.json(expenses);
});

router.post(
  "/expenses",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER),
  upload.single("receipt"),
  async (req, res) => {
    const branchId = bodyBranchId(req, req.body.branchId);
    const amount = safeNumber(req.body.amount, 0);
    if (amount <= 0) {
      return res.status(400).json({ message: "amount must be > 0" });
    }

    const requestedPaymentMethod = String(req.body.paymentMethod || "CASH")
      .trim()
      .toUpperCase();
    const accountType = accountTypeFromPaymentMethod(requestedPaymentMethod);
    const paymentMethod = accountType || requestedPaymentMethod || "CASH";
    const categoryId = req.body.categoryId ? Number(req.body.categoryId) : null;

    const expense = await prisma.$transaction(async (tx) => {
      if (categoryId) {
        const category = await tx.expenseCategory.findUnique({ where: { id: categoryId } });
        if (!category) {
          const error = new Error("Expense category not found.");
          error.status = 400;
          throw error;
        }
      }

      if (accountType) {
        await ensureAccountHasFunds(tx, {
          branchId,
          paymentMethod: accountType,
          amount,
          purpose: "expense payment",
        });
      }

      const created = await tx.expense.create({
        data: {
          branchId,
          categoryId,
          amount,
          expenseDate: req.body.expenseDate ? new Date(req.body.expenseDate) : new Date(),
          paymentMethod,
          description: req.body.description || null,
          receiptPath: req.file ? `/uploads/receipts/${path.basename(req.file.path)}` : null,
          createdById: req.user.id,
        },
        include: { category: true, branch: true },
      });

      if (accountType) {
        await applyAccountMovement(tx, {
          branchId,
          paymentMethod: accountType,
          amount,
          direction: "OUT",
          purpose: "expense payment",
        });
      }

      return created;
    });

    await logAudit({
      userId: req.user.id,
      action: AuditAction.CREATE,
      entityType: "expense",
      entityId: expense.id,
      payload: { amount: expense.amount },
    });

    res.status(201).json(expense);
  },
);

export default router;
