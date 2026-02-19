import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { RoleCode, PrismaClient } from "@prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const existingCompany = await prisma.company.findFirst({ orderBy: { id: "asc" } });
  const company =
    existingCompany ||
    (await prisma.company.create({
      data: {
        name: "Dable Company",
        currency: "USD",
        fiscalYearStartMonth: 1,
        openingCapital: 0,
      },
    }));

  const roles = [
    { code: RoleCode.ADMIN, name: "Admin" },
    { code: RoleCode.MANAGER, name: "Manager" },
    { code: RoleCode.CASHIER, name: "Cashier" },
    { code: RoleCode.STOCK_KEEPER, name: "Stock Keeper" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }

  const branch = await prisma.branch.upsert({
    where: { code: "MAIN" },
    update: { name: "Main Branch" },
    create: {
      code: "MAIN",
      name: "Main Branch",
      address: "Local",
    },
  });

  const [pcs, kg, litre] = await Promise.all([
    prisma.unit.upsert({
      where: { code: "PCS" },
      update: { name: "Piece" },
      create: { code: "PCS", name: "Piece" },
    }),
    prisma.unit.upsert({
      where: { code: "KG" },
      update: { name: "Kilogram" },
      create: { code: "KG", name: "Kilogram" },
    }),
    prisma.unit.upsert({
      where: { code: "LTR" },
      update: { name: "Litre" },
      create: { code: "LTR", name: "Litre" },
    }),
  ]);

  const food = await prisma.category.upsert({
    where: { name: "Food" },
    update: {},
    create: { name: "Food" },
  });

  const supplier = await prisma.supplier.create({
    data: {
      branchId: branch.id,
      name: "Default Supplier",
      contactPerson: "Supplier Owner",
      phone: "0000000000",
    },
  }).catch(async () => {
    return prisma.supplier.findFirst({
      where: { branchId: branch.id, name: "Default Supplier" },
    });
  });

  const products = [
    {
      name: "Rice Bag 5kg",
      sku: "RC-5KG",
      baseUnitId: kg.id,
      minStock: 10,
      sellPrice: 28,
    },
    {
      name: "Cooking Oil 1L",
      sku: "OIL-1L",
      baseUnitId: litre.id,
      minStock: 15,
      sellPrice: 7.5,
    },
    {
      name: "Soap Piece",
      sku: "SOAP-PCS",
      baseUnitId: pcs.id,
      minStock: 30,
      sellPrice: 1.2,
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { branchId_sku: { branchId: branch.id, sku: p.sku } },
      update: {},
      create: {
        branchId: branch.id,
        name: p.name,
        sku: p.sku,
        categoryId: food.id,
        baseUnitId: p.baseUnitId,
        supplierId: supplier.id,
        minStock: p.minStock,
        sellPrice: p.sellPrice,
      },
    });

    await prisma.productUnit.upsert({
      where: {
        productId_unitId: {
          productId: product.id,
          unitId: p.baseUnitId,
        },
      },
      update: { conversionFactor: 1, isDefault: true },
      create: {
        productId: product.id,
        unitId: p.baseUnitId,
        conversionFactor: 1,
        isDefault: true,
      },
    });
  }

  const customer = await prisma.customer.create({
    data: {
      branchId: branch.id,
      name: "Walk-in Customer",
      phone: "0000000000",
    },
  }).catch(async () => {
    return prisma.customer.findFirst({
      where: { branchId: branch.id, name: "Walk-in Customer" },
    });
  });

  const adminRole = await prisma.role.findUnique({ where: { code: RoleCode.ADMIN } });
  const managerRole = await prisma.role.findUnique({ where: { code: RoleCode.MANAGER } });
  const cashierRole = await prisma.role.findUnique({ where: { code: RoleCode.CASHIER } });
  const stockRole = await prisma.role.findUnique({ where: { code: RoleCode.STOCK_KEEPER } });
  const passwordHash = await bcrypt.hash("admin123", 10);

  const users = [
    { username: "admin", fullName: "System Admin", roleId: adminRole.id },
    { username: "manager", fullName: "Store Manager", roleId: managerRole.id },
    { username: "cashier", fullName: "Front Cashier", roleId: cashierRole.id },
    { username: "stock", fullName: "Stock Keeper", roleId: stockRole.id },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: { fullName: u.fullName, roleId: u.roleId, branchId: branch.id },
      create: {
        username: u.username,
        fullName: u.fullName,
        passwordHash,
        roleId: u.roleId,
        branchId: branch.id,
      },
    });
  }

  const expenseCategories = ["Rent", "Electricity", "Salary", "Logistics"];
  for (const name of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // eslint-disable-next-line no-console
  console.log("Seed complete");
  // eslint-disable-next-line no-console
  console.log("Demo users password for all users: admin123");
  // eslint-disable-next-line no-console
  console.log(`Default branch: ${branch.name} (${branch.code})`);
  // eslint-disable-next-line no-console
  console.log(`Default customer: ${customer.name}`);
  // eslint-disable-next-line no-console
  console.log(`Company profile: ${company.name}`);
}

main()
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
