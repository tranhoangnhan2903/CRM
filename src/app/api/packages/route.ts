import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { okWithMeta, unauthorized, forbidden } from "@/lib/response";
import { getPagination, getPaginationMeta } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "MANAGER", "ACCOUNTANT", "RECEPTIONIST", "DOCTOR")) return forbidden();
  const pagination = getPagination(req, { limit: 100, maxLimit: 300 });

  const [total, packages] = await Promise.all([
    prisma.healthPackage.count(),
    prisma.healthPackage.findMany({
      orderBy: [{ syncedAt: "desc" }, { updatedAt: "desc" }],
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);

  return okWithMeta(packages, getPaginationMeta(total, pagination.page, pagination.limit));
}
