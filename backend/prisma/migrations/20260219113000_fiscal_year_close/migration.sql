-- CreateTable
CREATE TABLE "FiscalYearClose" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "summary" TEXT NOT NULL,
    "note" TEXT,
    "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" INTEGER,
    CONSTRAINT "FiscalYearClose_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FiscalYearClose_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FiscalYearClose_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYearClose_branchId_fiscalYear_key" ON "FiscalYearClose"("branchId", "fiscalYear");

-- CreateIndex
CREATE INDEX "FiscalYearClose_companyId_fiscalYear_idx" ON "FiscalYearClose"("companyId", "fiscalYear");

-- CreateIndex
CREATE INDEX "FiscalYearClose_closedById_idx" ON "FiscalYearClose"("closedById");
