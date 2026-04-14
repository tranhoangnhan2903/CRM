import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL || "postgresql://tranhoangnhan@localhost:5432/clinic_crm?schema=public",
  }),
});

type ExportPayload = {
  roles: Array<Record<string, unknown>>;
  departments: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  services: Array<Record<string, unknown>>;
  customers: Array<Record<string, unknown>>;
  leads: Array<Record<string, unknown>>;
  appointments: Array<Record<string, unknown>>;
  referrals: Array<Record<string, unknown>>;
  bills: Array<Record<string, unknown>>;
  serviceOrders: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  commissionPolicies: Array<Record<string, unknown>>;
  executorTiers: Array<Record<string, unknown>>;
  commissions: Array<Record<string, unknown>>;
  approvalWorkflows: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
  healthPackages: Array<Record<string, unknown>>;
  integrationEvents: Array<Record<string, unknown>>;
};

function asDate(value: unknown) {
  return typeof value === "string" ? new Date(value) : value;
}

function mapDateFields<T extends Record<string, unknown>>(rows: T[], fields: string[]) {
  return rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    for (const field of fields) {
      copy[field] = asDate(copy[field]);
    }
    return copy as T;
  });
}

async function main() {
  const sourcePath = process.argv[2] || path.resolve(process.cwd(), "task_artifacts/sqlite-export.json");
  const raw = await fs.readFile(sourcePath, "utf8");
  const data = JSON.parse(raw) as ExportPayload;

  await prisma.approvalWorkflow.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.commission.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.serviceOrder.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.executorTier.deleteMany();
  await prisma.commissionPolicy.deleteMany();
  await prisma.healthPackage.deleteMany();
  await prisma.integrationEvent.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.department.deleteMany();
  await prisma.role.deleteMany();

  if (data.roles.length) await prisma.role.createMany({ data: mapDateFields(data.roles, ["createdAt", "updatedAt"]) as never });
  if (data.departments.length) await prisma.department.createMany({ data: mapDateFields(data.departments, ["createdAt", "updatedAt"]) as never });
  if (data.users.length) await prisma.user.createMany({ data: mapDateFields(data.users, ["createdAt", "updatedAt"]) as never });
  if (data.services.length) await prisma.service.createMany({ data: mapDateFields(data.services, ["createdAt", "updatedAt"]) as never });
  if (data.customers.length) await prisma.customer.createMany({ data: mapDateFields(data.customers, ["createdAt", "updatedAt"]) as never });
  if (data.leads.length) await prisma.lead.createMany({ data: mapDateFields(data.leads, ["createdAt", "updatedAt"]) as never });
  if (data.appointments.length) await prisma.appointment.createMany({ data: mapDateFields(data.appointments, ["scheduledAt", "createdAt", "updatedAt"]) as never });
  if (data.referrals.length) await prisma.referral.createMany({ data: mapDateFields(data.referrals, ["createdAt", "updatedAt"]) as never });
  if (data.bills.length) await prisma.bill.createMany({ data: mapDateFields(data.bills, ["payoutRequestedAt", "payoutCompletedAt", "createdAt", "updatedAt"]) as never });
  if (data.serviceOrders.length) await prisma.serviceOrder.createMany({ data: mapDateFields(data.serviceOrders, ["createdAt", "updatedAt"]) as never });
  if (data.payments.length) await prisma.payment.createMany({ data: mapDateFields(data.payments, ["createdAt", "updatedAt"]) as never });
  if (data.commissionPolicies.length) await prisma.commissionPolicy.createMany({ data: mapDateFields(data.commissionPolicies, ["effectiveFrom", "effectiveTo", "createdAt", "updatedAt"]) as never });
  if (data.executorTiers.length) await prisma.executorTier.createMany({ data: mapDateFields(data.executorTiers, ["effectiveFrom", "effectiveTo", "createdAt", "updatedAt"]) as never });
  if (data.commissions.length) await prisma.commission.createMany({ data: mapDateFields(data.commissions, ["createdAt", "updatedAt"]) as never });
  if (data.approvalWorkflows.length) await prisma.approvalWorkflow.createMany({ data: mapDateFields(data.approvalWorkflows, ["createdAt", "updatedAt"]) as never });
  if (data.auditLogs.length) await prisma.auditLog.createMany({ data: mapDateFields(data.auditLogs, ["createdAt"]) as never });
  if (data.healthPackages.length) await prisma.healthPackage.createMany({ data: mapDateFields(data.healthPackages, ["syncedAt", "createdAt", "updatedAt"]) as never });
  if (data.integrationEvents.length) await prisma.integrationEvent.createMany({ data: mapDateFields(data.integrationEvents, ["processedAt", "createdAt", "updatedAt"]) as never });

  console.log(`Imported data from ${sourcePath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
