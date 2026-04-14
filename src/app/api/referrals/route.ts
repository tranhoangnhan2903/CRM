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
    : { referrerId: user.userId };

  const [total, referrals] = await Promise.all([
    prisma.referral.count({ where }),
    prisma.referral.findMany({
      where,
      include: {
        referrer: { select: { fullName: true, email: true } },
        referredCustomer: true,
        _count: { select: { commissions: true } },
      },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return okWithMeta(referrals, getPaginationMeta(total, pagination.page, pagination.limit));
}

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "SALES", "RECEPTIONIST")) return forbidden();

  try {
    const body = await req.json();
    const referrerId = requireRole(user, "ADMIN")
      ? body.referrerId || user.userId
      : user.userId;

    if (typeof body.referredCustomerId !== "string" || !body.referredCustomerId) {
      return err("referredCustomerId is required");
    }

    const referral = await prisma.referral.create({
      data: {
        referrerId,
        referredCustomerId: body.referredCustomerId,
        status: "PENDING",
      },
    });
    return ok(referral, 201);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
