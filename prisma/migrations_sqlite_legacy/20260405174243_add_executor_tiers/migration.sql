-- CreateTable
CREATE TABLE "ExecutorTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serviceId" TEXT,
    "departmentId" TEXT,
    "minDailyCount" INTEGER NOT NULL,
    "fixedAmount" REAL NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
