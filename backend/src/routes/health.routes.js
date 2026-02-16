import express from "express";
import prisma from "../prisma.js";

const router = express.Router();

router.get("/health", async (_req, res) => {
  const [
    users,
    products,
    purchases,
    sales,
    expenses,
    branches,
    transfers,
    auditLogs,
    backups,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.product.count(),
    prisma.purchaseInvoice.count(),
    prisma.salesInvoice.count(),
    prisma.expense.count(),
    prisma.branch.count(),
    prisma.stockTransfer.count(),
    prisma.auditLog.count(),
    prisma.backupHistory.count(),
  ]);

  res.json({
    status: "ok",
    modules: [
      "auth",
      "roles",
      "products",
      "stock",
      "suppliers",
      "purchases",
      "sales",
      "returns",
      "customer-credit",
      "expenses",
      "reports",
      "multi-branch",
      "audit",
      "backup",
    ],
    totals: { users, products, purchases, sales, expenses, branches, transfers, auditLogs, backups },
  });
});

export default router;
