import bcrypt from "bcryptjs";
import express from "express";
import { AuditAction, RoleCode } from "@prisma/client";
import prisma from "../prisma.js";
import { authRequired, signToken } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required." });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: true, branch: true },
  });
  if (!user || !user.isActive) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const token = signToken(user);
  await logAudit({
    userId: user.id,
    action: AuditAction.LOGIN,
    entityType: "auth",
    payload: { username: user.username },
  });

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role.code,
      branchId: user.branchId,
      branchName: user.branch?.name || null,
    },
  });
});

router.post("/bootstrap", async (req, res) => {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return res.status(400).json({ message: "System already initialized." });
  }
  const { username = "admin", password = "admin123", fullName = "System Admin" } = req.body;
  const role = await prisma.role.findUnique({ where: { code: RoleCode.ADMIN } });
  const branch = await prisma.branch.findFirst({ orderBy: { id: "asc" } });
  if (!role || !branch) {
    return res.status(500).json({ message: "Default setup missing." });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      fullName,
      passwordHash,
      roleId: role.id,
      branchId: branch.id,
    },
    include: { role: true, branch: true },
  });
  return res.status(201).json({
    id: user.id,
    username: user.username,
    role: user.role.code,
    branchId: user.branchId,
  });
});

router.get("/me", authRequired, async (req, res) => {
  return res.json({
    id: req.user.id,
    username: req.user.username,
    fullName: req.user.fullName,
    role: req.user.role.code,
    branchId: req.user.branchId,
    branchName: req.user.branch?.name || null,
  });
});

export default router;
