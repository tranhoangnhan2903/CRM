import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, okWithMeta, err, unauthorized, forbidden } from "@/lib/response";
import { getPagination, getPaginationMeta } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  const pagination = getPagination(req, { limit: 100, maxLimit: 300 });

  const [total, depts] = await Promise.all([
    prisma.department.count(),
    prisma.department.findMany({
      include: { _count: { select: { users: true, services: true } } },
      orderBy: { name: "asc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);
  return okWithMeta(depts, getPaginationMeta(total, pagination.page, pagination.limit));
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();

  try {
    const body = await req.json();
    if (!body.name) return err("name is required");
    const dept = await prisma.department.create({
      data: {
        name: body.name,
        description: body.description || null,
        excludeStageReferral: Boolean(body.excludeStageReferral),
      },
    });
    return ok(dept, 201);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();

  try {
    const body = await req.json();
    if (!body.id) return err("id is required");
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.excludeStageReferral !== undefined) data.excludeStageReferral = Boolean(body.excludeStageReferral);
    const updated = await prisma.department.update({ where: { id: body.id }, data });
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
    await prisma.department.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
