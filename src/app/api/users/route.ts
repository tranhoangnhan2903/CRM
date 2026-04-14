import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, okWithMeta, err, unauthorized, forbidden } from "@/lib/response";
import { getPagination, getPaginationMeta } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  const { searchParams } = new URL(req.url);
  const roleFilter = searchParams.get("role");
  const lightweight = searchParams.get("lightweight") === "1";
  const pagination = getPagination(req, { limit: lightweight ? 200 : 100, maxLimit: 500 });

  if (roleFilter === "DOCTOR" && lightweight) {
    if (!requireRole(user, "ADMIN", "MANAGER", "ACCOUNTANT", "RECEPTIONIST")) return forbidden();

    const where = {
      role: {
        name: "DOCTOR",
      },
    };

    const [total, doctors] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: { department: true },
        orderBy: { fullName: "asc" },
        skip: pagination.skip,
        take: pagination.limit,
      }),
    ]);

    return okWithMeta(
      doctors.map((doctor) => ({
        id: doctor.id,
        fullName: doctor.fullName,
        department: doctor.department?.name || null,
        departmentId: doctor.departmentId,
      })),
      getPaginationMeta(total, pagination.page, pagination.limit)
    );
  }

  if (!requireRole(user, "ADMIN")) return forbidden();

  const [total, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      include: { role: true, department: true },
      orderBy: { fullName: "asc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
  ]);
  return okWithMeta(
    users.map(u => ({
      id: u.id, email: u.email, fullName: u.fullName,
      role: u.role.name, roleId: u.roleId,
      department: u.department?.name || null, departmentId: u.departmentId,
      createdAt: u.createdAt,
    })),
    getPaginationMeta(total, pagination.page, pagination.limit)
  );
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN")) return forbidden();

  try {
    const body = await req.json();
    if (!body.email || !body.fullName || !body.password || !body.roleId) {
      return err("email, fullName, password, roleId are required");
    }
    const hash = await bcrypt.hash(body.password, 10);
    const newUser = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash: hash,
        fullName: body.fullName,
        roleId: body.roleId,
        departmentId: body.departmentId || null,
      },
      include: { role: true, department: true },
    });
    return ok({
      id: newUser.id, email: newUser.email, fullName: newUser.fullName,
      role: newUser.role.name, department: newUser.department?.name || null,
    }, 201);
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
    if (body.fullName !== undefined) data.fullName = body.fullName;
    if (body.email !== undefined) data.email = body.email;
    if (body.roleId !== undefined) data.roleId = body.roleId;
    if (body.departmentId !== undefined) data.departmentId = body.departmentId || null;
    if (body.password) data.passwordHash = await bcrypt.hash(body.password, 10);
    const updated = await prisma.user.update({
      where: { id: body.id }, data,
      include: { role: true, department: true },
    });
    return ok({
      id: updated.id, email: updated.email, fullName: updated.fullName,
      role: updated.role.name, department: updated.department?.name || null,
    });
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
    if (id === user.userId) return err("Cannot delete yourself");
    await prisma.user.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
