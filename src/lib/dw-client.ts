import { Pool, type QueryResultRow } from "pg";
import { getDwConfig } from "@/lib/dw-config";

const globalForDw = globalThis as unknown as {
  dwPool?: Pool;
  dwColumnCache?: Map<string, string[]>;
};

function createDwPool() {
  const config = getDwConfig();
  return new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

const dwColumnCache = globalForDw.dwColumnCache || new Map<string, string[]>();

if (process.env.NODE_ENV !== "production") {
  globalForDw.dwColumnCache = dwColumnCache;
}

export function getDwPool() {
  if (!globalForDw.dwPool) {
    globalForDw.dwPool = createDwPool();
  }

  return globalForDw.dwPool;
}

export function quoteDwIdent(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

export async function dwQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const result = await getDwPool().query<T>(text, values);
  return result.rows;
}

export async function getDwTableColumns(tableName: string) {
  const { schema } = getDwConfig();
  const cacheKey = `${schema}.${tableName}`;
  const cached = dwColumnCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const rows = await dwQuery<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schema, tableName],
  );

  const columns = rows.map((row) => row.column_name);
  dwColumnCache.set(cacheKey, columns);
  return columns;
}

export function pickDwColumn(availableColumns: string[], candidates: string[]) {
  for (const candidate of candidates) {
    if (availableColumns.includes(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function buildDwSelectList(
  availableColumns: string[],
  columns: Array<{ alias: string; candidates: string[] }>,
) {
  const selected: string[] = [];

  for (const column of columns) {
    const actual = pickDwColumn(availableColumns, column.candidates);
    if (!actual) {
      continue;
    }

    selected.push(`${quoteDwIdent(actual)} AS ${quoteDwIdent(column.alias)}`);
  }

  return selected;
}
