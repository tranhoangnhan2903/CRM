import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, okWithMeta, err, unauthorized, forbidden } from "@/lib/response";
import { getPagination, getPaginationMeta } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  const pagination = getPagination(req, { limit: 100, maxLimit: 300 });

  const [total, services] = await Promise.all([
    prisma.service.count(),
    prisma.service.findMany({
      include: { department: true },
      orderBy: { name: "asc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);
  return okWithMeta(services, getPaginationMeta(total, pagination.page, pagination.limit));
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();

  try {
    const body = await req.json();
    if (!body.code || !body.name || body.price === undefined) return err("code, name, price are required");
    const service = await prisma.service.create({
      data: {
        code: body.code,
        name: body.name,
        description: body.description || null,
        price: parseFloat(body.price),
        departmentId: body.departmentId || null,
      },
    });
    return ok(service, 201);
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
    if (body.code !== undefined) data.code = body.code;
    if (body.name !== undefined) data.name = body.name;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.price !== undefined) data.price = parseFloat(body.price);
    if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
    const updated = await prisma.service.update({ where: { id: body.id }, data });
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
    await prisma.service.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
