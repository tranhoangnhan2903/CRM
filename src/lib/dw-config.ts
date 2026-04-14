const REQUIRED_KEYS = [
  "DW_DATABASE_URL",
] as const;

export interface DwConfig {
  databaseUrl: string;
  schema: string;
}

export function getDwMissingConfigKeys() {
  return REQUIRED_KEYS.filter((key) => !process.env[key]);
}

export function isDwConfigured() {
  return getDwMissingConfigKeys().length === 0;
}

export function getDwConfig(): DwConfig {
  const missing = getDwMissingConfigKeys();
  if (missing.length > 0) {
    throw new Error(`Missing DW configuration: ${missing.join(", ")}`);
  }

  return {
    databaseUrl: process.env.DW_DATABASE_URL!,
    schema: process.env.DW_SCHEMA?.trim() || "raw",
  };
}

export function getDwConfigStatus() {
  const missingKeys = getDwMissingConfigKeys();

  return {
    configured: missingKeys.length === 0,
    missingKeys,
  };
}
