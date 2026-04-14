import prisma from "@/lib/prisma";
import { isHisConfigured } from "@/lib/his-config";
import { type HisRecord, buildHisExam } from "@/lib/his-mappers";
import {
  buildDwSelectList,
  dwQuery,
  getDwTableColumns,
  pickDwColumn,
  quoteDwIdent,
} from "@/lib/dw-client";
import { getDwConfig } from "@/lib/dw-config";
import {
  ensureReferral,
  resolvePreviousStageSohId,
  type SyncSource,
  syncHisPackages,
  upsertExamBill,
  upsertHisCustomer,
  upsertHisService,
  upsertHisUser,
} from "@/lib/his-sync";

type DwSyncTarget = "customers" | "doctors" | "services" | "packages" | "all" | "exams";

const DW_SOURCE: SyncSource = "DW";
const DW_SERVICE_TABLE = "VW_BS_ITEM_LIST";
const DW_EXAM_TABLE = "VW_CIS_EXAM_SUMMARY_SYNC_BI";
const DW_ORDER_TABLE = "DAS_SO_LINE";
const DW_SUMMARY_TABLE = "VW_SO_SUMMARY";

function getDwTableRef(tableName: string) {
  const { schema } = getDwConfig();
  return `${quoteDwIdent(schema)}.${quoteDwIdent(tableName)}`;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function toEndOfDay(value: string) {
  return `${value}T23:59:59.999`;
}

function pickRequiredDwColumn(tableName: string, availableColumns: string[], candidates: string[], label: string) {
  const column = pickDwColumn(availableColumns, candidates);
  if (!column) {
    throw new Error(`DW table ${tableName} is missing required column for ${label}`);
  }

  return column;
}

function mergeRecords(base: HisRecord, incoming: HisRecord) {
  const merged: HisRecord = { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined && value !== null && value !== "") {
      merged[key] = value;
    }
  }

  return merged;
}

function uniqueRecords(records: HisRecord[], keys: string[]) {
  const deduped = new Map<string, HisRecord>();

  for (const record of records) {
    const parts = keys
      .map((key) => {
        const value = record[key];
        return value === undefined || value === null || value === "" ? null : String(value);
      })
      .filter((value): value is string => Boolean(value));

    if (parts.length === 0) {
      continue;
    }

    deduped.set(parts.join("::"), record);
  }

  return Array.from(deduped.values());
}

function processInChunks<T>(
  items: T[],
  chunkSize: number,
  handler: (item: T) => Promise<void>,
) {
  return (async () => {
    for (let index = 0; index < items.length; index += chunkSize) {
      const chunk = items.slice(index, index + chunkSize);
      await Promise.all(chunk.map((item) => handler(item)));
    }
  })();
}

async function runDwIntegrationEvent<T>(
  eventType: string,
  payload: Record<string, unknown>,
  handler: () => Promise<T>,
  buildMessage: (result: T) => string,
) {
  const event = await prisma.integrationEvent.create({
    data: {
      source: "DW",
      eventType,
      status: "PROCESSING",
      payload: payload as object,
    },
  });

  try {
    const result = await handler();
    await prisma.integrationEvent.update({
      where: { id: event.id },
      data: {
        status: "SUCCESS",
        message: buildMessage(result),
        processedAt: new Date(),
      },
    });

    return result;
  } catch (error) {
    await prisma.integrationEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        message: error instanceof Error ? error.message : "DW sync failed",
        processedAt: new Date(),
      },
    });
    throw error;
  }
}

async function loadDwServiceRows() {
  const availableColumns = await getDwTableColumns(DW_SERVICE_TABLE);
  if (availableColumns.length === 0) {
    throw new Error(`DW table ${DW_SERVICE_TABLE} is unavailable`);
  }

  const selectList = buildDwSelectList(availableColumns, [
    { alias: "CMPID", candidates: ["CMPID"] },
    { alias: "ITID", candidates: ["ITID"] },
    { alias: "ITCODE", candidates: ["ITCODE"] },
    { alias: "ITNM", candidates: ["ITNM"] },
    { alias: "ITPRICE", candidates: ["ITPRICE", "PRICE", "AMT"] },
    { alias: "SRV_DIVISION", candidates: ["SRV_DIVISION", "DIVISION"] },
    { alias: "DIVISION_STR", candidates: ["DIVISION_STR"] },
    { alias: "SRV_ROOM", candidates: ["SRV_ROOM", "ROOM"] },
    { alias: "SRV_GROUP", candidates: ["SRV_GROUP", "EX_SRVGROUP"] },
    { alias: "DESCT", candidates: ["DESCT", "DESCRIPTION"] },
  ]);

  if (!selectList.some((column) => column.includes("\"ITID\"")) && !selectList.some((column) => column.includes("\"ITCODE\""))) {
    throw new Error(`DW table ${DW_SERVICE_TABLE} is missing service identity columns`);
  }

  const query = `
    SELECT ${selectList.join(", ")}
    FROM ${getDwTableRef(DW_SERVICE_TABLE)}
  `;

  return dwQuery<HisRecord>(query);
}

async function loadDwCustomerRows(search?: string | null) {
  const availableColumns = await getDwTableColumns(DW_EXAM_TABLE);
  if (availableColumns.length === 0) {
    throw new Error(`DW table ${DW_EXAM_TABLE} is unavailable`);
  }

  const customerIdColumn = pickRequiredDwColumn(DW_EXAM_TABLE, availableColumns, ["CUSTID", "CUST_ID"], "customer id");
  const transactionDateColumn = pickDwColumn(availableColumns, ["TRX_DATE", "EXAM_DATE", "REG_DATE", "EX_DATE"]);
  const selectList = buildDwSelectList(availableColumns, [
    { alias: "CMPID", candidates: ["CMPID", "CMP_ID"] },
    { alias: "CUSTID", candidates: ["CUSTID", "CUST_ID"] },
    { alias: "CUSTCD", candidates: ["CUSTCD", "CUST_CD"] },
    { alias: "CUSTNM", candidates: ["CUSTNM", "CUST_NM", "FULLNAME"] },
    { alias: "FONE", candidates: ["FONE", "PHONE", "CUST_FONE"] },
    { alias: "DOB", candidates: ["DOB", "CUST_DOB", "DATEOFBIRTH"] },
    { alias: "GENDER", candidates: ["GENDER", "CUST_GENDER"] },
    { alias: "ADDRFULL", candidates: ["ADDRFULL", "CUST_ADDRFULL", "ADDR", "CUST_ADDR"] },
    { alias: "EMAIL", candidates: ["EMAIL", "CUST_EMAIL"] },
    { alias: "SOHID", candidates: ["SOHID", "EX_SOHID"] },
    { alias: "TRX_DATE", candidates: ["TRX_DATE", "EXAM_DATE", "REG_DATE", "EX_DATE"] },
  ]);

  const whereClauses = [`${quoteDwIdent(customerIdColumn)} IS NOT NULL`];
  const params: unknown[] = [];

  if (search) {
    const searchColumns = [
      pickDwColumn(availableColumns, ["CUSTNM", "CUST_NM", "FULLNAME"]),
      pickDwColumn(availableColumns, ["CUSTCD", "CUST_CD"]),
      pickDwColumn(availableColumns, ["FONE", "PHONE", "CUST_FONE"]),
    ].filter((column): column is string => Boolean(column));

    if (searchColumns.length > 0) {
      const patternIndex = params.push(`%${escapeLike(search.trim())}%`);
      whereClauses.push(
        `(${searchColumns
          .map((column) => `CAST(${quoteDwIdent(column)} AS TEXT) ILIKE $${patternIndex} ESCAPE '\\'`)
          .join(" OR ")})`,
      );
    }
  }

  const baseQuery = `
    FROM ${getDwTableRef(DW_EXAM_TABLE)}
    WHERE ${whereClauses.join(" AND ")}
  `;

  if (transactionDateColumn) {
    return dwQuery<HisRecord>(
      `
        SELECT DISTINCT ON (${quoteDwIdent(customerIdColumn)}) ${selectList.join(", ")}
        ${baseQuery}
        ORDER BY ${quoteDwIdent(customerIdColumn)}, ${quoteDwIdent(transactionDateColumn)} DESC NULLS LAST
      `,
      params,
    );
  }

  return dwQuery<HisRecord>(
    `
      SELECT ${selectList.join(", ")}
      ${baseQuery}
    `,
    params,
  );
}

async function loadDwEmployeeRows() {
  const sources: Array<{ table: string; role: "DOCTOR" | "SALES" }> = [
    { table: "VW_HR_EMPLOYEE_DOCTOR_DIVISION_ROOM", role: "DOCTOR" },
    { table: "VW_HR_EMPLOYEE", role: "SALES" },
  ];

  const records: Array<{ record: HisRecord; role: "DOCTOR" | "SALES" }> = [];

  for (const source of sources) {
    const availableColumns = await getDwTableColumns(source.table);
    if (availableColumns.length === 0) {
      continue;
    }

    const employeeIdColumn = pickDwColumn(availableColumns, ["EMPID"]);
    const employeeNameColumn = pickDwColumn(availableColumns, ["EMPNAME", "EMPNM"]);
    if (!employeeIdColumn || !employeeNameColumn) {
      continue;
    }

    const selectList = buildDwSelectList(availableColumns, [
      { alias: "EMPID", candidates: ["EMPID"] },
      { alias: "EMPCD", candidates: ["EMPCD"] },
      { alias: "EMPNAME", candidates: ["EMPNAME", "EMPNM"] },
      { alias: "EMAIL", candidates: ["EMAIL"] },
      { alias: "CMPID", candidates: ["CMPID", "CMPID_OU"] },
      { alias: "DIVISION", candidates: ["DIVISION"] },
      { alias: "DIVISION_STR", candidates: ["DIVISION_STR", "DIVISION_ROOM"] },
    ]);

    const rows = await dwQuery<HisRecord>(`
      SELECT DISTINCT ${selectList.join(", ")}
      FROM ${getDwTableRef(source.table)}
      WHERE ${quoteDwIdent(employeeIdColumn)} IS NOT NULL
    `);

    records.push(...rows.map((row) => ({ record: row, role: source.role })));
  }

  const deduped = new Map<number, { record: HisRecord; role: "DOCTOR" | "SALES" }>();
  for (const item of records) {
    const employeeId = Number(item.record.EMPID);
    if (!Number.isFinite(employeeId)) {
      continue;
    }

    const existing = deduped.get(employeeId);
    if (!existing || (existing.role === "SALES" && item.role === "DOCTOR")) {
      deduped.set(employeeId, item);
    }
  }

  return Array.from(deduped.values());
}

async function loadDwExamHeaderRows(options?: {
  hisCustomerId?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
}) {
  const availableColumns = await getDwTableColumns(DW_EXAM_TABLE);
  if (availableColumns.length === 0) {
    throw new Error(`DW table ${DW_EXAM_TABLE} is unavailable`);
  }

  const sohIdColumn = pickRequiredDwColumn(DW_EXAM_TABLE, availableColumns, ["SOHID", "EX_SOHID"], "SOHID");
  const customerIdColumn = pickDwColumn(availableColumns, ["CUSTID", "CUST_ID"]);
  const transactionDateColumn = pickDwColumn(availableColumns, ["TRX_DATE", "EXAM_DATE", "REG_DATE", "EX_DATE"]);
  const selectList = buildDwSelectList(availableColumns, [
    { alias: "CMPID", candidates: ["CMPID", "CMP_ID"] },
    { alias: "SOHID", candidates: ["SOHID", "EX_SOHID"] },
    { alias: "SOHCD", candidates: ["SOHCD"] },
    { alias: "CUSTID", candidates: ["CUSTID", "CUST_ID"] },
    { alias: "CUSTCD", candidates: ["CUSTCD", "CUST_CD"] },
    { alias: "CUSTNM", candidates: ["CUSTNM", "CUST_NM", "FULLNAME"] },
    { alias: "FONE", candidates: ["FONE", "PHONE", "CUST_FONE"] },
    { alias: "DOB", candidates: ["DOB", "CUST_DOB", "DATEOFBIRTH"] },
    { alias: "GENDER", candidates: ["GENDER", "CUST_GENDER"] },
    { alias: "ADDRFULL", candidates: ["ADDRFULL", "CUST_ADDRFULL", "ADDR", "CUST_ADDR"] },
    { alias: "EMAIL", candidates: ["EMAIL", "CUST_EMAIL"] },
    { alias: "TOTAL_AMT", candidates: ["TOTAL_AMT", "AMT"] },
    { alias: "STATUS", candidates: ["STATUS", "PROCESS_STATUS"] },
    { alias: "SRV_DIVISION", candidates: ["SRV_DIVISION", "DIVISION", "EX_DIVISION"] },
    { alias: "DIVISION_STR", candidates: ["DIVISION_STR", "EX_DIVISION_DESCT"] },
    { alias: "SRV_ROOM", candidates: ["SRV_ROOM", "ROOM"] },
    { alias: "SRV_GROUP", candidates: ["SRV_GROUP", "EX_SRVGROUP"] },
    { alias: "TRX_DATE", candidates: ["TRX_DATE", "EXAM_DATE", "REG_DATE", "EX_DATE"] },
    { alias: "REG_DATE", candidates: ["REG_DATE", "EX_REGDATE"] },
    { alias: "PROEMPID", candidates: ["PROEMPID", "PROEMMID"] },
    { alias: "PROEMPNM", candidates: ["PROEMPNM", "PROEMMNM", "EX_PROEMP"] },
    { alias: "INTROEMPID", candidates: ["INTROEMPID", "INTROEMMID"] },
    { alias: "INTROEMPNM", candidates: ["INTROEMPNM", "INTROEMMNM"] },
    { alias: "SALESREPID", candidates: ["SALESREPID"] },
    { alias: "SALESREPNM", candidates: ["SALESREPNM"] },
  ]);

  const whereClauses = [`${quoteDwIdent(sohIdColumn)} IS NOT NULL`];
  const params: unknown[] = [];

  if (options?.hisCustomerId && customerIdColumn) {
    const paramIndex = params.push(options.hisCustomerId);
    whereClauses.push(`${quoteDwIdent(customerIdColumn)} = $${paramIndex}`);
  }

  if (options?.fromDate && transactionDateColumn) {
    const paramIndex = params.push(options.fromDate);
    whereClauses.push(`${quoteDwIdent(transactionDateColumn)} >= $${paramIndex}`);
  }

  if (options?.toDate && transactionDateColumn) {
    const paramIndex = params.push(toEndOfDay(options.toDate));
    whereClauses.push(`${quoteDwIdent(transactionDateColumn)} <= $${paramIndex}`);
  }

  const baseQuery = `
    FROM ${getDwTableRef(DW_EXAM_TABLE)}
    WHERE ${whereClauses.join(" AND ")}
  `;

  if (transactionDateColumn) {
    return dwQuery<HisRecord>(
      `
        SELECT DISTINCT ON (${quoteDwIdent(sohIdColumn)}) ${selectList.join(", ")}
        ${baseQuery}
        ORDER BY ${quoteDwIdent(sohIdColumn)}, ${quoteDwIdent(transactionDateColumn)} DESC NULLS LAST
      `,
      params,
    );
  }

  return dwQuery<HisRecord>(
    `
      SELECT ${selectList.join(", ")}
      ${baseQuery}
    `,
    params,
  );
}

async function hydrateExamHeadersWithSummary(headers: HisRecord[]) {
  if (headers.length === 0) {
    return headers;
  }

  const availableColumns = await getDwTableColumns(DW_SUMMARY_TABLE);
  if (availableColumns.length === 0) {
    return headers;
  }

  const sohIdColumn = pickDwColumn(availableColumns, ["SOHID", "EX_SOHID"]);
  if (!sohIdColumn) {
    return headers;
  }

  const selectList = buildDwSelectList(availableColumns, [
    { alias: "SOHID", candidates: ["SOHID", "EX_SOHID"] },
    { alias: "SOHCD", candidates: ["SOHCD"] },
    { alias: "CMPID", candidates: ["CMPID"] },
    { alias: "TOTAL_AMT", candidates: ["TOTAL_AMT", "AMT"] },
    { alias: "STATUS", candidates: ["STATUS", "PROCESS_STATUS"] },
    { alias: "SRV_DIVISION", candidates: ["SRV_DIVISION", "DIVISION"] },
    { alias: "DIVISION_STR", candidates: ["DIVISION_STR"] },
    { alias: "SRV_ROOM", candidates: ["SRV_ROOM", "ROOM"] },
    { alias: "SRV_GROUP", candidates: ["SRV_GROUP"] },
    { alias: "TRX_DATE", candidates: ["TRX_DATE", "REG_DATE"] },
  ]);

  const sohIds = headers
    .map((row) => Number(row.SOHID))
    .filter((value) => Number.isFinite(value));

  if (sohIds.length === 0) {
    return headers;
  }

  const summaryRows = await dwQuery<HisRecord>(
    `
      SELECT ${selectList.join(", ")}
      FROM ${getDwTableRef(DW_SUMMARY_TABLE)}
      WHERE ${quoteDwIdent(sohIdColumn)} = ANY($1::int[])
    `,
    [sohIds],
  );

  const summaryBySohId = new Map<number, HisRecord>();
  for (const row of summaryRows) {
    const sohId = Number(row.SOHID);
    if (Number.isFinite(sohId)) {
      summaryBySohId.set(sohId, row);
    }
  }

  return headers.map((row) => {
    const sohId = Number(row.SOHID);
    if (!Number.isFinite(sohId) || !summaryBySohId.has(sohId)) {
      return row;
    }

    return mergeRecords(row, summaryBySohId.get(sohId)!);
  });
}

async function loadDwOrderRows(sohIds: number[]) {
  if (sohIds.length === 0) {
    return [] as HisRecord[];
  }

  const availableColumns = await getDwTableColumns(DW_ORDER_TABLE);
  if (availableColumns.length === 0) {
    return [] as HisRecord[];
  }

  const orderSohIdColumn = pickDwColumn(availableColumns, ["SOHID", "EX_SOHID"]);
  if (!orderSohIdColumn) {
    return [] as HisRecord[];
  }

  const selectList = buildDwSelectList(availableColumns, [
    { alias: "CMPID", candidates: ["CMPID"] },
    { alias: "SOHID", candidates: ["SOHID", "EX_SOHID"] },
    { alias: "SOLID", candidates: ["SOLID", "EX_SOLID"] },
    { alias: "SOURCE_SOHID", candidates: ["SOURCE_SOHID"] },
    { alias: "SOURCE_SOLID", candidates: ["SOURCE_SOLID"] },
    { alias: "ASSIGNTYPE", candidates: ["ASSIGNTYPE"] },
    { alias: "INTROEMPID", candidates: ["INTROEMPID", "INTROEMMID"] },
    { alias: "INTROEMPNM", candidates: ["INTROEMPNM", "INTROEMMNM"] },
    { alias: "PROEMPID", candidates: ["PROEMPID", "PROEMMID"] },
    { alias: "PROEMPNM", candidates: ["PROEMPNM", "PROEMMNM"] },
    { alias: "ITID", candidates: ["ITID", "EX_ITID"] },
    { alias: "ITCODE", candidates: ["ITCODE", "EX_ITCODE"] },
    { alias: "ITNM", candidates: ["ITNM", "EX_ITNM"] },
    { alias: "PRICE", candidates: ["PRICE", "ITPRICE", "AMT"] },
    { alias: "QTY", candidates: ["QTY"] },
    { alias: "STATUS", candidates: ["STATUS", "PROCESS_STATUS"] },
    { alias: "SRV_DIVISION", candidates: ["SRV_DIVISION", "DIVISION"] },
    { alias: "DIVISION_STR", candidates: ["DIVISION_STR"] },
    { alias: "SRV_ROOM", candidates: ["SRV_ROOM", "ROOM"] },
    { alias: "SRV_GROUP", candidates: ["SRV_GROUP", "EX_SRVGROUP"] },
  ]);

  if (!selectList.some((column) => column.includes("\"SOLID\""))) {
    return [] as HisRecord[];
  }

  return dwQuery<HisRecord>(
    `
      SELECT ${selectList.join(", ")}
      FROM ${getDwTableRef(DW_ORDER_TABLE)}
      WHERE ${quoteDwIdent(orderSohIdColumn)} = ANY($1::int[])
    `,
    [sohIds],
  );
}

function summarizeDwMasterResult(result: {
  customers: number;
  doctors: number;
  services: number;
  packages: number;
  packagesSource?: string;
  packagesSkipped?: boolean;
}) {
  const parts = [
    `customers=${result.customers}`,
    `doctors=${result.doctors}`,
    `services=${result.services}`,
    `packages=${result.packages}`,
  ];

  if (result.packagesSource) {
    parts.push(`packagesSource=${result.packagesSource}`);
  }

  if (result.packagesSkipped) {
    parts.push("packagesSkipped=true");
  }

  return `DW sync completed: ${parts.join(", ")}`;
}

export async function syncDwServices() {
  const rows = uniqueRecords(await loadDwServiceRows(), ["ITID", "ITCODE"]);
  let count = 0;

  await processInChunks(rows, 1, async (record) => {
    await upsertHisService(record, { source: DW_SOURCE });
    count += 1;
  });

  return { count };
}

export async function syncDwCustomers(search?: string | null) {
  const rows = uniqueRecords(await loadDwCustomerRows(search), ["CUSTID", "CUSTCD", "FONE"]);
  let count = 0;

  await processInChunks(rows, 1, async (record) => {
    await upsertHisCustomer(record, { source: DW_SOURCE });
    count += 1;
  });

  return { count };
}

export async function syncDwDoctors() {
  const rows = await loadDwEmployeeRows();
  let count = 0;

  await processInChunks(rows, 1, async ({ record, role }) => {
    await upsertHisUser(record, role, { source: DW_SOURCE });
    count += 1;
  });

  return { count };
}

export async function syncDwPackages() {
  if (!isHisConfigured()) {
    return {
      count: 0,
      skipped: true,
      source: "HIS",
      reason: "DW guide does not define package master table; HIS package sync is not configured",
    };
  }

  const result = await syncHisPackages();
  return {
    count: result.count,
    skipped: false,
    source: "HIS",
  };
}

export async function syncDwExamFlows(options?: {
  hisCustomerId?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
}) {
  const rawHeaders = await loadDwExamHeaderRows(options);
  const headers = await hydrateExamHeadersWithSummary(rawHeaders);
  const headerBySohId = new Map<number, HisRecord>();

  for (const row of headers) {
    const sohId = Number(row.SOHID);
    if (Number.isFinite(sohId)) {
      headerBySohId.set(sohId, row);
    }
  }

  const orderedHeaders = Array.from(headerBySohId.values()).sort((left, right) => {
    const examLeft = buildHisExam(left);
    const examRight = buildHisExam(right);
    const leftDate = examLeft.trxDate?.getTime() || 0;
    const rightDate = examRight.trxDate?.getTime() || 0;

    if (leftDate !== rightDate) {
      return leftDate - rightDate;
    }

    return (examLeft.hisSohId || 0) - (examRight.hisSohId || 0);
  });

  const orderRows = await loadDwOrderRows(
    orderedHeaders
      .map((row) => Number(row.SOHID))
      .filter((value) => Number.isFinite(value)),
  );

  const orderRowsBySohId = new Map<number, HisRecord[]>();
  for (const row of orderRows) {
    const sohId = Number(row.SOHID);
    if (!Number.isFinite(sohId)) {
      continue;
    }

    const currentRows = orderRowsBySohId.get(sohId) || [];
    currentRows.push(row);
    orderRowsBySohId.set(sohId, currentRows);
  }

  let syncedBills = 0;

  for (const header of orderedHeaders) {
    const exam = buildHisExam(header);
    if (!exam.hisSohId || !exam.customer.hisCustomerId) {
      continue;
    }

    const customer = await upsertHisCustomer(header, { source: DW_SOURCE });
    await ensureReferral(customer.id, header, { source: DW_SOURCE });

    const orderRecords = orderRowsBySohId.get(exam.hisSohId) || [header];
    const previousSohId = await resolvePreviousStageSohId({
      customerId: customer.id,
      examRecord: header,
      orderRecords,
    });

    const bill = await upsertExamBill({
      customerId: customer.id,
      previousSohId,
      examRecord: header,
      orderRecords,
    }, { source: DW_SOURCE });

    if (bill?.hisSohId) {
      syncedBills += 1;
    }
  }

  return {
    count: syncedBills,
    rawRows: orderRows.length,
    headers: orderedHeaders.length,
  };
}

export async function syncDwMasterData(
  target: "customers" | "doctors" | "services" | "packages" | "all",
  search?: string | null,
) {
  const summary = {
    customers: 0,
    doctors: 0,
    services: 0,
    packages: 0,
    packagesSource: undefined as string | undefined,
    packagesSkipped: false,
  };

  if (target === "customers" || target === "all") {
    summary.customers = (await syncDwCustomers(search)).count;
  }

  if (target === "doctors" || target === "all") {
    summary.doctors = (await syncDwDoctors()).count;
  }

  if (target === "services" || target === "all") {
    summary.services = (await syncDwServices()).count;
  }

  if (target === "packages" || target === "all") {
    const packagesResult = await syncDwPackages();
    summary.packages = packagesResult.count;
    summary.packagesSource = packagesResult.source;
    summary.packagesSkipped = packagesResult.skipped;
  }

  return summary;
}

export async function runDwSync(request: {
  target: DwSyncTarget;
  search?: string | null;
  hisCustomerId?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
}) {
  if (request.target === "exams") {
    return runDwIntegrationEvent(
      "DW_SYNC_EXAMS",
      {
        target: request.target,
        hisCustomerId: request.hisCustomerId ?? null,
        fromDate: request.fromDate ?? null,
        toDate: request.toDate ?? null,
      },
      async () => syncDwExamFlows({
        hisCustomerId: request.hisCustomerId ?? null,
        fromDate: request.fromDate ?? null,
        toDate: request.toDate ?? null,
      }),
      (result) => `DW exam sync completed: bills=${result.count}, headers=${result.headers}, rows=${result.rawRows}`,
    );
  }

  const masterTarget = request.target as "customers" | "doctors" | "services" | "packages" | "all";

  return runDwIntegrationEvent(
    `DW_SYNC_${request.target.toUpperCase()}`,
    {
      target: request.target,
      search: request.search ?? null,
    },
    async () => syncDwMasterData(masterTarget, request.search ?? null),
    summarizeDwMasterResult,
  );
}
