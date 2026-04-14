import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, okWithMeta, err, unauthorized, forbidden } from "@/lib/response";
import { createAuditLog } from "@/lib/audit";
import { getPagination, getPaginationMeta } from "@/lib/pagination";

/**
 * Commission Policies API
 * 
 * Ready for HIS integration — accepts JSON payloads matching the schema.
 * Future: HIS/Data Warehouse can POST/PATCH policies via this endpoint.
 * 
 * Fields:
 *   name          - Policy display name
 *   type          - "REFERRAL" | "EXECUTOR" | "INDICATION" | "STAGE_REFERRAL"
 *   valueType     - "PERCENTAGE" | "FIXED"
 *   value         - Numeric value (e.g. 5 for 5%, or 50000 for fixed ₫50k)
 *   departmentId  - Optional, scope to department
 *   serviceId     - Optional, scope to specific service
 *   minBillSize   - Optional, minimum bill size to qualify
 *   campaignName  - Optional, campaign tag
 *   effectiveFrom - ISO date string
 *   effectiveTo   - Optional ISO date string
 */

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();
  const pagination = getPagination(req, { limit: 100, maxLimit: 300 });

  const [total, policies] = await Promise.all([
    prisma.commissionPolicy.count(),
    prisma.commissionPolicy.findMany({
      orderBy: { effectiveFrom: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);

  // Enrich with service/department names for the UI
  const serviceIds = [...new Set(policies.map(p => p.serviceId).filter(Boolean))] as string[];
  const deptIds = [...new Set(policies.map(p => p.departmentId).filter(Boolean))] as string[];

  const [services, departments] = await Promise.all([
    serviceIds.length > 0 ? prisma.service.findMany({ where: { id: { in: serviceIds } } }) : Promise.resolve([]),
    deptIds.length > 0 ? prisma.department.findMany({ where: { id: { in: deptIds } } }) : Promise.resolve([]),
  ]);

  const svcMap = Object.fromEntries(services.map(s => [s.id, s]));
  const deptMap = Object.fromEntries(departments.map(d => [d.id, d]));

  const enriched = policies.map(p => ({
    ...p,
    serviceName: p.serviceId ? svcMap[p.serviceId]?.name || null : null,
    serviceCode: p.serviceId ? svcMap[p.serviceId]?.code || null : null,
    departmentName: p.departmentId ? deptMap[p.departmentId]?.name || null : null,
  }));

  return okWithMeta(enriched, getPaginationMeta(total, pagination.page, pagination.limit));
}

// POST — Create policy (also used by HIS integration)
export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();

  try {
    const body = await req.json();

    // Validate required fields
    if (!body.name || !body.type || !body.valueType || body.value === undefined) {
      return err("name, type, valueType, value are required");
    }
    if (!["REFERRAL", "EXECUTOR", "INDICATION", "STAGE_REFERRAL"].includes(body.type)) {
      return err("type must be REFERRAL, EXECUTOR, INDICATION or STAGE_REFERRAL");
    }
    if (!["PERCENTAGE", "FIXED"].includes(body.valueType)) {
      return err("valueType must be PERCENTAGE or FIXED");
    }

    const policy = await prisma.commissionPolicy.create({
      data: {
        name: body.name,
        type: body.type,
        valueType: body.valueType,
        value: parseFloat(body.value),
        departmentId: body.departmentId || null,
        serviceId: body.serviceId || null,
        minBillSize: body.minBillSize ? parseFloat(body.minBillSize) : null,
        campaignName: body.campaignName || null,
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      },
    });

    await createAuditLog({
      userId: user.userId,
      action: "CREATE_COMMISSION_POLICY",
      entityType: "CommissionPolicy",
      entityId: policy.id,
      newData: policy,
    });

    return ok(policy, 201);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}

// PATCH — Update policy
export async function PATCH(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();

  try {
    const body = await req.json();
    if (!body.id) return err("id is required");

    const existing = await prisma.commissionPolicy.findUnique({ where: { id: body.id } });
    if (!existing) return err("Policy not found", 404);

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.valueType !== undefined) updateData.valueType = body.valueType;
    if (body.value !== undefined) updateData.value = parseFloat(body.value);
    if (body.departmentId !== undefined) updateData.departmentId = body.departmentId || null;
    if (body.serviceId !== undefined) updateData.serviceId = body.serviceId || null;
    if (body.minBillSize !== undefined) updateData.minBillSize = body.minBillSize ? parseFloat(body.minBillSize) : null;
    if (body.campaignName !== undefined) updateData.campaignName = body.campaignName || null;
    if (body.effectiveFrom !== undefined) updateData.effectiveFrom = new Date(body.effectiveFrom);
    if (body.effectiveTo !== undefined) updateData.effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;

    const updated = await prisma.commissionPolicy.update({
      where: { id: body.id },
      data: updateData,
    });

    await createAuditLog({
      userId: user.userId,
      action: "UPDATE_COMMISSION_POLICY",
      entityType: "CommissionPolicy",
      entityId: updated.id,
      oldData: existing,
      newData: updated,
    });

    return ok(updated);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}

// DELETE — Remove policy
export async function DELETE(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return err("id is required");

    const existing = await prisma.commissionPolicy.findUnique({ where: { id } });
    if (!existing) return err("Policy not found", 404);

    await prisma.commissionPolicy.delete({ where: { id } });

    await createAuditLog({
      userId: user.userId,
      action: "DELETE_COMMISSION_POLICY",
      entityType: "CommissionPolicy",
      entityId: id,
      oldData: existing,
    });

    return ok({ deleted: true });
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
