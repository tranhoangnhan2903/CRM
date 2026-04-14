-- AlterTable
ALTER TABLE "Bill" ADD COLUMN "transactionAt" TIMESTAMP(3);

UPDATE "Bill"
SET "transactionAt" = "createdAt"
WHERE "transactionAt" IS NULL;

ALTER TABLE "Bill"
ALTER COLUMN "transactionAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "transactionAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Bill_transactionAt_idx" ON "Bill"("transactionAt");
