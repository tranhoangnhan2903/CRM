import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, unauthorized, forbidden } from "@/lib/response";

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "ACCOUNTANT", "MANAGER")) return forbidden();

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [
    totalRevenue,
    totalCommissions,
    pendingCommissions,
    customerCount,
    leadStats,
    recentBills,
    orders,
    commissionByMonth,
    stageBills,
    pendingCommissionGroups,
    completedOrders,
  ] = await Promise.all([
    prisma.bill.aggregate({
      where: { status: "PAID" },
      _sum: { totalAmount: true },
    }),
    prisma.commission.aggregate({
      where: { status: { not: "CANCELLED" } },
      _sum: { amount: true },
    }),
    prisma.commission.aggregate({
      where: { status: "PENDING_APPROVAL" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.customer.count(),
    prisma.lead.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.bill.findMany({
      where: {
        status: "PAID",
        transactionAt: { gte: sixMonthsAgo },
      },
      select: { totalAmount: true, transactionAt: true },
    }),
    prisma.serviceOrder.findMany({
      where: {
        bill: { status: "PAID" },
      },
      select: {
        serviceId: true,
        quantity: true,
        price: true,
        service: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.commission.groupBy({
      by: ["payoutMonth"],
      where: { status: { not: "CANCELLED" } },
      _sum: { amount: true },
      _count: true,
      orderBy: { payoutMonth: "desc" },
      take: 6,
    }),
    prisma.bill.findMany({
      select: {
        stageNo: true,
        totalAmount: true,
        payoutRequestStatus: true,
        commissions: {
          select: {
            type: true,
            amount: true,
            status: true,
          },
        },
      },
      orderBy: [{ stageNo: "asc" }, { transactionAt: "desc" }],
    }),
    prisma.commission.groupBy({
      by: ["userId"],
      where: {
        type: { in: ["EXECUTOR", "INDICATION", "STAGE_REFERRAL"] },
        status: { not: "CANCELLED" },
        bill: {
          payoutRequestStatus: "PENDING",
        },
      },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.serviceOrder.findMany({
      where: {
        status: "COMPLETED",
        bill: {
          status: "PAID",
        },
      },
      select: {
        quantity: true,
        price: true,
        executor: {
          select: {
            fullName: true,
          },
        },
      },
    }),
  ]);

  const monthlyRevenue: Record<string, number> = {};
  for (const bill of recentBills) {
    const billDate = bill.transactionAt;
    const month = `${billDate.getFullYear()}-${String(billDate.getMonth() + 1).padStart(2, "0")}`;
    monthlyRevenue[month] = (monthlyRevenue[month] || 0) + bill.totalAmount;
  }

  const serviceDetails = Object.values(
    orders.reduce<Record<string, { name: string; count: number; revenue: number }>>((acc, order) => {
      const current = acc[order.serviceId] ?? {
        name: order.service?.name || "Không rõ",
        count: 0,
        revenue: 0,
      };
      current.count += 1;
      current.revenue += order.price * order.quantity;
      acc[order.serviceId] = current;
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count).slice(0, 5);

  const stageSummary = Object.values(
    stageBills.reduce<Record<number, {
      stageNo: number;
      billCount: number;
      revenue: number;
      payoutRequestedAmount: number;
      payoutPaidAmount: number;
      requestCount: number;
    }>>((acc, bill) => {
      const current = acc[bill.stageNo] ?? {
        stageNo: bill.stageNo,
        billCount: 0,
        revenue: 0,
        payoutRequestedAmount: 0,
        payoutPaidAmount: 0,
        requestCount: 0,
      };
      const doctorCommissionAmount = bill.commissions
        .filter((commission) => ["EXECUTOR", "INDICATION", "STAGE_REFERRAL"].includes(commission.type) && commission.status !== "CANCELLED")
        .reduce((sum, commission) => sum + commission.amount, 0);

      current.billCount += 1;
      current.revenue += bill.totalAmount;
      if (bill.payoutRequestStatus === "PENDING") {
        current.payoutRequestedAmount += doctorCommissionAmount;
        current.requestCount += 1;
      }
      if (bill.payoutRequestStatus === "PAID") {
        current.payoutPaidAmount += doctorCommissionAmount;
      }
      acc[bill.stageNo] = current;
      return acc;
    }, {})
  ).sort((a, b) => a.stageNo - b.stageNo);

  const doctorIds = pendingCommissionGroups.map((commission) => commission.userId);
  const doctorUsers = doctorIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: doctorIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const doctorNameMap = new Map(doctorUsers.map((doctor) => [doctor.id, doctor.fullName]));

  const payoutQueue = pendingCommissionGroups
    .map((commission) => ({
      doctorId: commission.userId,
      doctorName: doctorNameMap.get(commission.userId) || "Bác sĩ",
      totalCommissionAmount: commission._sum.amount || 0,
      requestedCount: commission._count,
    }))
    .sort((a, b) => b.totalCommissionAmount - a.totalCommissionAmount);

  const doctorLeaderboard = Object.values(
    completedOrders.reduce<Record<string, { doctorName: string; revenue: number; completedOrders: number }>>((acc, order) => {
      if (!order.executor?.fullName) {
        return acc;
      }
      const current = acc[order.executor.fullName] ?? {
        doctorName: order.executor.fullName,
        revenue: 0,
        completedOrders: 0,
      };
      current.revenue += order.price * order.quantity;
      current.completedOrders += 1;
      acc[order.executor.fullName] = current;
      return acc;
    }, {})
  ).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  return ok({
    viewerRole: user.role,
    totalRevenue: totalRevenue._sum.totalAmount || 0,
    totalCommissions: totalCommissions._sum.amount || 0,
    pendingCommissions: {
      amount: pendingCommissions._sum.amount || 0,
      count: pendingCommissions._count || 0,
    },
    customerCount,
    leadStats,
    monthlyRevenue,
    topServices: serviceDetails,
    commissionByMonth,
    stageSummary,
    payoutQueue,
    doctorLeaderboard,
  });
}
