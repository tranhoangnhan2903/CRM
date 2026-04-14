const REQUIRED_KEYS = [
  "HIS_BASE_URL",
  "HIS_STORE_NAME",
  "HIS_DOMAIN",
  "HIS_USERNAME",
  "HIS_PASSWORD",
  "HIS_CMPID",
] as const;

export interface HisConfig {
  baseUrl: string;
  storeName: string;
  domain: string;
  username: string;
  password: string;
  cmpId: number;
  employeeId: number | null;
  webhookSecret: string | null;
}

export function getHisMissingConfigKeys() {
  return REQUIRED_KEYS.filter((key) => !process.env[key]);
}

export function isHisConfigured() {
  return getHisMissingConfigKeys().length === 0;
}

export function getHisConfig(): HisConfig {
  const missing = getHisMissingConfigKeys();
  if (missing.length > 0) {
    throw new Error(`Missing HIS configuration: ${missing.join(", ")}`);
  }

  return {
    baseUrl: process.env.HIS_BASE_URL!.replace(/\/+$/, ""),
    storeName: process.env.HIS_STORE_NAME!,
    domain: process.env.HIS_DOMAIN!,
    username: process.env.HIS_USERNAME!,
    password: process.env.HIS_PASSWORD!,
    cmpId: Number.parseInt(process.env.HIS_CMPID!, 10),
    employeeId: process.env.HIS_EMPID ? Number.parseInt(process.env.HIS_EMPID, 10) : null,
    webhookSecret: process.env.HIS_WEBHOOK_SECRET || null,
  };
}

export function getHisConfigStatus() {
  const missingKeys = getHisMissingConfigKeys();

  return {
    configured: missingKeys.length === 0,
    missingKeys,
  };
}
