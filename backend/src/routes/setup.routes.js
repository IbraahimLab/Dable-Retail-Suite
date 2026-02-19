import bcrypt from "bcryptjs";
import express from "express";
import { AuditAction, RoleCode } from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, authorizeRoles } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import { bodyBranchId, queryBranchId } from "../lib/scope.js";
import { safeNumber } from "../lib/common.js";

const router = express.Router();

router.use(authRequired);

router.get("/roles", async (_req, res) => {
  const roles = await prisma.role.findMany({ orderBy: { id: "asc" } });
  res.json(roles);
});

router.get("/branches", async (_req, res) => {
  const branches = await prisma.branch.findMany({ orderBy: { id: "asc" } });
  res.json(branches);
});

router.post("/branches", authorizeRoles(RoleCode.ADMIN), async (req, res) => {
  const code = String(req.body.code || "")
    .trim()
    .toUpperCase();
  const name = String(req.body.name || "").trim();
  if (!code || !name) {
    return res.status(400).json({ message: "code and name are required." });
  }

  const existing = await prisma.branch.findUnique({ where: { code } });
  if (existing) {
    return res.status(409).json({ message: "Branch code already exists." });
  }

  const branch = await prisma.branch.create({
    data: {
      code,
      name,
      address: req.body.address ? String(req.body.address).trim() : null,
      phone: req.body.phone ? String(req.body.phone).trim() : null,
      isActive: req.body.isActive ?? true,
    },
  });
  await logAudit({
    userId: req.user.id,
    action: AuditAction.CREATE,
    entityType: "branch",
    entityId: branch.id,
    payload: branch,
  });
  res.status(201).json(branch);
});

router.put("/branches/:id", authorizeRoles(RoleCode.ADMIN), async (req, res) => {
  const branchId = Number(req.params.id);
  const current = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!current) {
    return res.status(404).json({ message: "Branch not found." });
  }

  const code = String(req.body.code || current.code)
    .trim()
    .toUpperCase();
  const name = String(req.body.name || current.name).trim();
  if (!code || !name) {
    return res.status(400).json({ message: "code and name are required." });
  }

  if (code !== current.code) {
    const duplicate = await prisma.branch.findUnique({ where: { code } });
    if (duplicate) {
      return res.status(409).json({ message: "Branch code already exists." });
    }
  }

  const branch = await prisma.branch.update({
    where: { id: branchId },
    data: {
      code,
      name,
      address: req.body.address ? String(req.body.address).trim() : null,
      phone: req.body.phone ? String(req.body.phone).trim() : null,
      isActive: req.body.isActive ?? true,
    },
  });
  await logAudit({
    userId: req.user.id,
    action: AuditAction.UPDATE,
    entityType: "branch",
    entityId: branch.id,
    payload: branch,
  });
  res.json(branch);
});

router.get("/users", authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER), async (req, res) => {
  const where =
    req.user.role.code === RoleCode.ADMIN ? {} : { branchId: Number(req.user.branchId) };
  const users = await prisma.user.findMany({
    where,
    include: { role: true, branch: true },
    orderBy: { id: "asc" },
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      role: u.role.code,
      branchId: u.branchId,
      branchName: u.branch?.name || null,
      isActive: u.isActive,
      createdAt: u.createdAt,
    })),
  );
});

router.post("/users", authorizeRoles(RoleCode.ADMIN), async (req, res) => {
  const { username, fullName, password, roleCode, branchId, isActive = true } = req.body;
  if (!username || !fullName || !password || !roleCode) {
    return res.status(400).json({ message: "username, fullName, password, roleCode required." });
  }
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  if (!role) {
    return res.status(404).json({ message: "Role not found." });
  }
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      fullName,
      passwordHash: hash,
      roleId: role.id,
      branchId: branchId ? Number(branchId) : null,
      isActive: Boolean(isActive),
    },
    include: { role: true, branch: true },
  });
  await logAudit({
    userId: req.user.id,
    action: AuditAction.CREATE,
    entityType: "user",
    entityId: user.id,
  });
  return res.status(201).json({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role.code,
    branchId: user.branchId,
    isActive: user.isActive,
  });
});

router.put("/users/:id/password", authorizeRoles(RoleCode.ADMIN), async (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ message: "password required" });
  }
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id },
    data: { passwordHash: hash },
  });
  await logAudit({
    userId: req.user.id,
    action: AuditAction.UPDATE,
    entityType: "user_password",
    entityId: id,
  });
  return res.json({ message: "Password updated" });
});

router.get("/categories", async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  res.json(categories);
});

router.post(
  "/categories",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.STOCK_KEEPER),
  async (req, res) => {
    const category = await prisma.category.create({
      data: { name: req.body.name },
    });
    res.status(201).json(category);
  },
);

router.get("/units", async (_req, res) => {
  const units = await prisma.unit.findMany({ orderBy: { name: "asc" } });
  res.json(units);
});

router.post(
  "/units",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.STOCK_KEEPER),
  async (req, res) => {
    const unit = await prisma.unit.create({
      data: {
        code: req.body.code,
        name: req.body.name,
      },
    });
    res.status(201).json(unit);
  },
);

router.get("/suppliers", async (req, res) => {
  const branchId = queryBranchId(req);
  const suppliers = await prisma.supplier.findMany({
    where: { branchId },
    orderBy: { name: "asc" },
  });
  res.json(suppliers);
});

router.post(
  "/suppliers",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.STOCK_KEEPER),
  async (req, res) => {
    const branchId = bodyBranchId(req, req.body.branchId);
    const supplier = await prisma.supplier.create({
      data: {
        branchId,
        name: req.body.name,
        contactPerson: req.body.contactPerson || null,
        phone: req.body.phone || null,
        email: req.body.email || null,
        address: req.body.address || null,
        rating: safeNumber(req.body.rating, 5),
        notes: req.body.notes || null,
      },
    });
    await logAudit({
      userId: req.user.id,
      action: AuditAction.CREATE,
      entityType: "supplier",
      entityId: supplier.id,
      payload: supplier,
    });
    res.status(201).json(supplier);
  },
);

router.put(
  "/suppliers/:id",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.STOCK_KEEPER),
  async (req, res) => {
    const supplier = await prisma.supplier.update({
      where: { id: Number(req.params.id) },
      data: {
        name: req.body.name,
        contactPerson: req.body.contactPerson || null,
        phone: req.body.phone || null,
        email: req.body.email || null,
        address: req.body.address || null,
        rating: safeNumber(req.body.rating, 5),
        notes: req.body.notes || null,
      },
    });
    await logAudit({
      userId: req.user.id,
      action: AuditAction.UPDATE,
      entityType: "supplier",
      entityId: supplier.id,
      payload: supplier,
    });
    res.json(supplier);
  },
);

router.get("/suppliers/:id/performance", async (req, res) => {
  const supplierId = Number(req.params.id);
  const [invoiceStats, paidStats] = await Promise.all([
    prisma.purchaseInvoice.aggregate({
      where: { supplierId },
      _count: { id: true },
      _sum: { total: true, paidAmount: true, dueAmount: true },
    }),
    prisma.supplierPayment.aggregate({
      where: { supplierId },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);
  res.json({
    supplierId,
    invoices: invoiceStats._count.id || 0,
    totalPurchased: invoiceStats._sum.total || 0,
    paidOnInvoices: invoiceStats._sum.paidAmount || 0,
    outstanding: invoiceStats._sum.dueAmount || 0,
    paymentCount: paidStats._count.id || 0,
    totalPayments: paidStats._sum.amount || 0,
  });
});

router.get("/customers", async (req, res) => {
  const branchId = queryBranchId(req);
  const search = String(req.query.search || "").trim();
  const customers = await prisma.customer.findMany({
    where: {
      branchId,
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });
  if (customers.length === 0) {
    return res.json([]);
  }

  const customerIds = customers.map((customer) => customer.id);
  const [ledgerByType, salesAgg] = await Promise.all([
    prisma.customerLedger.groupBy({
      by: ["customerId", "type"],
      where: { branchId, customerId: { in: customerIds } },
      _sum: { amount: true },
    }),
    prisma.salesInvoice.groupBy({
      by: ["customerId"],
      where: {
        branchId,
        customerId: { in: customerIds },
      },
      _count: { id: true },
      _sum: { total: true, dueAmount: true },
      _max: { invoiceDate: true },
    }),
  ]);

  const ledgerMap = new Map();
  for (const row of ledgerByType) {
    const current = ledgerMap.get(row.customerId) || { debit: 0, credit: 0 };
    if (row.type === "DEBIT") {
      current.debit += Number(row._sum.amount || 0);
    } else {
      current.credit += Number(row._sum.amount || 0);
    }
    ledgerMap.set(row.customerId, current);
  }

  const salesMap = new Map(salesAgg.map((row) => [row.customerId, row]));
  return res.json(
    customers.map((customer) => {
      const ledger = ledgerMap.get(customer.id) || { debit: 0, credit: 0 };
      const sales = salesMap.get(customer.id);
      return {
        ...customer,
        outstanding: ledger.debit - ledger.credit,
        purchaseCount: sales?._count?.id || 0,
        totalSpent: Number(sales?._sum?.total || 0),
        totalDueOnInvoices: Number(sales?._sum?.dueAmount || 0),
        lastPurchaseDate: sales?._max?.invoiceDate || null,
      };
    }),
  );
});

router.post(
  "/customers",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.CASHIER),
  async (req, res) => {
    const branchId = bodyBranchId(req, req.body.branchId);
    const customer = await prisma.customer.create({
      data: {
        branchId,
        name: req.body.name,
        phone: req.body.phone || null,
        email: req.body.email || null,
        address: req.body.address || null,
      },
    });
    await logAudit({
      userId: req.user.id,
      action: AuditAction.CREATE,
      entityType: "customer",
      entityId: customer.id,
    });
    res.status(201).json(customer);
  },
);

router.put(
  "/customers/:id",
  authorizeRoles(RoleCode.ADMIN, RoleCode.MANAGER, RoleCode.CASHIER),
  async (req, res) => {
    const customer = await prisma.customer.update({
      where: { id: Number(req.params.id) },
      data: {
        name: req.body.name,
        phone: req.body.phone || null,
        email: req.body.email || null,
        address: req.body.address || null,
      },
    });
    await logAudit({
      userId: req.user.id,
      action: AuditAction.UPDATE,
      entityType: "customer",
      entityId: customer.id,
    });
    res.json(customer);
  },
);

router.get("/customers/:id/ledger", async (req, res) => {
  const customerId = Number(req.params.id);
  const branchId = queryBranchId(req);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, branchId },
  });
  if (!customer) {
    return res.status(404).json({ message: "Customer not found." });
  }
  const ledger = await prisma.customerLedger.findMany({
    where: { customerId, branchId },
    include: {
      salesInvoice: { select: { number: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const outstanding = ledger.reduce((acc, entry) => {
    if (entry.type === "DEBIT") {
      return acc + Number(entry.amount);
    }
    return acc - Number(entry.amount);
  }, 0);
  res.json({ customer, entries: ledger, outstanding });
});

router.get("/customers/:id/sales", async (req, res) => {
  const customerId = Number(req.params.id);
  const branchId = queryBranchId(req);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, branchId },
  });
  if (!customer) {
    return res.status(404).json({ message: "Customer not found." });
  }
  const sales = await prisma.salesInvoice.findMany({
    where: { customerId, branchId },
    include: {
      items: { include: { product: true } },
      payments: true,
      returns: { include: { items: true } },
    },
    orderBy: { invoiceDate: "desc" },
    take: Number(req.query.take || 20),
  });
  res.json({
    customer,
    sales,
  });
});

export default router;
