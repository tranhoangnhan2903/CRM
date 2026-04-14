-- CreateTable
CREATE TABLE "HealthPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL,
    "subtype" TEXT,
    "contractId" INTEGER,
    "hisPackageId" INTEGER,
    "hisCmpId" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'HIS',
    "syncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalEventId" TEXT,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "stageNo" INTEGER NOT NULL DEFAULT 1,
    "previousBillId" TEXT,
    "payoutRequestStatus" TEXT NOT NULL DEFAULT 'NONE',
    "payoutRequestedAt" DATETIME,
    "payoutRequestedById" TEXT,
    "payoutCompletedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'CRM',
    "hisSohId" INTEGER,
    "hisSohCode" TEXT,
    "hisCmpId" INTEGER,
    "hisSrvDivision" TEXT,
    "hisRoom" TEXT,
    "hisSrvGroup" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bill_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Bill" ("createdAt", "customerId", "id", "payoutCompletedAt", "payoutRequestStatus", "payoutRequestedAt", "payoutRequestedById", "previousBillId", "stageNo", "status", "totalAmount", "updatedAt") SELECT "createdAt", "customerId", "id", "payoutCompletedAt", "payoutRequestStatus", "payoutRequestedAt", "payoutRequestedById", "previousBillId", "stageNo", "status", "totalAmount", "updatedAt" FROM "Bill";
DROP TABLE "Bill";
ALTER TABLE "new_Bill" RENAME TO "Bill";
CREATE UNIQUE INDEX "Bill_hisSohId_key" ON "Bill"("hisSohId");
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "yearOfBirth" INTEGER,
    "gender" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CRM',
    "hisCustomerId" INTEGER,
    "hisCustomerCode" TEXT,
    "hisCmpId" INTEGER,
    "hisLatestSohId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Customer" ("address", "createdAt", "email", "fullName", "gender", "id", "phone", "updatedAt", "yearOfBirth") SELECT "address", "createdAt", "email", "fullName", "gender", "id", "phone", "updatedAt", "yearOfBirth" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");
CREATE UNIQUE INDEX "Customer_hisCustomerId_key" ON "Customer"("hisCustomerId");
CREATE TABLE "new_Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CRM',
    "hisCmpId" INTEGER,
    "hisCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Department" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "Department";
DROP TABLE "Department";
ALTER TABLE "new_Department" RENAME TO "Department";
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");
CREATE UNIQUE INDEX "Department_hisCode_key" ON "Department"("hisCode");
CREATE TABLE "new_Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "departmentId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CRM',
    "hisServiceId" INTEGER,
    "hisCmpId" INTEGER,
    "hisDivision" TEXT,
    "hisRoom" TEXT,
    "hisSrvGroup" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Service_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Service" ("code", "createdAt", "departmentId", "description", "id", "name", "price", "updatedAt") SELECT "code", "createdAt", "departmentId", "description", "id", "name", "price", "updatedAt" FROM "Service";
DROP TABLE "Service";
ALTER TABLE "new_Service" RENAME TO "Service";
CREATE UNIQUE INDEX "Service_code_key" ON "Service"("code");
CREATE UNIQUE INDEX "Service_hisServiceId_key" ON "Service"("hisServiceId");
CREATE TABLE "new_ServiceOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "executorId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" REAL NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CRM',
    "hisSolId" INTEGER,
    "hisAssignType" TEXT,
    "hisSourceSohId" INTEGER,
    "hisSourceSolId" INTEGER,
    "hisIntroEmployeeId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceOrder_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceOrder_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceOrder_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ServiceOrder" ("billId", "createdAt", "executorId", "id", "price", "quantity", "serviceId", "status", "updatedAt") SELECT "billId", "createdAt", "executorId", "id", "price", "quantity", "serviceId", "status", "updatedAt" FROM "ServiceOrder";
DROP TABLE "ServiceOrder";
ALTER TABLE "new_ServiceOrder" RENAME TO "ServiceOrder";
CREATE UNIQUE INDEX "ServiceOrder_hisSolId_key" ON "ServiceOrder"("hisSolId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "departmentId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'CRM',
    "hisEmployeeId" INTEGER,
    "hisEmployeeCode" TEXT,
    "hisCmpId" INTEGER,
    "syncManaged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "departmentId", "email", "fullName", "id", "passwordHash", "roleId", "updatedAt") SELECT "createdAt", "departmentId", "email", "fullName", "id", "passwordHash", "roleId", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_hisEmployeeId_key" ON "User"("hisEmployeeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "HealthPackage_code_key" ON "HealthPackage"("code");

-- CreateIndex
CREATE UNIQUE INDEX "HealthPackage_hisPackageId_key" ON "HealthPackage"("hisPackageId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_externalEventId_key" ON "IntegrationEvent"("externalEventId");
