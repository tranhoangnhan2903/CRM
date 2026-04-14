import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, okWithMeta, err, unauthorized, forbidden } from "@/lib/response";
import { getPagination, getPaginationMeta } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();
  const pagination = getPagination(req, { limit: 100, maxLimit: 300 });

  const [total, roles] = await Promise.all([
    prisma.role.count(),
    prisma.role.findMany({
      orderBy: { name: "asc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);
  return okWithMeta(roles, getPaginationMeta(total, pagination.page, pagination.limit));
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();

  try {
    const body = await req.json();
    const role = await prisma.role.create({
      data: { name: body.name, description: body.description || null },
    });
    return ok(role, 201);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
