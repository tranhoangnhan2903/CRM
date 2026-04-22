import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, okWithMeta, err, unauthorized, forbidden } from "@/lib/response";
import { auditFromUser } from "@/lib/audit";
import { getPagination, getPaginationMeta } from "@/lib/pagination";
import {
  createBillPaidCommissions,
  reverseCommissionsForBill,
} from "@/lib/commission";

function parseDateBoundary(value: string, endOfDay = false) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date(value);
  }

  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
}

// GET /api/bills
export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  const pagination = getPagination(req, { limit: 100, maxLimit: 300 });
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  const status = searchParams.get("status")?.trim();
  const payoutStatus = searchParams.get("payoutStatus")?.trim();
  const fromDate = searchParams.get("fromDate")?.trim();
  const toDate = searchParams.get("toDate")?.trim();

  const accessWhere = requireRole(user, "ADMIN", "ACCOUNTANT", "MANAGER")
    ? {}
    : user.role === "DOCTOR"
      ? {
        OR: [
          {
            orders: {
              some: {
                executorId: user.userId,
              },
            },
          },
          {
            commissions: {
              some: {
                userId: user.userId,
                type: { in: ["EXECUTOR", "INDICATION", "STAGE_REFERRAL"] },
                status: { not: "CANCELLED" },
              },
            },
          },
        ],
      }
      : {
        customer: {
          OR: [
            { referrals: { some: { referrerId: user.userId } } },
            { appointments: { some: { doctorId: user.userId } } },
          ],
        },
      };

  const filters: Record<string, unknown>[] = [accessWhere];

  if (query) {
    filters.push({
      customer: {
        OR: [
          { fullName: { contains: query } },
          { phone: { contains: query } },
        ],
      },
    });
  }

  if (status) {
    filters.push({ status });
  }

  if (payoutStatus) {
    filters.push({ payoutRequestStatus: payoutStatus });
  }

  if (fromDate || toDate) {
    const transactionDateFilter = {
      ...(fromDate ? { gte: parseDateBoundary(fromDate) } : {}),
      ...(toDate ? { lte: parseDateBoundary(toDate, true) } : {}),
    };

    filters.push({ transactionAt: transactionDateFilter });
  }

  const where = filters.length === 1
    ? accessWhere
    : {
      AND: filters,
    };

  const [total, bills] = await Promise.all([
    prisma.bill.count({ where }),
    prisma.bill.findMany({
      where,
      include: {
        customer: true,
        orders: { include: { service: { include: { department: true } }, executor: true } },
        payments: true,
        commissions: true,
        _count: { select: { commissions: true } },
      },
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { transactionAt: "desc" },
    }),
  ]);

  return okWithMeta(bills, getPaginationMeta(total, pagination.page, pagination.limit));
}

// POST /api/bills — create bill with service orders
export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "RECEPTIONIST", "ACCOUNTANT", "MANAGER")) return forbidden();

  try {
    const body = await req.json();
    const { customerId, orders, stageNo, previousBillId } = body;

    if (!customerId || !orders?.length) return err("customerId and orders required");

    let resolvedStageNo = typeof stageNo === "number" ? stageNo : 1;
    if (previousBillId && stageNo === undefined) {
      const previousBill = await prisma.bill.findUnique({ where: { id: previousBillId } });
      if (!previousBill) return err("Previous bill not found");
      resolvedStageNo = previousBill.stageNo + 1;
    }

    const resolvedOrders = body.orders as Array<{ serviceId: string; executorId?: string; quantity?: number }>;

    // Resolve departmentLabel from services
    let departmentLabel = "Chưa rõ khoa";
    if (resolvedOrders.length > 0) {
      const firstService = await prisma.service.findUnique({
        where: { id: resolvedOrders[0].serviceId },
        include: { department: true },
      });
      departmentLabel = firstService?.department?.name || departmentLabel;
    }

    let totalAmount = 0;
    const orderData = [];

    for (const o of orders) {
      const svc = await prisma.service.findUnique({ where: { id: o.serviceId } });
      if (!svc) return err(`Service ${o.serviceId} not found`);
      const qty = o.quantity || 1;
      const price = svc.price;
      totalAmount += price * qty;
      orderData.push({
        serviceId: o.serviceId,
        executorId: o.executorId || null,
        quantity: qty,
        price,
        status: "PENDING",
      });
    }

    const bill = await prisma.bill.create({
      data: {
        customerId,
        totalAmount,
        status: "DRAFT",
        stageNo: resolvedStageNo,
        departmentLabel,
        previousBillId: previousBillId || null,
        transactionAt: new Date(),
        orders: { create: orderData },
      },
      include: { orders: { include: { service: true } }, customer: true },
    });

    await auditFromUser(user, "CREATE_BILL", "Bill", bill.id, null, bill);
    return ok(bill, 201);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}

// PATCH /api/bills — update bill status
export async function PATCH(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();

  try {
    const body = await req.json();
    const { id, status, action } = body;
    if (!id) return err("id is required");

    const old = await prisma.bill.findUnique({ where: { id } });
    if (!old) return err("Bill not found", 404);

    if (action === "REQUEST_PAYOUT") {
      if (!requireRole(user, "ADMIN", "MANAGER", "DOCTOR")) return forbidden();

      const canRequest = user.role !== "DOCTOR" || await prisma.bill.findFirst({
        where: {
          id,
          OR: [
            {
              orders: {
                some: {
                  executorId: user.userId,
                },
              },
            },
            {
              commissions: {
                some: {
                  userId: user.userId,
                  type: { in: ["EXECUTOR", "INDICATION", "STAGE_REFERRAL"] },
                  status: { not: "CANCELLED" },
                },
              },
            },
          ],
        },
      });
      if (!canRequest) return forbidden();
      if (old.status !== "PAID") return err("Only paid bills can be sent for payout");
      if (old.payoutRequestStatus === "PENDING") return err("Payout already requested for this bill");

      const doctorRelatedCommissions = await prisma.commission.findMany({
        where: {
          billId: id,
          type: { in: ["EXECUTOR", "INDICATION", "STAGE_REFERRAL"] },
          status: { not: "CANCELLED" },
        },
      });
      if (doctorRelatedCommissions.length === 0) return err("No doctor commission found for this bill");

      const requestedBill = await prisma.bill.update({
        where: { id },
        data: {
          payoutRequestStatus: "PENDING",
          payoutRequestedAt: new Date(),
          payoutRequestedById: user.userId,
        },
      });

      await auditFromUser(user, "REQUEST_BILL_PAYOUT", "Bill", id, old, requestedBill);
      return ok(requestedBill);
    }

    if (action === "MARK_PAYOUT_PAID") {
      if (!requireRole(user, "ADMIN", "ACCOUNTANT")) return forbidden();
      if (old.payoutRequestStatus !== "PENDING") return err("This bill is not waiting for payout");

      const paidBill = await prisma.bill.update({
        where: { id },
        data: {
          payoutRequestStatus: "PAID",
          payoutCompletedAt: new Date(),
        },
      });

      const commissions = await prisma.commission.findMany({
        where: {
          billId: id,
          type: { in: ["EXECUTOR", "INDICATION", "STAGE_REFERRAL"] },
          status: { not: "CANCELLED" },
        },
      });

      await Promise.all(
        commissions.map(async (commission) => {
          const updatedCommission = await prisma.commission.update({
            where: { id: commission.id },
            data: { status: "PAID" },
          });

          await prisma.approvalWorkflow.create({
            data: {
              commissionId: commission.id,
              approverId: user.userId,
              status: "APPROVED",
              comments: `Payout completed for bill ${paidBill.departmentLabel} (stage ${paidBill.stageNo})`,
            },
          });

          await auditFromUser(user, "MARK_EXECUTOR_COMMISSION_PAID", "Commission", commission.id, commission, updatedCommission);
        })
      );

      await auditFromUser(user, "MARK_BILL_PAYOUT_PAID", "Bill", id, old, paidBill);
      return ok(paidBill);
    }

    if (!status) return err("status or action required");
    if (!requireRole(user, "ADMIN", "ACCOUNTANT")) return forbidden();

    const bill = await prisma.bill.update({
      where: { id },
      data: { status },
    });

    await auditFromUser(user, "UPDATE_BILL_STATUS", "Bill", id, old, bill);

    // Business rules: create/reverse commissions
    if (status === "PAID" && old.status !== "PAID") {
      await createBillPaidCommissions(id);
    }
    if ((status === "CANCELLED" || status === "REFUNDED") && old.status === "PAID") {
      await reverseCommissionsForBill(id);
    }

    return ok(bill);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
