import bcrypt from "bcryptjs";
import { RoleCode } from "@prisma/client";
import prisma from "../prisma.js";

const roleMatrix = [
  { code: RoleCode.ADMIN, name: "Admin" },
  { code: RoleCode.MANAGER, name: "Manager" },
  { code: RoleCode.CASHIER, name: "Cashier" },
  { code: RoleCode.STOCK_KEEPER, name: "Stock Keeper" },
];

const baseUnits = [
  { code: "PCS", name: "Piece" },
  { code: "KG", name: "Kilogram" },
  { code: "LTR", name: "Litre" },
];

const baseExpenseCategories = [
  "Rent",
  "Electricity",
  "Salary",
  "Logistics",
  "Maintenance",
];

export async function ensureDefaults() {
  for (const role of roleMatrix) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }

  for (const unit of baseUnits) {
    await prisma.unit.upsert({
      where: { code: unit.code },
      update: { name: unit.name },
      create: unit,
    });
  }

  for (const category of baseExpenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { name: category },
      update: {},
      create: { name: category },
    });
  }

  const branchCount = await prisma.branch.count();
  let mainBranch;
  if (branchCount === 0) {
    mainBranch = await prisma.branch.create({
      data: {
        code: "MAIN",
        name: "Main Branch",
      },
    });
  } else {
    mainBranch = await prisma.branch.findFirst({ orderBy: { id: "asc" } });
  }

  const userCount = await prisma.user.count();
  if (userCount === 0 && mainBranch) {
    const adminRole = await prisma.role.findUnique({
      where: { code: RoleCode.ADMIN },
    });
    if (adminRole) {
      const passwordHash = await bcrypt.hash("admin123", 10);
      await prisma.user.create({
        data: {
          username: "admin",
          fullName: "System Admin",
          passwordHash,
          roleId: adminRole.id,
          branchId: mainBranch.id,
        },
      });
      // eslint-disable-next-line no-console
      console.log("Default admin created: username=admin password=admin123");
    }
  }
}
