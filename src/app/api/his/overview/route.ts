import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { getDwConfigStatus } from "@/lib/dw-config";
import { ok, unauthorized, forbidden } from "@/lib/response";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "MANAGER")) return forbidden();

  const config = getDwConfigStatus();

  const [
    dwCustomerCount,
    dwDoctorCount,
    dwServiceCount,
    packageCount,
    dwBillCount,
    latestEvents,
  ] = await Promise.all([
    prisma.customer.count({ where: { source: "DW" } }),
    prisma.user.count({ where: { source: "DW" } }),
    prisma.service.count({ where: { source: "DW" } }),
    prisma.healthPackage.count(),
    prisma.bill.count({ where: { source: "DW" } }),
    prisma.integrationEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return ok({
    config,
    counts: {
      customers: dwCustomerCount,
      doctors: dwDoctorCount,
      services: dwServiceCount,
      packages: packageCount,
      bills: dwBillCount,
    },
    latestEvents,
  });
}
