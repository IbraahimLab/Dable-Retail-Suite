import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import morgan from "morgan";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import setupRoutes from "./routes/setup.routes.js";
import productRoutes from "./routes/product.routes.js";
import purchaseRoutes from "./routes/purchase.routes.js";
import salesRoutes from "./routes/sales.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import transferRoutes from "./routes/transfer.routes.js";
import reportRoutes from "./routes/report.routes.js";
import systemRoutes from "./routes/system.routes.js";
import goalsRoutes from "./routes/goals.routes.js";
import companyRoutes from "./routes/company.routes.js";
import { ensureDefaults } from "./lib/bootstrap.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);

const uploadsDir = `${process.cwd()}\\uploads`;
const backupsDir = `${process.cwd()}\\backups`;
const receiptsDir = `${uploadsDir}\\receipts`;

fs.mkdirSync(receiptsDir, { recursive: true });
fs.mkdirSync(backupsDir, { recursive: true });

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use("/uploads", express.static(uploadsDir));
app.use("/backups", express.static(backupsDir));

app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", setupRoutes);
app.use("/api", productRoutes);
app.use("/api", purchaseRoutes);
app.use("/api", salesRoutes);
app.use("/api", expenseRoutes);
app.use("/api", transferRoutes);
app.use("/api", reportRoutes);
app.use("/api", systemRoutes);
app.use("/api", goalsRoutes);
app.use("/api", companyRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Not found." });
});

app.use((error, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(error);
  const status = error.status || 500;
  res.status(status).json({
    message: error.message || "Internal server error",
  });
});

async function start() {
  await ensureDefaults();
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Backend running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", error);
  process.exit(1);
});
