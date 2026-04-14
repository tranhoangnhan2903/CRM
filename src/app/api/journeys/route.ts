import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { okWithMeta, unauthorized } from "@/lib/response";
import { getPagination, getPaginationMeta } from "@/lib/pagination";

type JourneyBill = {
  id: string;
  stageNo: number;
  previousBillId: string | null;
  totalAmount: number;
  status: string;
  transactionAt: Date | null;
  createdAt: Date;
  orders: Array<{
    id: string;
    service: { name: string };
    executor: { fullName: string } | null;
    quantity: number;
    price: number;
    status: string;
  }>;
  commissions: Array<{
    type: string;
    amount: number;
    status: string;
    serviceOrderId: string | null;
    userId: string;
  }>;
};

type SortDirection = "asc" | "desc";
type JourneySortKey =
  | "fullName"
  | "phone"
  | "yearOfBirth"
  | "gender"
  | "totalAmount"
  | "totalDoctorCommission"
  | "journeyCount";

type JourneyCustomerSummary = {
  id: string;
  fullName: string;
  phone: string;
  yearOfBirth: number | null;
  gender: string | null;
  updatedAt: Date;
  totalAmount: number;
  totalDoctorCommission: number;
  journeyCount: number;
};

const VALID_SORT_KEYS: JourneySortKey[] = [
  "fullName",
  "phone",
  "yearOfBirth",
  "gender",
  "totalAmount",
  "totalDoctorCommission",
  "journeyCount",
];

function parseSortDirection(value: string | null): SortDirection {
  return value === "asc" ? "asc" : "desc";
}

function parseSortKey(value: string | null): JourneySortKey | null {
  return VALID_SORT_KEYS.includes(value as JourneySortKey) ? (value as JourneySortKey) : null;
}

function compareNullableNumber(left: number | null, right: number | null, direction: SortDirection) {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return direction === "asc" ? left - right : right - left;
}

function compareNullableString(left: string | null, right: string | null, direction: SortDirection) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  const compared = left.localeCompare(right, "vi", { sensitivity: "base", numeric: true });
  return direction === "asc" ? compared : -compared;
}

function sortJourneySummaries(
  summaries: JourneyCustomerSummary[],
  sortBy: JourneySortKey | null,
  sortDirection: SortDirection,
) {
  return [...summaries].sort((left, right) => {
    let primary = 0;

    if (!sortBy) {
      primary = right.updatedAt.getTime() - left.updatedAt.getTime();
    } else {
      switch (sortBy) {
        case "fullName":
          primary = compareNullableString(left.fullName, right.fullName, sortDirection);
          break;
        case "phone":
          primary = compareNullableString(left.phone, right.phone, sortDirection);
          break;
        case "yearOfBirth":
          primary = compareNullableNumber(left.yearOfBirth, right.yearOfBirth, sortDirection);
          break;
        case "gender":
          primary = compareNullableString(left.gender, right.gender, sortDirection);
          break;
        case "totalAmount":
          primary = compareNullableNumber(left.totalAmount, right.totalAmount, sortDirection);
          break;
        case "totalDoctorCommission":
          primary = compareNullableNumber(left.totalDoctorCommission, right.totalDoctorCommission, sortDirection);
          break;
        case "journeyCount":
          primary = compareNullableNumber(left.journeyCount, right.journeyCount, sortDirection);
          break;
      }
    }

    if (primary !== 0) {
      return primary;
    }

    const byName = left.fullName.localeCompare(right.fullName, "vi", {
      sensitivity: "base",
      numeric: true,
    });
    if (byName !== 0) {
      return byName;
    }

    return left.id.localeCompare(right.id, "vi", {
      sensitivity: "base",
      numeric: true,
    });
  });
}

function getBillJourneyDate(bill: Pick<JourneyBill, "transactionAt" | "createdAt">) {
  return bill.transactionAt || bill.createdAt;
}

function buildJourneyChains(bills: JourneyBill[]) {
  const billById = new Map(bills.map((bill) => [bill.id, bill]));
  const children = new Map<string, JourneyBill[]>();

  bills.forEach((bill) => {
    if (!bill.previousBillId) {
      return;
    }

    const currentChildren = children.get(bill.previousBillId) || [];
    currentChildren.push(bill);
    currentChildren.sort((left, right) => left.stageNo - right.stageNo || getBillJourneyDate(left).getTime() - getBillJourneyDate(right).getTime());
    children.set(bill.previousBillId, currentChildren);
  });

  const roots = bills
    .filter((bill) => !bill.previousBillId || !billById.has(bill.previousBillId))
    .sort((left, right) => getBillJourneyDate(left).getTime() - getBillJourneyDate(right).getTime());

  return roots.map((root) => {
    const chain: JourneyBill[] = [root];
    let current = root;

    while (children.get(current.id)?.length) {
      const next = children.get(current.id)?.[0];
      if (!next) {
        break;
      }
      chain.push(next);
      current = next;
    }

    const totalDoctorCommission = chain.reduce((sum, bill) => {
      const billOrderIds = bill.orders.map((order) => order.id);
      const nextBill = children.get(bill.id)?.[0];

      const executorAmount = bill.commissions
        .filter((commission) => commission.type === "EXECUTOR" && commission.status !== "CANCELLED")
        .reduce((commissionSum, commission) => commissionSum + commission.amount, 0);

      const indicationAmount = bill.commissions
        .filter((commission) => commission.type === "INDICATION" && commission.status !== "CANCELLED")
        .reduce((commissionSum, commission) => commissionSum + commission.amount, 0);

      const stageReferralAmount = nextBill
        ? nextBill.commissions
            .filter((commission) => (
              commission.type === "STAGE_REFERRAL"
              && commission.status !== "CANCELLED"
              && commission.serviceOrderId
              && billOrderIds.includes(commission.serviceOrderId)
            ))
            .reduce((commissionSum, commission) => commissionSum + commission.amount, 0)
        : 0;

      return sum + executorAmount + indicationAmount + stageReferralAmount;
    }, 0);

    return {
      rootBillId: root.id,
      stageFlow: chain.map((bill) => `Stage ${bill.stageNo}`).join(" -> "),
      totalAmount: chain
        .filter((bill) => bill.status !== "CANCELLED")
        .reduce((sum, bill) => sum + bill.totalAmount, 0),
      totalDoctorCommission,
      stages: chain.map((bill) => {
        const billOrderIds = bill.orders.map((order) => order.id);
        const nextBill = children.get(bill.id)?.[0];
        const doctorPayouts = Object.values(
          [
            ...bill.commissions.filter((commission) => (
              ["EXECUTOR", "INDICATION"].includes(commission.type) && commission.status !== "CANCELLED"
            )),
            ...((nextBill?.commissions || []).filter((commission) => (
              commission.type === "STAGE_REFERRAL"
              && commission.status !== "CANCELLED"
              && commission.serviceOrderId
              && billOrderIds.includes(commission.serviceOrderId)
            ))),
          ].reduce<Record<string, { doctorName: string; amount: number }>>((acc, commission) => {
              const linkedOrder = bill.orders.find((order) => order.id === commission.serviceOrderId);
              const doctorName = linkedOrder?.executor?.fullName || "Chưa gán";
              const currentPayout = acc[doctorName] ?? { doctorName, amount: 0 };
              currentPayout.amount += commission.amount;
              acc[doctorName] = currentPayout;
              return acc;
            }, {})
        );

        return {
          id: bill.id,
          stageNo: bill.stageNo,
          previousBillId: bill.previousBillId,
          totalAmount: bill.totalAmount,
          status: bill.status,
          transactionAt: getBillJourneyDate(bill),
          doctorCommissionAmount:
            bill.commissions
              .filter((commission) => commission.type === "EXECUTOR" && commission.status !== "CANCELLED")
              .reduce((sum, commission) => sum + commission.amount, 0)
            + bill.commissions
              .filter((commission) => commission.type === "INDICATION" && commission.status !== "CANCELLED")
              .reduce((sum, commission) => sum + commission.amount, 0)
            + ((nextBill?.commissions || [])
              .filter((commission) => (
                commission.type === "STAGE_REFERRAL"
                && commission.status !== "CANCELLED"
                && commission.serviceOrderId
                && billOrderIds.includes(commission.serviceOrderId)
              ))
              .reduce((sum, commission) => sum + commission.amount, 0)),
          executorCommissionAmount: bill.commissions
            .filter((commission) => commission.type === "EXECUTOR" && commission.status !== "CANCELLED")
            .reduce((sum, commission) => sum + commission.amount, 0),
          indicationCommissionAmount: bill.commissions
            .filter((commission) => commission.type === "INDICATION" && commission.status !== "CANCELLED")
            .reduce((sum, commission) => sum + commission.amount, 0),
          stageReferralCommissionAmount: (nextBill?.commissions || [])
            .filter((commission) => (
              commission.type === "STAGE_REFERRAL"
              && commission.status !== "CANCELLED"
              && commission.serviceOrderId
              && billOrderIds.includes(commission.serviceOrderId)
            ))
            .reduce((sum, commission) => sum + commission.amount, 0),
          doctorPayouts,
          services: bill.orders.map((order) => order.service.name),
          executors: Array.from(
            new Set(
              bill.orders
                .map((order) => order.executor?.fullName)
                .filter((name): name is string => Boolean(name))
            )
          ),
        };
      }),
    };
  });
}

export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  const pagination = getPagination(req, { limit: 50, maxLimit: 150 });
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim();
  const sortBy = parseSortKey(searchParams.get("sortBy"));
  const sortDirection = parseSortDirection(searchParams.get("sortDir"));

  const searchFilter = query ? {
    OR: [
      { fullName: { contains: query } },
      { phone: { contains: query } },
      { email: { contains: query } },
    ],
  } : {};

  const privileged = requireRole(user, "ADMIN", "RECEPTIONIST", "ACCOUNTANT", "MANAGER");
  const where = privileged
    ? searchFilter
    : {
        AND: [
          {
            OR: [
              { referrals: { some: { referrerId: user.userId } } },
              { appointments: { some: { doctorId: user.userId } } },
              { bills: { some: { orders: { some: { executorId: user.userId } } } } },
            ],
          },
          searchFilter,
        ],
      };

  const customerSummaries = await prisma.customer.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      phone: true,
      yearOfBirth: true,
      gender: true,
      updatedAt: true,
    },
  });

  if (customerSummaries.length === 0) {
    return okWithMeta([], getPaginationMeta(0, pagination.page, pagination.limit));
  }

  const customerIds = customerSummaries.map((customer) => customer.id);

  const [billAmountGroups, billCountGroups, commissionGroups] = await Promise.all([
    prisma.bill.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: customerIds },
        status: { not: "CANCELLED" },
      },
      _sum: {
        totalAmount: true,
      },
    }),
    prisma.bill.groupBy({
      by: ["customerId"],
      where: {
        customerId: { in: customerIds },
      },
      _count: {
        _all: true,
      },
    }),
    prisma.$queryRaw<Array<{ customerId: string; totalDoctorCommission: number | string | null }>>(Prisma.sql`
      SELECT
        b."customerId" AS "customerId",
        COALESCE(SUM(c."amount"), 0) AS "totalDoctorCommission"
      FROM "Bill" b
      LEFT JOIN "Commission" c
        ON c."billId" = b."id"
        AND c."status" <> 'CANCELLED'
        AND c."type" IN ('EXECUTOR', 'INDICATION', 'STAGE_REFERRAL')
      WHERE b."customerId" IN (${Prisma.join(customerIds)})
      GROUP BY b."customerId"
    `),
  ]);

  const totalAmountMap = new Map(
    billAmountGroups.map((group) => [group.customerId, group._sum.totalAmount || 0]),
  );
  const journeyCountMap = new Map(
    billCountGroups.map((group) => [group.customerId, group._count._all]),
  );
  const commissionMap = new Map(
    commissionGroups.map((group) => [group.customerId, Number(group.totalDoctorCommission) || 0]),
  );

  const sortedSummaries = sortJourneySummaries(
    customerSummaries.map((customer) => ({
      ...customer,
      totalAmount: totalAmountMap.get(customer.id) || 0,
      totalDoctorCommission: commissionMap.get(customer.id) || 0,
      journeyCount: journeyCountMap.get(customer.id) || 0,
    })),
    sortBy,
    sortDirection,
  );

  const pageSummaries = sortedSummaries.slice(pagination.skip, pagination.skip + pagination.limit);
  const pageCustomerIds = pageSummaries.map((customer) => customer.id);

  const customers = pageCustomerIds.length > 0
    ? await prisma.customer.findMany({
        where: {
          id: { in: pageCustomerIds },
        },
        include: {
          bills: {
            include: {
              orders: {
                include: {
                  service: true,
                  executor: true,
                },
              },
              commissions: true,
            },
            orderBy: [{ stageNo: "asc" }, { transactionAt: "asc" }],
          },
        },
      })
    : [];

  const customerById = new Map(customers.map((customer) => [customer.id, customer]));

  const result = pageSummaries.map((summary) => {
    const customer = customerById.get(summary.id);

    return {
      id: summary.id,
      fullName: summary.fullName,
      phone: summary.phone,
      yearOfBirth: summary.yearOfBirth,
      gender: summary.gender,
      totalAmount: summary.totalAmount,
      totalDoctorCommission: summary.totalDoctorCommission,
      journeyCount: summary.journeyCount,
      journeys: customer ? buildJourneyChains(customer.bills) : [],
    };
  });

  return okWithMeta(result, getPaginationMeta(sortedSummaries.length, pagination.page, pagination.limit));
}
