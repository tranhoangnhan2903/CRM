import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: path.resolve(process.cwd(), "dev.db"),
  }),
});

async function main() {
  const targetPath = process.argv[2] || path.resolve(process.cwd(), "task_artifacts/sqlite-export.json");

  const data = {
    roles: await prisma.role.findMany(),
    departments: await prisma.department.findMany(),
    users: await prisma.user.findMany(),
    services: await prisma.service.findMany(),
    customers: await prisma.customer.findMany(),
    leads: await prisma.lead.findMany(),
    appointments: await prisma.appointment.findMany(),
    referrals: await prisma.referral.findMany(),
    bills: await prisma.bill.findMany(),
    serviceOrders: await prisma.serviceOrder.findMany(),
    payments: await prisma.payment.findMany(),
    commissionPolicies: await prisma.commissionPolicy.findMany(),
    executorTiers: await prisma.executorTier.findMany(),
    commissions: await prisma.commission.findMany(),
    approvalWorkflows: await prisma.approvalWorkflow.findMany(),
    auditLogs: await prisma.auditLog.findMany(),
    healthPackages: await prisma.healthPackage.findMany(),
    integrationEvents: await prisma.integrationEvent.findMany(),
  };

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(data, null, 2), "utf8");

  console.log(`Exported SQLite data to ${targetPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
