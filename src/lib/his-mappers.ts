export type HisRecord = Record<string, unknown>;

function pickFirst(record: HisRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

export function readString(record: HisRecord, keys: string[]) {
  const value = pickFirst(record, keys);
  if (value === null) {
    return null;
  }
  return String(value).trim() || null;
}

export function readNumber(record: HisRecord, keys: string[]) {
  const value = pickFirst(record, keys);
  if (value === null) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function readDate(record: HisRecord, keys: string[]) {
  const value = pickFirst(record, keys);
  if (value === null) {
    return null;
  }

  const normalizeWallClockDate = (dateValue: Date) => new Date(Date.UTC(
    dateValue.getFullYear(),
    dateValue.getMonth(),
    dateValue.getDate(),
    dateValue.getHours(),
    dateValue.getMinutes(),
    dateValue.getSeconds(),
    dateValue.getMilliseconds(),
  ));

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : normalizeWallClockDate(value);
  }

  const textValue = String(value).trim();
  const directDateMatch = textValue.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?)?$/,
  );

  if (directDateMatch) {
    const [, year, month, day, hour = "0", minute = "0", second = "0", millisecond = "0"] = directDateMatch;
    return new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(millisecond.padEnd(3, "0")),
    ));
  }

  const dateValue = new Date(textValue);
  return Number.isNaN(dateValue.getTime()) ? null : normalizeWallClockDate(dateValue);
}

export function normalizeGender(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (["M", "MALE", "NAM", "1"].includes(normalized)) {
    return "MALE";
  }
  if (["F", "FEMALE", "NU", "NỮ", "0", "2"].includes(normalized)) {
    return "FEMALE";
  }
  return normalized;
}

export function toYearOfBirth(date: Date | null) {
  return date ? date.getFullYear() : null;
}

export function buildHisCustomer(record: HisRecord) {
  const dob = readDate(record, ["DOB", "CUST_DOB", "DATEOFBIRTH"]);
  const hisCustomerId = readNumber(record, ["CUSTID", "CUST_ID"]);
  const phone = readString(record, ["FONE", "CUST_FONE", "PHONE"]) || (hisCustomerId ? `HIS-${hisCustomerId}` : null);

  return {
    hisCustomerId,
    hisCustomerCode: readString(record, ["CUSTCD", "CUST_CD"]),
    cmpId: readNumber(record, ["CMPID", "CMP_ID"]),
    fullName: readString(record, ["CUSTNM", "CUST_NM", "FULLNAME"]) || "Khách HIS",
    phone: phone || `HIS-${Date.now()}`,
    email: readString(record, ["EMAIL", "CUST_EMAIL"]),
    address: readString(record, ["ADDRFULL", "CUST_ADDRFULL", "ADDR", "CUST_ADDR"]),
    yearOfBirth: toYearOfBirth(dob),
    gender: normalizeGender(readString(record, ["GENDER", "CUST_GENDER"])),
    latestSohId: readNumber(record, ["SOHID", "EX_SOHID"]),
  };
}

export function buildHisDoctor(record: HisRecord) {
  const id = readNumber(record, ["EMPID"]);
  const email = readString(record, ["EMAIL"]);

  return {
    hisEmployeeId: id,
    hisEmployeeCode: readString(record, ["EMPCD"]),
    cmpId: readNumber(record, ["CMPID", "CMPID_OU"]),
    fullName: readString(record, ["EMPNAME", "EMPNM"]) || (id ? `Nhân sự HIS ${id}` : "Nhân sự HIS"),
    email: email || (id ? `his-emp-${id}@local.invalid` : `his-emp-${Date.now()}@local.invalid`),
    departmentCode: readString(record, ["DIVISION", "SRV_DIVISION"]),
    departmentName: readString(record, ["DIVISION_STR", "DEPARTMENTNM", "DEPARTMENT_NAME"]),
  };
}

export function buildHisService(record: HisRecord) {
  const id = readNumber(record, ["ITID", "EX_ITID"]);

  return {
    hisServiceId: id,
    cmpId: readNumber(record, ["CMPID"]),
    code: readString(record, ["ITCODE", "EX_ITCODE"]) || (id ? `HIS-SRV-${id}` : `HIS-SRV-${Date.now()}`),
    name: readString(record, ["ITNM", "EX_ITNM"]) || "Dich vu HIS",
    price: readNumber(record, ["ITPRICE", "PRICE", "AMT"]) || 0,
    departmentCode: readString(record, ["SRV_DIVISION", "DIVISION"]),
    departmentName: readString(record, ["DIVISION_STR"]),
    room: readString(record, ["ROOM", "SRV_ROOM"]),
    srvGroup: readString(record, ["SRV_GROUP", "EX_SRVGROUP"]),
    description: readString(record, ["DESCT", "DESCRIPTION"]),
  };
}

export function buildHisPackage(record: HisRecord) {
  const id = readNumber(record, ["PKGSID"]);

  return {
    hisPackageId: id,
    cmpId: readNumber(record, ["CMPID"]),
    code: readString(record, ["PKGSCD", "PKGSCODE", "PKGS_CODE"]) || (id ? `HIS-PKG-${id}` : `HIS-PKG-${Date.now()}`),
    name: readString(record, ["PKGS_NM", "PKGSNM", "PKGS_NAME"]) || "Goi kham HIS",
    description: readString(record, ["DESCT", "DESCRIPTION"]),
    subtype: readString(record, ["PKGS_SUBTYPE"]),
    contractId: readNumber(record, ["CONTRACTID"]),
    price: readNumber(record, ["PRICE", "AMT", "TOTAL_AMT"]),
  };
}

export function buildHisExam(record: HisRecord) {
  const customer = buildHisCustomer(record);
  const service = buildHisService(record);

  return {
    hisSohId: readNumber(record, ["SOHID", "EX_SOHID"]),
    hisSohCode: readString(record, ["SOHCD"]),
    cmpId: readNumber(record, ["CMPID"]),
    customer,
    totalAmount: readNumber(record, ["TOTAL_AMT", "AMT"]) || service.price,
    status: readString(record, ["STATUS", "PROCESS_STATUS"]),
    serviceGroup: readString(record, ["SRV_GROUP", "EX_SRVGROUP"]),
    divisionCode: readString(record, ["SRV_DIVISION", "EX_DIVISION"]),
    divisionName: readString(record, ["DIVISION_STR", "EX_DIVISION_DESCT"]),
    room: readString(record, ["SRV_ROOM", "ROOM"]),
    trxDate: readDate(record, ["TRX_DATE", "EX_DATE", "REG_DATE"]),
    regDate: readDate(record, ["REG_DATE", "EX_REGDATE"]),
    performerId: readNumber(record, ["PROEMPID"]),
    performerName: readString(record, ["PROEMPNM", "EX_PROEMP"]),
    introducerId: readNumber(record, ["INTROEMPID"]),
    introducerName: readString(record, ["INTROEMPNM"]),
    saleId: readNumber(record, ["SALESREPID"]),
    saleName: readString(record, ["SALESREPNM"]),
  };
}

export function buildHisExamOrder(record: HisRecord) {
  const service = buildHisService(record);

  return {
    hisSolId: readNumber(record, ["SOLID", "EX_SOLID"]),
    hisSourceSohId: readNumber(record, ["SOURCE_SOHID"]),
    hisSourceSolId: readNumber(record, ["SOURCE_SOLID"]),
    hisAssignType: readString(record, ["ASSIGNTYPE"]),
    hisIntroEmployeeId: readNumber(record, ["INTROEMPID", "INTROEMMID"]),
    performerId: readNumber(record, ["PROEMPID", "PROEMMID"]),
    performerName: readString(record, ["PROEMPNM", "PROEMMNM"]),
    quantity: readNumber(record, ["QTY"]) || 1,
    price: readNumber(record, ["PRICE", "ITPRICE"]) || service.price,
    status: readString(record, ["STATUS", "PROCESS_STATUS"]),
    service,
  };
}

export function mapHisStatusToBillStatus(value: string | null) {
  const normalized = value?.toUpperCase() || "";

  if (["PAID", "DONE", "COMPLETED", "FINISHED"].includes(normalized)) {
    return "PAID";
  }
  if (["CANCELLED", "DELETED", "VOID"].includes(normalized)) {
    return "CANCELLED";
  }
  if (["INPROCESS", "IN_PROGRESS", "PROCESSING", "PENDING"].includes(normalized)) {
    return "PENDING";
  }
  return "DRAFT";
}

export function mapHisStatusToOrderStatus(value: string | null, billStatus: string) {
  if (billStatus === "PAID") {
    return "COMPLETED";
  }

  const normalized = value?.toUpperCase() || "";
  if (["COMPLETED", "DONE", "PAID"].includes(normalized)) {
    return "COMPLETED";
  }
  if (["CANCELLED", "DELETED", "VOID"].includes(normalized)) {
    return "CANCELLED";
  }
  if (["INPROCESS", "IN_PROGRESS", "PROCESSING"].includes(normalized)) {
    return "IN_PROGRESS";
  }
  return "PENDING";
}
