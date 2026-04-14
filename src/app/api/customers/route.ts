import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, okWithMeta, err, unauthorized, forbidden } from "@/lib/response";
import { auditFromUser } from "@/lib/audit";
import { getPagination, getPaginationMeta } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  const pagination = getPagination(req, { limit: 100, maxLimit: 300 });
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();

  const searchFilter = query ? {
    OR: [
      { fullName: { contains: query } },
      { phone: { contains: query } },
      { email: { contains: query } },
    ],
  } : {};

  // RLS: non-admin users only see customers linked to their referrals or appointments
  if (requireRole(user, "ADMIN", "RECEPTIONIST", "ACCOUNTANT", "MANAGER")) {
    const [total, customers] = await Promise.all([
      prisma.customer.count({ where: searchFilter }),
      prisma.customer.findMany({
      where: searchFilter,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
      include: { _count: { select: { bills: true, appointments: true } } },
      }),
    ]);
    return okWithMeta(customers, getPaginationMeta(total, pagination.page, pagination.limit));
  }

  // Doctors/Sales see only customers they interact with
  const where = {
    AND: [
      {
        OR: [
          { referrals: { some: { referrerId: user.userId } } },
          { appointments: { some: { doctorId: user.userId } } },
        ],
      },
      searchFilter,
    ],
  };

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
      include: { _count: { select: { bills: true, appointments: true } } },
    }),
  ]);
  return okWithMeta(customers, getPaginationMeta(total, pagination.page, pagination.limit));
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "RECEPTIONIST", "SALES")) return forbidden();

  try {
    const body = await req.json();
    if (typeof body.fullName !== "string" || body.fullName.trim().length < 2) {
      return err("fullName is required");
    }
    if (typeof body.phone !== "string" || body.phone.trim().length < 8) {
      return err("phone is required");
    }

    const yearOfBirth = body.yearOfBirth ? Number.parseInt(body.yearOfBirth, 10) : null;
    if (body.yearOfBirth && Number.isNaN(yearOfBirth)) {
      return err("yearOfBirth is invalid");
    }

    const customer = await prisma.customer.create({
      data: {
        fullName: body.fullName.trim(),
        phone: body.phone.trim(),
        email: typeof body.email === "string" ? body.email.trim() || null : null,
        address: typeof body.address === "string" ? body.address.trim() || null : null,
        yearOfBirth,
        gender: typeof body.gender === "string" ? body.gender : null,
      },
    });

    await auditFromUser(user, "CREATE_CUSTOMER", "Customer", customer.id, null, customer);
    return ok(customer, 201);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "RECEPTIONIST")) return forbidden();

  try {
    const body = await req.json();
    if (!body.id) return err("id is required");
    const data: Record<string, unknown> = {};
    if (body.fullName !== undefined) data.fullName = typeof body.fullName === "string" ? body.fullName.trim() : body.fullName;
    if (body.phone !== undefined) data.phone = typeof body.phone === "string" ? body.phone.trim() : body.phone;
    if (body.email !== undefined) data.email = typeof body.email === "string" ? body.email.trim() || null : null;
    if (body.address !== undefined) data.address = typeof body.address === "string" ? body.address.trim() || null : null;
    if (body.yearOfBirth !== undefined) {
      const yearOfBirth = body.yearOfBirth ? Number.parseInt(body.yearOfBirth, 10) : null;
      if (body.yearOfBirth && Number.isNaN(yearOfBirth)) {
        return err("yearOfBirth is invalid");
      }
      data.yearOfBirth = yearOfBirth;
    }
    if (body.gender !== undefined) data.gender = typeof body.gender === "string" ? body.gender || null : null;
    const updated = await prisma.customer.update({ where: { id: body.id }, data });
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
    await prisma.customer.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
