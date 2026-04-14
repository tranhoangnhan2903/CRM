import { NextRequest } from "next/server";

export interface PaginationInput {
  page: number;
  limit: number;
  skip: number;
}

function parsePositiveInteger(raw: string | null, fallback: number) {
  const parsed = Number.parseInt(raw || "", 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function getPagination(req: NextRequest, defaults?: { page?: number; limit?: number; maxLimit?: number }): PaginationInput {
  const { searchParams } = new URL(req.url);
  const page = parsePositiveInteger(searchParams.get("page"), defaults?.page ?? 1);
  const requestedLimit = parsePositiveInteger(searchParams.get("limit"), defaults?.limit ?? 100);
  const maxLimit = defaults?.maxLimit ?? 500;
  const limit = Math.min(requestedLimit, maxLimit);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function getPaginationMeta(total: number, page: number, limit: number) {
  return {
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
