import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/response";

export async function GET(req: NextRequest) {
  const authUser = getUserFromRequest(req);
  if (!authUser) {
    return unauthorized();
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.userId },
    include: { role: true },
  });

  if (!user) {
    return unauthorized();
  }

  return ok({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role.name,
    departmentId: user.departmentId,
  });
}
