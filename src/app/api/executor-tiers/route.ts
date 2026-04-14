import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, okWithMeta, err, unauthorized, forbidden } from "@/lib/response";
import { getPagination, getPaginationMeta } from "@/lib/pagination";

// GET /api/executor-tiers — list all tiers
export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();
  const pagination = getPagination(req, { limit: 100, maxLimit: 300 });

  const [total, tiers] = await Promise.all([
    prisma.executorTier.count(),
    prisma.executorTier.findMany({
      orderBy: [{ serviceId: "asc" }, { minDailyCount: "asc" }],
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);

  // Enrich with service/department names
  const serviceIds = [...new Set(tiers.map(t => t.serviceId).filter(Boolean))] as string[];
  const deptIds = [...new Set(tiers.map(t => t.departmentId).filter(Boolean))] as string[];

  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } });
  const departments = await prisma.department.findMany({ where: { id: { in: deptIds } } });

  const svcMap = Object.fromEntries(services.map(s => [s.id, s.name]));
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]));

  const enriched = tiers.map(t => ({
    ...t,
    serviceName: t.serviceId ? svcMap[t.serviceId] || null : "(Tất cả dịch vụ)",
    departmentName: t.departmentId ? deptMap[t.departmentId] || null : "(Tất cả khoa)",
  }));

  return okWithMeta(enriched, getPaginationMeta(total, pagination.page, pagination.limit));
}

// POST /api/executor-tiers — create a new tier
export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();

  try {
    const body = await req.json();

    if (body.minDailyCount === undefined || body.percentage === undefined) {
      return err("minDailyCount and percentage are required");
    }

    const tier = await prisma.executorTier.create({
      data: {
        name: body.name || `Tier ${body.minDailyCount}+`,
        serviceId: body.serviceId || null,
        departmentId: body.departmentId || null,
        minDailyCount: parseInt(body.minDailyCount),
        percentage: parseFloat(body.percentage),
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      },
    });

    return ok(tier, 201);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}

// DELETE /api/executor-tiers — delete a tier
export async function DELETE(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return err("id is required");

    await prisma.executorTier.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
