import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { ok, unauthorized } from "@/lib/response";

// Personal dashboard for any user
export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();

  // My commissions summary
  const myCommissions = await prisma.commission.aggregate({
    where: { userId: user.userId, status: { not: "CANCELLED" } },
    _sum: { amount: true },
    _count: true,
  });

  const myPaidCommissions = await prisma.commission.aggregate({
    where: { userId: user.userId, status: "PAID" },
    _sum: { amount: true },
  });

  const myPendingCommissions = await prisma.commission.aggregate({
    where: { userId: user.userId, status: "PENDING_APPROVAL" },
    _sum: { amount: true },
    _count: true,
  });

  // My recent commissions
  const recentCommissions = await prisma.commission.findMany({
    where: { userId: user.userId },
    include: {
      bill: { include: { customer: true, orders: { include: { service: { include: { department: true } } } } } },
      order: { include: { service: { include: { department: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Commission by month
  const monthlyCommission = await prisma.commission.groupBy({
    by: ["payoutMonth"],
    where: { userId: user.userId, status: { not: "CANCELLED" } },
    _sum: { amount: true },
    _count: true,
    orderBy: { payoutMonth: "desc" },
    take: 6,
  });

  // My referrals
  const myReferrals = await prisma.referral.findMany({
    where: { referrerId: user.userId },
    include: { referredCustomer: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const myExecutedOrders = await prisma.serviceOrder.findMany({
    where: {
      executorId: user.userId,
      status: "COMPLETED",
      bill: {
        status: "PAID",
      },
    },
    include: {
      service: { include: { department: true } },
      bill: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const totalExecutedRevenue = myExecutedOrders.reduce(
    (sum, order) => sum + order.price * order.quantity,
    0
  );

  const revenueByStage = Object.values(
    myExecutedOrders.reduce<Record<number, { stageNo: number; revenue: number; orders: number }>>((acc, order) => {
      const stageNo = order.bill?.stageNo ?? 1;
      const current = acc[stageNo] ?? { stageNo, revenue: 0, orders: 0 };
      current.revenue += order.price * order.quantity;
      current.orders += 1;
      acc[stageNo] = current;
      return acc;
    }, {})
  ).sort((a, b) => a.stageNo - b.stageNo);

  const payoutRequestSummary = await prisma.commission.aggregate({
    where: {
      userId: user.userId,
      type: { in: ["EXECUTOR", "INDICATION", "STAGE_REFERRAL"] },
      bill: {
        payoutRequestStatus: "PENDING",
      },
    },
    _sum: { amount: true },
    _count: true,
  });

  return ok({
    totalCommissions: myCommissions._sum.amount || 0,
    commissionCount: myCommissions._count || 0,
    paidCommissions: myPaidCommissions._sum.amount || 0,
    pendingCommissions: {
      amount: myPendingCommissions._sum.amount || 0,
      count: myPendingCommissions._count || 0,
    },
    totalExecutedRevenue,
    completedOrders: myExecutedOrders.length,
    revenueByStage,
    payoutRequestSummary: {
      amount: payoutRequestSummary._sum.amount || 0,
      count: payoutRequestSummary._count || 0,
    },
    recentExecutedOrders: myExecutedOrders.map((order) => ({
      id: order.id,
      serviceName: order.service.name,
      billId: order.billId,
      stageNo: order.bill?.stageNo ?? 1,
      departmentName: order.service.department?.name || "Chưa rõ khoa",
      revenue: order.price * order.quantity,
      payoutRequestStatus: order.bill?.payoutRequestStatus ?? "NONE",
      completedAt: order.bill?.transactionAt ?? order.updatedAt,
    })),
    recentCommissions: recentCommissions.map((commission) => ({
      ...commission,
      order: commission.order ? {
        service: {
          name: commission.order.service.name,
          departmentName: commission.order.service.department?.name || "Chưa rõ khoa",
        },
      } : undefined,
      fromDepartmentName: commission.order?.service.department?.name || null,
      toDepartmentName: commission.type === "STAGE_REFERRAL"
        ? Array.from(
          new Set(
            commission.bill?.orders
              .map((order) => order.service.department?.name)
              .filter((name): name is string => Boolean(name)) || []
          )
        ).join(", ") || null
        : null,
    })),
    monthlyCommission,
    myReferrals,
  });
}
