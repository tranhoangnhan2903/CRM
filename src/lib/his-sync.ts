import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getHisConfig } from "@/lib/his-config";
import { hisRequest } from "@/lib/his-client";
import {
  type HisRecord,
  buildHisCustomer,
  buildHisDoctor,
  buildHisExam,
  buildHisExamOrder,
  buildHisPackage,
  buildHisService,
  mapHisStatusToBillStatus,
  mapHisStatusToOrderStatus,
} from "@/lib/his-mappers";
import {
  createBillPaidCommissions,
  reverseCommissionsForBill,
} from "@/lib/commission";

export type SyncSource = "HIS" | "DW";

const HIS_MANAGED_PASSWORD = bcrypt.hashSync("HIS_MANAGED_USER_BLOCKED", 10);
const roleCache = new Map<string, ReturnType<typeof prisma.role.upsert>>();
const departmentCache = new Map<string, Promise<Awaited<ReturnType<typeof ensureDepartmentUncached>>>>();

function departmentCacheKey(input: {
  hisCode?: string | null;
  name?: string | null;
  cmpId?: number | null;
  source?: SyncSource;
}) {
  return `${input.source ?? "HIS"}:${input.cmpId ?? "none"}:${input.hisCode ?? "none"}:${input.name ?? "none"}`;
}

async function processInChunks<T>(
  items: T[],
  chunkSize: number,
  handler: (item: T) => Promise<void>,
) {
  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize);
    await Promise.all(chunk.map((item) => handler(item)));
  }
}

async function ensureRole(name: string, description: string) {
  const cached = roleCache.get(name);
  if (cached) {
    return cached;
  }

  const promise = prisma.role.upsert({
    where: { name },
    update: { description },
    create: { name, description },
  });
  roleCache.set(name, promise);
  return promise;
}

async function ensureDepartmentUncached(input: {
  hisCode?: string | null;
  name?: string | null;
  cmpId?: number | null;
  source?: SyncSource;
}) {
  const name = input.name || input.hisCode;
  if (!name) {
    return null;
  }

  const source = input.source || "HIS";

  const departmentOrConditions: Array<{ hisCode?: string; name?: string }> = [{ name }];
  if (input.hisCode) {
    departmentOrConditions.push({ hisCode: input.hisCode });
  }

  const existing = await prisma.department.findFirst({
    where: {
      OR: departmentOrConditions,
    },
  });

  if (existing) {
    return prisma.department.update({
      where: { id: existing.id },
      data: {
        hisCode: input.hisCode || existing.hisCode,
        hisCmpId: input.cmpId ?? existing.hisCmpId,
        source,
        description: existing.description || `Dong bo tu HIS (${name})`,
      },
    });
  }

  return prisma.department.create({
    data: {
      name,
      description: `Dong bo tu HIS (${name})`,
      hisCode: input.hisCode || null,
      hisCmpId: input.cmpId ?? null,
      source,
    },
  });
}

async function ensureDepartment(input: {
  hisCode?: string | null;
  name?: string | null;
  cmpId?: number | null;
  source?: SyncSource;
}) {
  const key = departmentCacheKey(input);
  const cached = departmentCache.get(key);
  if (cached) {
    return cached;
  }

  const promise = ensureDepartmentUncached(input);
  departmentCache.set(key, promise);
  return promise;
}

function collectCrossDoctorIntroducerIds(examRecord: HisRecord, orderRecords: HisRecord[]) {
  const exam = buildHisExam(examRecord);
  const performerIds = new Set<number>();

  if (exam.performerId) {
    performerIds.add(exam.performerId);
  }

  for (const rawOrder of orderRecords) {
    const mappedOrder = buildHisExamOrder(rawOrder);
    if (mappedOrder.performerId) {
      performerIds.add(mappedOrder.performerId);
    }
  }

  const introducerIds = new Set<number>();

  if (exam.introducerId && !performerIds.has(exam.introducerId)) {
    introducerIds.add(exam.introducerId);
  }

  for (const rawOrder of orderRecords) {
    const mappedOrder = buildHisExamOrder(rawOrder);
    if (mappedOrder.hisIntroEmployeeId && !performerIds.has(mappedOrder.hisIntroEmployeeId)) {
      introducerIds.add(mappedOrder.hisIntroEmployeeId);
    }
  }

  return Array.from(introducerIds);
}

export async function resolvePreviousStageSohId(params: {
  customerId: string;
  examRecord: HisRecord;
  orderRecords: HisRecord[];
}) {
  const exam = buildHisExam(params.examRecord);
  const explicitSourceSohIds = params.orderRecords
    .map((record) => buildHisExamOrder(record).hisSourceSohId)
    .filter((value): value is number => Number.isFinite(value) && value !== exam.hisSohId);

  if (explicitSourceSohIds.length > 0) {
    return explicitSourceSohIds[0];
  }

  // Khi HIS/DW không trả SOURCE_SOHID rõ ràng, coi stage mới chỉ bắt đầu
  // nếu có bác sĩ chỉ định khác với bác sĩ thực hiện ở bill hiện tại.
  const introducerIds = collectCrossDoctorIntroducerIds(params.examRecord, params.orderRecords);
  if (introducerIds.length === 0) {
    return null;
  }

  const transactionAt = exam.trxDate || exam.regDate || new Date();
  const candidateBills = await prisma.bill.findMany({
    where: {
      customerId: params.customerId,
      transactionAt: { lte: transactionAt },
      ...(exam.hisSohId ? { hisSohId: { not: exam.hisSohId } } : {}),
      orders: {
        some: {
          status: { not: "CANCELLED" },
          executor: {
            is: {
              hisEmployeeId: { in: introducerIds },
            },
          },
        },
      },
    },
    orderBy: [
      { transactionAt: "desc" },
      { stageNo: "desc" },
      { createdAt: "desc" },
    ],
    select: {
      hisSohId: true,
    },
  });

  return candidateBills.find((bill) => Number.isFinite(bill.hisSohId))?.hisSohId || null;
}

export async function upsertHisUser(
  record: HisRecord,
  fallbackRoleName = "DOCTOR",
  options?: { source?: SyncSource },
) {
  const doctor = buildHisDoctor(record);
  if (!doctor.hisEmployeeId) {
    return null;
  }

  const source = options?.source || "HIS";

  const role = await ensureRole(
    fallbackRoleName,
    fallbackRoleName === "SALES" ? "Nguoi gioi thieu dong bo tu HIS" : "Bac si dong bo tu HIS",
  );
  const department = await ensureDepartment({
    hisCode: doctor.departmentCode,
    name: doctor.departmentName,
    cmpId: doctor.cmpId,
    source,
  });

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { hisEmployeeId: doctor.hisEmployeeId },
        { email: doctor.email },
      ],
    },
  });

  const data = {
    email: existing?.email || doctor.email,
    passwordHash: existing?.passwordHash || HIS_MANAGED_PASSWORD,
    fullName: doctor.fullName,
    roleId: existing?.roleId || role.id,
    departmentId: department?.id || existing?.departmentId || null,
    source,
    hisEmployeeId: doctor.hisEmployeeId,
    hisEmployeeCode: doctor.hisEmployeeCode,
    hisCmpId: doctor.cmpId,
    syncManaged: true,
  };

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.user.create({ data });
}

export async function upsertHisCustomer(record: HisRecord, options?: { source?: SyncSource }) {
  const customer = buildHisCustomer(record);
  if (!customer.hisCustomerId && !customer.phone) {
    throw new Error("HIS customer payload is missing customer identifier");
  }

  const source = options?.source || "HIS";

  const customerOrConditions: Array<{ hisCustomerId?: number; phone?: string }> = [{ phone: customer.phone }];
  if (customer.hisCustomerId) {
    customerOrConditions.push({ hisCustomerId: customer.hisCustomerId });
  }

  const existing = await prisma.customer.findFirst({
    where: {
      OR: customerOrConditions,
    },
  });

  const data = {
    fullName: customer.fullName,
    phone: existing?.phone || customer.phone,
    email: customer.email,
    address: customer.address,
    yearOfBirth: customer.yearOfBirth,
    gender: customer.gender,
    source,
    hisCustomerId: customer.hisCustomerId,
    hisCustomerCode: customer.hisCustomerCode,
    hisCmpId: customer.cmpId,
    hisLatestSohId: customer.latestSohId,
  };

  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.customer.create({ data });
}

export async function upsertHisService(record: HisRecord, options?: { source?: SyncSource }) {
  const service = buildHisService(record);
  const source = options?.source || "HIS";
  const department = await ensureDepartment({
    hisCode: service.departmentCode,
    name: service.departmentName,
    cmpId: service.cmpId,
    source,
  });

  const serviceOrConditions: Array<{ hisServiceId?: number; code?: string }> = [{ code: service.code }];
  if (service.hisServiceId) {
    serviceOrConditions.push({ hisServiceId: service.hisServiceId });
  }

  const existing = await prisma.service.findFirst({
    where: {
      OR: serviceOrConditions,
    },
  });

  const data = {
    code: service.code,
    name: service.name,
    description: service.description,
    price: service.price,
    departmentId: department?.id || null,
    source,
    hisServiceId: service.hisServiceId,
    hisCmpId: service.cmpId,
    hisDivision: service.departmentCode,
    hisRoom: service.room,
    hisSrvGroup: service.srvGroup,
  };

  if (existing) {
    return prisma.service.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.service.create({ data });
}

export async function upsertHisPackage(record: HisRecord, options?: { source?: SyncSource }) {
  const healthPackage = buildHisPackage(record);
  const source = options?.source || "HIS";

  const packageOrConditions: Array<{ hisPackageId?: number; code?: string }> = [{ code: healthPackage.code }];
  if (healthPackage.hisPackageId) {
    packageOrConditions.push({ hisPackageId: healthPackage.hisPackageId });
  }

  const existing = await prisma.healthPackage.findFirst({
    where: {
      OR: packageOrConditions,
    },
  });

  const data = {
    code: healthPackage.code,
    name: healthPackage.name,
    description: healthPackage.description,
    price: healthPackage.price,
    subtype: healthPackage.subtype,
    contractId: healthPackage.contractId,
    hisPackageId: healthPackage.hisPackageId,
    hisCmpId: healthPackage.cmpId,
    source,
    syncedAt: new Date(),
  };

  if (existing) {
    return prisma.healthPackage.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.healthPackage.create({ data });
}

export async function ensureReferral(customerId: string, record: HisRecord, options?: { source?: SyncSource }) {
  const introducerId = record.INTROEMPID ?? record.INTROEMMID ?? record.SALESREPID;
  const introducerName = record.INTROEMPNM ?? record.INTROEMMNM ?? record.SALESREPNM;
  if (!introducerId) {
    return null;
  }

  const user = await upsertHisUser({
    EMPID: introducerId,
    EMPNAME: introducerName,
    CMPID: record.CMPID,
    DIVISION: record.SRV_DIVISION,
    DIVISION_STR: record.DIVISION_STR,
  }, "SALES", options);

  if (!user) {
    return null;
  }

  const existing = await prisma.referral.findFirst({
    where: {
      referrerId: user.id,
      referredCustomerId: customerId,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.referral.create({
    data: {
      referrerId: user.id,
      referredCustomerId: customerId,
      status: "SUCCESS",
    },
  });
}

export async function upsertExamBill(
  params: {
    customerId: string;
    previousSohId?: number | null;
    examRecord: HisRecord;
    orderRecords: HisRecord[];
  },
  options?: { source?: SyncSource },
) {
  const exam = buildHisExam(params.examRecord);
  if (!exam.hisSohId) {
    return null;
  }

  const source = options?.source || "HIS";

  let previousBill = null;
  if (params.previousSohId && params.previousSohId !== exam.hisSohId) {
    previousBill = await prisma.bill.findFirst({
      where: { hisSohId: params.previousSohId },
    });
  }

  const existing = await prisma.bill.findFirst({
    where: { hisSohId: exam.hisSohId },
  });
  const billStatus = mapHisStatusToBillStatus(exam.status);
  const stageNo = previousBill ? previousBill.stageNo + 1 : 1;
  const transactionAt = exam.trxDate || exam.regDate || existing?.transactionAt || new Date();
  let commissionInputsChanged = !existing
    || existing.previousBillId !== (previousBill?.id || null)
    || existing.stageNo !== stageNo
    || existing.status !== billStatus
    || existing.totalAmount !== exam.totalAmount;

  const bill = existing
    ? await prisma.bill.update({
        where: { id: existing.id },
        data: {
          customerId: params.customerId,
          totalAmount: exam.totalAmount,
          status: billStatus,
          previousBillId: previousBill?.id || null,
          stageNo,
          transactionAt,
          source,
          hisSohCode: exam.hisSohCode,
          hisCmpId: exam.cmpId,
          hisSrvDivision: exam.divisionCode,
          hisRoom: exam.room,
          hisSrvGroup: exam.serviceGroup,
        },
      })
    : await prisma.bill.create({
        data: {
          customerId: params.customerId,
          totalAmount: exam.totalAmount,
          status: billStatus,
          previousBillId: previousBill?.id || null,
          stageNo,
          transactionAt,
          source,
          hisSohId: exam.hisSohId,
          hisSohCode: exam.hisSohCode,
          hisCmpId: exam.cmpId,
          hisSrvDivision: exam.divisionCode,
          hisRoom: exam.room,
          hisSrvGroup: exam.serviceGroup,
        },
      });

  let calculatedTotal = 0;

  for (const rawOrder of params.orderRecords) {
    const mappedOrder = buildHisExamOrder(rawOrder);
    const service = await upsertHisService(rawOrder, { source });
    const executor = mappedOrder.performerId
      ? await upsertHisUser({
          EMPID: mappedOrder.performerId,
          EMPNAME: mappedOrder.performerName,
          CMPID: exam.cmpId,
          DIVISION: exam.divisionCode,
          DIVISION_STR: exam.divisionName,
        }, "DOCTOR", { source })
      : null;

    const orderStatus = mapHisStatusToOrderStatus(mappedOrder.status, billStatus);
    calculatedTotal += mappedOrder.price * mappedOrder.quantity;

    const existingOrder = mappedOrder.hisSolId
      ? await prisma.serviceOrder.findFirst({ where: { hisSolId: mappedOrder.hisSolId } })
      : await prisma.serviceOrder.findFirst({
          where: {
            billId: bill.id,
            serviceId: service.id,
            executorId: executor?.id || null,
          },
        });

    const orderData = {
      billId: bill.id,
      serviceId: service.id,
      executorId: executor?.id || null,
      quantity: mappedOrder.quantity,
      price: mappedOrder.price,
      status: orderStatus,
      source,
      hisSolId: mappedOrder.hisSolId,
      hisAssignType: mappedOrder.hisAssignType,
      hisSourceSohId: mappedOrder.hisSourceSohId,
      hisSourceSolId: mappedOrder.hisSourceSolId,
      hisIntroEmployeeId: mappedOrder.hisIntroEmployeeId,
    };

    if (
      !existingOrder
      || existingOrder.billId !== orderData.billId
      || existingOrder.serviceId !== orderData.serviceId
      || (existingOrder.executorId || null) !== orderData.executorId
      || existingOrder.quantity !== orderData.quantity
      || existingOrder.price !== orderData.price
      || existingOrder.status !== orderData.status
      || existingOrder.source !== orderData.source
      || (existingOrder.hisSolId || null) !== orderData.hisSolId
      || (existingOrder.hisAssignType || null) !== orderData.hisAssignType
      || (existingOrder.hisSourceSohId || null) !== orderData.hisSourceSohId
      || (existingOrder.hisSourceSolId || null) !== orderData.hisSourceSolId
      || (existingOrder.hisIntroEmployeeId || null) !== orderData.hisIntroEmployeeId
    ) {
      commissionInputsChanged = true;
    }

    if (existingOrder) {
      await prisma.serviceOrder.update({
        where: { id: existingOrder.id },
        data: orderData,
      });
    } else {
      await prisma.serviceOrder.create({ data: orderData });
    }
  }

  const finalBill = await prisma.bill.update({
    where: { id: bill.id },
    data: {
      totalAmount: calculatedTotal || exam.totalAmount,
    },
  });

  if (finalBill.status === "PAID" && existing?.status !== "PAID") {
    await createBillPaidCommissions(finalBill.id);
  }
  if (finalBill.status === "PAID" && existing?.status === "PAID" && commissionInputsChanged) {
    await reverseCommissionsForBill(finalBill.id);
    await createBillPaidCommissions(finalBill.id);
  }
  if ((finalBill.status === "CANCELLED" || finalBill.status === "REFUNDED") && existing?.status === "PAID") {
    await reverseCommissionsForBill(finalBill.id);
  }

  return finalBill;
}

export async function syncHisDoctors() {
  const config = getHisConfig();
  const doctors = await hisRequest<HisRecord[]>("/api/v1/employee-division-room/doctor", {
    query: { CMPID: config.cmpId },
  });

  let count = 0;
  await processInChunks(doctors, 5, async (record) => {
    await upsertHisUser(record);
    count += 1;
  });

  return { count };
}

export async function syncHisServices() {
  const config = getHisConfig();
  const services = await hisRequest<HisRecord[]>("/api/v1/doctor-medical/all-service", {
    query: { CMPID: config.cmpId },
  });

  let count = 0;
  await processInChunks(services, 5, async (record) => {
    await upsertHisService(record);
    count += 1;
  });

  return { count };
}

export async function syncHisPackages() {
  const config = getHisConfig();
  const packages = await hisRequest<HisRecord[]>("/api/v1/package-service-v2", {
    query: {
      CMPID: config.cmpId,
      EMPID: config.employeeId || 0,
    },
  });

  let count = 0;
  await processInChunks(packages, 5, async (record) => {
    await upsertHisPackage(record);
    count += 1;
  });

  return { count };
}

export async function syncHisCustomers(search?: string | null) {
  const config = getHisConfig();
  let from = 0;
  let count = 0;
  const size = search ? 50 : 100;

  while (true) {
    const batch = await hisRequest<HisRecord[]>("/api/v1/customer/search-customer-patients", {
      query: {
        cmpid: config.cmpId,
        search: search || undefined,
        from,
        size,
      },
    });

    await processInChunks(batch, 5, async (record) => {
      await upsertHisCustomer(record);
      count += 1;
    });

    if (search || batch.length < size) {
      break;
    }
    from += size;
  }

  return { count };
}

export async function syncHisExamFlows(options?: {
  hisCustomerId?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
}) {
  const config = getHisConfig();
  const rows = await hisRequest<HisRecord[]>("/api/v1/doctor-medical/cisexamlist", {
    query: {
      CMPID: config.cmpId,
      CUSTID: options?.hisCustomerId || undefined,
      TRX_DATE_S: options?.fromDate || "2025-01-01",
      TRX_DATE_E: options?.toDate || "2030-12-31",
    },
  });

  const grouped = new Map<number, HisRecord[]>();
  for (const row of rows) {
    const exam = buildHisExam(row);
    if (!exam.hisSohId) {
      continue;
    }
    const list = grouped.get(exam.hisSohId) || [];
    list.push(row);
    grouped.set(exam.hisSohId, list);
  }

  const groups = Array.from(grouped.values()).sort((a, b) => {
    const examA = buildHisExam(a[0]);
    const examB = buildHisExam(b[0]);
    const dateA = examA.trxDate?.getTime() || 0;
    const dateB = examB.trxDate?.getTime() || 0;
    if (dateA !== dateB) {
      return dateA - dateB;
    }
    return (examA.hisSohId || 0) - (examB.hisSohId || 0);
  });

  let syncedBills = 0;

  for (const group of groups) {
    const exam = buildHisExam(group[0]);
    if (!exam.customer.hisCustomerId) {
      continue;
    }

    const customer = await upsertHisCustomer(group[0]);
    await ensureReferral(customer.id, group[0]);

    const previousSohId = await resolvePreviousStageSohId({
      customerId: customer.id,
      examRecord: group[0],
      orderRecords: group,
    });

    const bill = await upsertExamBill({
      customerId: customer.id,
      previousSohId,
      examRecord: group[0],
      orderRecords: group,
    });

    if (bill?.hisSohId) {
      syncedBills += 1;
    }
  }

  return {
    count: syncedBills,
    rawRows: rows.length,
  };
}

export async function syncHisMasterData(target: "customers" | "doctors" | "services" | "packages" | "all", search?: string | null) {
  const summary = {
    customers: 0,
    doctors: 0,
    services: 0,
    packages: 0,
  };

  if (target === "customers" || target === "all") {
    summary.customers = (await syncHisCustomers(search)).count;
  }
  if (target === "doctors" || target === "all") {
    summary.doctors = (await syncHisDoctors()).count;
  }
  if (target === "services" || target === "all") {
    summary.services = (await syncHisServices()).count;
  }
  if (target === "packages" || target === "all") {
    summary.packages = (await syncHisPackages()).count;
  }

  return summary;
}

export async function processHisWebhook(payload: Record<string, unknown>) {
  const event = await prisma.integrationEvent.create({
    data: {
      externalEventId: typeof payload.externalEventId === "string" ? payload.externalEventId : null,
      source: "HIS",
      eventType: typeof payload.eventType === "string" ? payload.eventType : "UNKNOWN",
      status: "PROCESSING",
      payload: payload as object,
    },
  }).catch(async () => {
    if (typeof payload.externalEventId !== "string") {
      throw new Error("Duplicate webhook event");
    }
    const existing = await prisma.integrationEvent.findUnique({
      where: { externalEventId: payload.externalEventId },
    });
    if (!existing) {
      throw new Error("Webhook event conflict");
    }
    if (existing.status === "SUCCESS") {
      return existing;
    }
    return prisma.integrationEvent.update({
      where: { id: existing.id },
      data: {
        status: "PROCESSING",
        payload: payload as object,
      },
    });
  });

  try {
    const customerPayload = (payload.customer as HisRecord | undefined) || (payload.exam as HisRecord | undefined);
    if (!customerPayload) {
      throw new Error("Webhook payload is missing customer or exam data");
    }

    const customer = await upsertHisCustomer(customerPayload);

    if (payload.introducer && typeof payload.introducer === "object") {
      await ensureReferral(customer.id, {
        ...(payload.exam as HisRecord | undefined),
        ...(payload.introducer as HisRecord),
      });
    } else {
      await ensureReferral(customer.id, payload.exam as HisRecord || customerPayload);
    }

    let bill = null;
    if (payload.exam && typeof payload.exam === "object") {
      const examRecord = payload.exam as HisRecord;
      const services = Array.isArray(payload.services)
        ? payload.services.filter((item): item is HisRecord => Boolean(item) && typeof item === "object")
        : [examRecord];

      bill = await upsertExamBill({
        customerId: customer.id,
        previousSohId: typeof payload.previousSohId === "number"
          ? payload.previousSohId
          : await resolvePreviousStageSohId({
            customerId: customer.id,
            examRecord,
            orderRecords: services,
          }),
        examRecord,
        orderRecords: services,
      });
    }

    await prisma.integrationEvent.update({
      where: { id: event.id },
      data: {
        status: "SUCCESS",
        message: bill ? `Synced bill ${bill.id}` : `Synced customer ${customer.id}`,
        processedAt: new Date(),
      },
    });

    return {
      customerId: customer.id,
      billId: bill?.id || null,
    };
  } catch (error) {
    await prisma.integrationEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        message: error instanceof Error ? error.message : "Webhook processing failed",
        processedAt: new Date(),
      },
    });
    throw error;
  }
}
