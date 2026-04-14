PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ExecutorTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "serviceId" TEXT,
    "departmentId" TEXT,
    "minDailyCount" INTEGER NOT NULL,
    "percentage" REAL NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_ExecutorTier" (
    "id",
    "name",
    "serviceId",
    "departmentId",
    "minDailyCount",
    "percentage",
    "effectiveFrom",
    "effectiveTo",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "name",
    "serviceId",
    "departmentId",
    "minDailyCount",
    ROUND(
        CASE
            WHEN "serviceId" IS NOT NULL THEN "fixedAmount" * 100.0 / COALESCE((SELECT "price" FROM "Service" WHERE "Service"."id" = "ExecutorTier"."serviceId"), 1)
            WHEN "departmentId" IS NOT NULL THEN "fixedAmount" * 100.0 / COALESCE((SELECT AVG("price") FROM "Service" WHERE "Service"."departmentId" = "ExecutorTier"."departmentId"), 1)
            ELSE "fixedAmount" * 100.0 / COALESCE((SELECT AVG("price") FROM "Service"), 1)
        END,
        2
    ) AS "percentage",
    "effectiveFrom",
    "effectiveTo",
    "createdAt",
    "updatedAt"
FROM "ExecutorTier";

DROP TABLE "ExecutorTier";
ALTER TABLE "new_ExecutorTier" RENAME TO "ExecutorTier";

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
