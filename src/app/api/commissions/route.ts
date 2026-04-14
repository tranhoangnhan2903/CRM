import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, okWithMeta, err, unauthorized, forbidden } from "@/lib/response";
import { auditFromUser } from "@/lib/audit";
import { getPagination, getPaginationMeta } from "@/lib/pagination";

// GET /api/commissions
export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  const pagination = getPagination(req, { limit: 100, maxLimit: 300 });

  const where = requireRole(user, "ADMIN", "ACCOUNTANT")
    ? {}
    : { userId: user.userId };

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const status = searchParams.get("status");

  const filter: Record<string, unknown> = { ...where };
  if (month) filter.payoutMonth = month;
  if (status) filter.status = status;

  const [total, commissions] = await Promise.all([
    prisma.commission.count({ where: filter }),
    prisma.commission.findMany({
      where: filter,
      include: {
        bill: { include: { customer: true } },
        order: { include: { service: true } },
        referral: true,
        workflows: true,
      },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return okWithMeta(commissions, getPaginationMeta(total, pagination.page, pagination.limit));
}

// PATCH /api/commissions — approve/reject/pay
export async function PATCH(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "ACCOUNTANT")) return forbidden();

  try {
    const body = await req.json();
    const { id, action, comments } = body; // action: APPROVE, REJECT, PAY

    if (!id || !action) return err("id and action required");

    const commission = await prisma.commission.findUnique({ where: { id } });
    if (!commission) return err("Commission not found", 404);

    let newStatus = commission.status;
    if (action === "APPROVE" && commission.status === "PENDING_APPROVAL") {
      newStatus = "APPROVED";
    } else if (action === "REJECT" && commission.status === "PENDING_APPROVAL") {
      newStatus = "CANCELLED";
    } else if (action === "PAY" && commission.status === "APPROVED") {
      newStatus = "PAID";
    } else {
      return err(`Cannot ${action} commission in status ${commission.status}`);
    }

    const updated = await prisma.commission.update({
      where: { id },
      data: { status: newStatus },
    });

    // Create approval workflow entry
    await prisma.approvalWorkflow.create({
      data: {
        commissionId: id,
        approverId: user.userId,
        status: action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "APPROVED",
        comments: comments || null,
      },
    });

    await auditFromUser(user, `COMMISSION_${action}`, "Commission", id, commission, updated);
    return ok(updated);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
