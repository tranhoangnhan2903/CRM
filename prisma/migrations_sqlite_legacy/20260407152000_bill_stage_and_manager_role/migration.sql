ALTER TABLE "Bill" ADD COLUMN "stageNo" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Bill" ADD COLUMN "previousBillId" TEXT;
ALTER TABLE "Bill" ADD COLUMN "payoutRequestStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Bill" ADD COLUMN "payoutRequestedAt" DATETIME;
ALTER TABLE "Bill" ADD COLUMN "payoutRequestedById" TEXT;
ALTER TABLE "Bill" ADD COLUMN "payoutCompletedAt" DATETIME;

INSERT INTO "Role" ("id", "name", "description", "createdAt", "updatedAt")
SELECT
  '9dc42e3e-6ab4-4e0f-8be7-2f9d4b6f5d91',
  'MANAGER',
  'Manager / Operations overview',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "Role" WHERE "name" = 'MANAGER'
);
