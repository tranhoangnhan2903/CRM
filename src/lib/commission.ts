import type { CommissionPolicy } from "@prisma/client";
import prisma from "@/lib/prisma";

type PolicyType = "REFERRAL" | "EXECUTOR" | "INDICATION" | "STAGE_REFERRAL";

interface PolicyMatch {
  type: PolicyType;
  departmentId?: string | null;
  serviceId?: string | null;
  billAmount?: number;
  date: Date;
}

function getPayoutMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function comparePolicyPriority(a: CommissionPolicy, b: CommissionPolicy) {
  const comparisons = [
    Number(a.serviceId !== null) - Number(b.serviceId !== null),
    Number(a.departmentId !== null) - Number(b.departmentId !== null),
    Number(a.minBillSize !== null) - Number(b.minBillSize !== null),
    a.effectiveFrom.getTime() - b.effectiveFrom.getTime(),
  ];

  for (const diff of comparisons) {
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function calculateAmount(policyValue: number, policyValueType: string, baseAmount: number) {
  if (policyValueType === "PERCENTAGE") {
    return Math.round((baseAmount * policyValue) / 100 * 100) / 100;
  }

  return policyValue;
}

async function getExcludedStageReferralDepartmentIds(departmentIds: Array<string | null | undefined>) {
  const ids = departmentIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) {
    return new Set<string>();
  }

  const departments = await prisma.department.findMany({
    where: {
      id: { in: ids },
      excludeStageReferral: true,
    },
    select: { id: true },
  });

  return new Set(departments.map((department) => department.id));
}

async function findBestPolicy(match: PolicyMatch) {
  const policies = await prisma.commissionPolicy.findMany({
    where: {
      type: match.type,
      effectiveFrom: { lte: match.date },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: match.date } },
      ],
    },
    orderBy: { effectiveFrom: "desc" },
  });

  let bestPolicy: CommissionPolicy | null = null;
  let bestScore = -1;

  for (const policy of policies) {
    let score = 0;

    if (policy.serviceId && policy.serviceId === match.serviceId) {
      score += 10;
    } else if (policy.serviceId && policy.serviceId !== match.serviceId) {
      continue;
    }

    if (policy.departmentId && policy.departmentId === match.departmentId) {
      score += 5;
    } else if (policy.departmentId && policy.departmentId !== match.departmentId) {
      continue;
    }

    if (policy.minBillSize !== null && policy.minBillSize !== undefined) {
      if (match.billAmount === undefined) {
        continue;
      }

      if (match.billAmount >= policy.minBillSize) {
        score += 2;
      } else {
        continue;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPolicy = policy;
    }
  }

  return bestPolicy;
}

async function findBestBillPolicy(
  type: PolicyType,
  bill: {
    totalAmount: number;
    orders: Array<{ serviceId: string; service: { departmentId: string | null } }>;
  },
  date: Date
) {
  const scopes = bill.orders.length > 0
    ? bill.orders.map((order) => ({
        serviceId: order.serviceId,
        departmentId: order.service.departmentId,
      }))
    : [{ serviceId: null, departmentId: null }];

  const candidates = await Promise.all(
    scopes.map((scope) => findBestPolicy({
      type,
      serviceId: scope.serviceId,
      departmentId: scope.departmentId,
      billAmount: bill.totalAmount,
      date,
    }))
  );

  const policies = candidates
    .filter((policy): policy is CommissionPolicy => policy !== null)
    .reduce<CommissionPolicy[]>((unique, policy) => {
      if (!unique.some((item) => item.id === policy.id)) {
        unique.push(policy);
      }
      return unique;
    }, []);

  if (policies.length === 0) {
    return null;
  }

  return policies.sort((a, b) => comparePolicyPriority(b, a))[0];
}

/**
 * Hoa hồng giới thiệu khách vào hệ thống.
 * Đây là referral kiểu sale / người giới thiệu khách, khác với referral giữa các stage.
 */
export async function createReferralCommission(billId: string) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      orders: { include: { service: true } },
      customer: { include: { referrals: true } },
    },
  });

  if (!bill || bill.status !== "PAID") {
    return [];
  }

  const referrals = bill.customer.referrals.filter((referral) => referral.status === "SUCCESS");
  if (referrals.length === 0) {
    return [];
  }

  const commissions = [];
  const now = new Date();
  const payoutMonth = getPayoutMonth(now);

  for (const referral of referrals) {
    const existingCommission = await prisma.commission.findFirst({
      where: {
        type: "REFERRAL",
        billId: bill.id,
        referralId: referral.id,
        status: { not: "CANCELLED" },
      },
    });

    if (existingCommission) {
      commissions.push(existingCommission);
      continue;
    }

    const policy = await findBestBillPolicy("REFERRAL", bill, now);
    if (!policy) {
      continue;
    }

    const amount = calculateAmount(policy.value, policy.valueType, bill.totalAmount);
    const commission = await prisma.commission.create({
      data: {
        type: "REFERRAL",
        amount,
        status: "PENDING_APPROVAL",
        payoutMonth,
        billId: bill.id,
        referralId: referral.id,
        userId: referral.referrerId,
      },
    });

    commissions.push(commission);
  }

  return commissions;
}

/**
 * Hoa hồng thực hiện của bác sĩ theo từng service order trong stage.
 */
export async function createExecutorCommission(serviceOrderId: string) {
  const order = await prisma.serviceOrder.findUnique({
    where: { id: serviceOrderId },
    include: {
      service: { include: { department: true } },
      bill: true,
    },
  });

  if (!order || order.status !== "COMPLETED" || !order.executorId) {
    return null;
  }

  const now = new Date();
  const payoutMonth = getPayoutMonth(now);

  const existingCommission = await prisma.commission.findFirst({
    where: {
      type: "EXECUTOR",
      serviceOrderId: order.id,
      status: { not: "CANCELLED" },
    },
  });

  if (existingCommission) {
    return existingCommission;
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const todayCompletedCount = await prisma.serviceOrder.count({
    where: {
      executorId: order.executorId,
      status: "COMPLETED",
      updatedAt: { gte: todayStart, lt: todayEnd },
    },
  });

  const tiers = await prisma.executorTier.findMany({
    where: {
      AND: [
        { effectiveFrom: { lte: now } },
        {
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: now } },
          ],
        },
        {
          OR: [
            { serviceId: order.serviceId },
            { serviceId: null, departmentId: order.service.departmentId },
            { serviceId: null, departmentId: null },
          ],
        },
      ],
    },
    orderBy: { minDailyCount: "desc" },
  });

  let bestTier = null;
  let bestScore = -1;

  for (const tier of tiers) {
    if (tier.minDailyCount > todayCompletedCount) {
      continue;
    }

    let score = tier.minDailyCount * 100;
    if (tier.serviceId === order.serviceId) {
      score += 1000;
    } else if (tier.departmentId === order.service.departmentId) {
      score += 500;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTier = tier;
    }
  }

  if (bestTier) {
    const baseAmount = order.price * order.quantity;
    const amount = calculateAmount(bestTier.percentage, "PERCENTAGE", baseAmount);

    return prisma.commission.create({
      data: {
        type: "EXECUTOR",
        amount,
        status: "PENDING_APPROVAL",
        payoutMonth,
        billId: order.billId,
        serviceOrderId: order.id,
        userId: order.executorId,
      },
    });
  }

  const policy = await findBestPolicy({
    type: "EXECUTOR",
    serviceId: order.serviceId,
    departmentId: order.service.departmentId,
    billAmount: order.price * order.quantity,
    date: now,
  });

  if (!policy) {
    return null;
  }

  const amount = calculateAmount(policy.value, policy.valueType, order.price * order.quantity);

  return prisma.commission.create({
    data: {
      type: "EXECUTOR",
      amount,
      status: "PENDING_APPROVAL",
      payoutMonth,
      billId: order.billId,
      serviceOrderId: order.id,
      userId: order.executorId,
    },
  });
}

/**
 * Hoa hồng chỉ định trong chính stage hiện tại.
 * Rule:
 * - Tính trên bill của stage đó.
 * - Ghi nhận theo từng service order để tách được bác sĩ nào nhận bao nhiêu.
 */
export async function createIndicationCommissionsForBill(billId: string) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      orders: {
        include: {
          service: true,
          executor: true,
        },
      },
    },
  });

  if (!bill || bill.status !== "PAID") {
    return [];
  }

  const now = new Date();
  const payoutMonth = getPayoutMonth(now);
  const commissions = [];

  for (const order of bill.orders) {
    if (!order.executorId || order.status === "CANCELLED") {
      continue;
    }

    const existingCommission = await prisma.commission.findFirst({
      where: {
        type: "INDICATION",
        serviceOrderId: order.id,
        status: { not: "CANCELLED" },
      },
    });

    if (existingCommission) {
      commissions.push(existingCommission);
      continue;
    }

    const policy = await findBestPolicy({
      type: "INDICATION",
      serviceId: order.serviceId,
      departmentId: order.service.departmentId,
      billAmount: bill.totalAmount,
      date: now,
    });

    if (!policy) {
      continue;
    }

    const orderAmount = order.price * order.quantity;
    const amount = calculateAmount(policy.value, policy.valueType, orderAmount);

    const commission = await prisma.commission.create({
      data: {
        type: "INDICATION",
        amount,
        status: "PENDING_APPROVAL",
        payoutMonth,
        billId: bill.id,
        serviceOrderId: order.id,
        userId: order.executorId,
      },
    });

    commissions.push(commission);
  }

  return commissions;
}

/**
 * Hoa hồng giới thiệu giữa các stage.
 * Rule:
 * - Tính trên bill của stage kế tiếp.
 * - Trả cho người thực hiện của stage trước.
 * - Chia theo tỷ trọng doanh thu của từng order ở stage trước.
 */
export async function createStageReferralCommissionsForBill(billId: string) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      orders: {
        include: {
          service: true,
          executor: true,
        },
      },
    },
  });

  if (!bill || bill.status !== "PAID" || !bill.previousBillId) {
    return [];
  }

  const previousBill = await prisma.bill.findUnique({
    where: { id: bill.previousBillId },
    include: {
      orders: {
        include: {
          service: true,
          executor: true,
        },
      },
    },
  });

  if (!previousBill) {
    return [];
  }

  const sourceOrders = previousBill.orders.filter((order) => order.executorId && order.status !== "CANCELLED");
  if (sourceOrders.length === 0) {
    return [];
  }

  const now = new Date();
  const payoutMonth = getPayoutMonth(now);
  const policy = await findBestBillPolicy("STAGE_REFERRAL", bill, now);
  if (!policy) {
    return [];
  }

  const excludedDepartmentIds = await getExcludedStageReferralDepartmentIds([
    ...sourceOrders.map((order) => order.service.departmentId),
    ...bill.orders.map((order) => order.service.departmentId),
  ]);

  const sourceOrderById = new Map(sourceOrders.map((order) => [order.id, order]));
  const sourceOrderByHisSolId = new Map(
    sourceOrders
      .filter((order) => order.hisSolId !== null)
      .map((order) => [order.hisSolId as number, order])
  );
  const sourceOrdersByExecutorEmployeeId = sourceOrders.reduce<Map<number, typeof sourceOrders>>((map, order) => {
    const hisEmployeeId = order.executor?.hisEmployeeId;
    if (!hisEmployeeId) {
      return map;
    }

    const current = map.get(hisEmployeeId) || [];
    current.push(order);
    map.set(hisEmployeeId, current);
    return map;
  }, new Map());
  const currentExecutorEmployeeIds = new Set(
    bill.orders
      .map((order) => order.executor?.hisEmployeeId)
      .filter((value): value is number => Number.isFinite(value))
  );

  const mappedAmounts = new Map<string, number>();

  function addMappedAmount(sourceOrderId: string, amount: number) {
    if (amount <= 0) {
      return;
    }

    mappedAmounts.set(sourceOrderId, (mappedAmounts.get(sourceOrderId) || 0) + amount);
  }

  function distributeTargetAmount(sourceCandidates: typeof sourceOrders, targetAmount: number) {
    const eligibleSourceOrders = sourceCandidates.filter((order) => !excludedDepartmentIds.has(order.service.departmentId || ""));
    if (eligibleSourceOrders.length === 0 || targetAmount <= 0) {
      return false;
    }

    const totalSourceAmount = eligibleSourceOrders.reduce((sum, order) => sum + order.price * order.quantity, 0);
    if (totalSourceAmount > 0) {
      for (const order of eligibleSourceOrders) {
        const orderAmount = order.price * order.quantity;
        addMappedAmount(order.id, Math.round((targetAmount * orderAmount / totalSourceAmount) * 100) / 100);
      }
      return true;
    }

    const splitAmount = Math.round((targetAmount / eligibleSourceOrders.length) * 100) / 100;
    for (const order of eligibleSourceOrders) {
      addMappedAmount(order.id, splitAmount);
    }
    return true;
  }

  for (const targetOrder of bill.orders) {
    if (targetOrder.status === "CANCELLED") {
      continue;
    }

    if (excludedDepartmentIds.has(targetOrder.service.departmentId || "")) {
      continue;
    }

    let sourceOrder = null;
    if (targetOrder.hisSourceSolId) {
      sourceOrder = sourceOrderByHisSolId.get(targetOrder.hisSourceSolId) || null;
    }

    if (!sourceOrder && targetOrder.hisSourceSohId && targetOrder.hisSourceSohId === previousBill.hisSohId) {
      if (sourceOrders.length === 1) {
        sourceOrder = sourceOrders[0];
      }
    }

    if (!sourceOrder) {
      const introducerEmployeeId = targetOrder.hisIntroEmployeeId;
      if (
        introducerEmployeeId
        && !currentExecutorEmployeeIds.has(introducerEmployeeId)
      ) {
        // Rule mới: bill/stage sau chỉ ăn theo phần chỉ định của bác sĩ khác,
        // không còn fallback chia đều toàn bộ bill trước đó.
        const introducerSourceOrders = sourceOrdersByExecutorEmployeeId.get(introducerEmployeeId) || [];
        const targetAmount = targetOrder.price * targetOrder.quantity;
        distributeTargetAmount(introducerSourceOrders, targetAmount);
      }
      continue;
    }

    const targetAmount = targetOrder.price * targetOrder.quantity;
    if (excludedDepartmentIds.has(sourceOrder.service.departmentId || "")) {
      continue;
    }

    addMappedAmount(sourceOrder.id, targetAmount);
  }

  if (mappedAmounts.size === 0) {
    return [];
  }

  const commissions = [];

  for (const [sourceOrderId, mappedBaseAmount] of mappedAmounts.entries()) {
    const order = sourceOrderById.get(sourceOrderId);
    if (!order) {
      continue;
    }

    const existingCommission = await prisma.commission.findFirst({
      where: {
        type: "STAGE_REFERRAL",
        billId: bill.id,
        serviceOrderId: order.id,
        status: { not: "CANCELLED" },
      },
    });

    if (existingCommission) {
      commissions.push(existingCommission);
      continue;
    }

    const amount = calculateAmount(policy.value, policy.valueType, mappedBaseAmount);
    if (amount <= 0) {
      continue;
    }

    const commission = await prisma.commission.create({
      data: {
        type: "STAGE_REFERRAL",
        amount,
        status: "PENDING_APPROVAL",
        payoutMonth,
        billId: bill.id,
        serviceOrderId: order.id,
        userId: order.executorId!,
      },
    });

    commissions.push(commission);
  }

  return commissions;
}

/**
 * Tất cả commission phát sinh khi một bill/stage đã PAID:
 * - Referral khách vào hệ thống
 * - Chỉ định trong stage
 * - Giới thiệu sang stage kế tiếp
 */
export async function createBillPaidCommissions(billId: string) {
  const [customerReferrals, indicationCommissions, stageReferralCommissions] = await Promise.all([
    createReferralCommission(billId),
    createIndicationCommissionsForBill(billId),
    createStageReferralCommissionsForBill(billId),
  ]);

  return {
    customerReferrals,
    indicationCommissions,
    stageReferralCommissions,
  };
}

export async function reverseCommissionsForBill(billId: string) {
  const orderIds = await prisma.serviceOrder.findMany({
    where: { billId },
    select: { id: true },
  });

  return prisma.commission.updateMany({
    where: {
      OR: [
        {
          billId,
          status: { not: "CANCELLED" },
        },
        {
          serviceOrderId: { in: orderIds.map((order) => order.id) },
          status: { not: "CANCELLED" },
        },
      ],
    },
    data: { status: "CANCELLED" },
  });
}

export async function reverseCommissionsForOrder(serviceOrderId: string) {
  return prisma.commission.updateMany({
    where: {
      serviceOrderId,
      status: { not: "CANCELLED" },
    },
    data: { status: "CANCELLED" },
  });
}

export { calculateAmount, findBestPolicy };
