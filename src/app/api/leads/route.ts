import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, okWithMeta, err, unauthorized, forbidden } from "@/lib/response";
import { getPagination, getPaginationMeta } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  const pagination = getPagination(req, { limit: 100, maxLimit: 300 });

  const where = requireRole(user, "ADMIN", "RECEPTIONIST", "SALES")
    ? {}
    : { customer: { OR: [
        { referrals: { some: { referrerId: user.userId } } },
        { appointments: { some: { doctorId: user.userId } } },
      ] } };

  const [total, leads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      include: { customer: true },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return okWithMeta(leads, getPaginationMeta(total, pagination.page, pagination.limit));
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "SALES", "RECEPTIONIST")) return forbidden();

  try {
    const body = await req.json();
    if (typeof body.customerId !== "string" || !body.customerId) {
      return err("customerId is required");
    }
    if (typeof body.source !== "string" || body.source.trim().length < 2) {
      return err("source is required");
    }
    const lead = await prisma.lead.create({
      data: {
        customerId: body.customerId,
        source: body.source.trim(),
        status: typeof body.status === "string" ? body.status : "NEW",
        notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      },
    });
    return ok(lead, 201);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "SALES", "RECEPTIONIST")) return forbidden();

  try {
    const body = await req.json();
    if (!body.id) return err("id is required");
    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.source !== undefined) data.source = body.source;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.customerId !== undefined) data.customerId = body.customerId;
    const updated = await prisma.lead.update({ where: { id: body.id }, data });
    return ok(updated);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return err("id is required");
    await prisma.lead.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
