import { NextRequest } from "next/server";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { err, forbidden, ok, unauthorized } from "@/lib/response";
import { runDwSync } from "@/lib/dw-sync";

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "MANAGER")) return forbidden();

  try {
    const body = await req.json();
    const target = body.target as "customers" | "doctors" | "services" | "packages" | "all" | "exams";

    if (!target) {
      return err("target is required");
    }

    const result = await runDwSync({
      target,
      search: typeof body.search === "string" ? body.search : null,
      hisCustomerId: typeof body.hisCustomerId === "number" ? body.hisCustomerId : null,
      fromDate: typeof body.fromDate === "string" ? body.fromDate : null,
      toDate: typeof body.toDate === "string" ? body.toDate : null,
    });
    return ok(result);
  } catch (error) {
    return err(error instanceof Error ? error.message : "DW sync failed", 500);
  }
}
