import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, err, unauthorized, forbidden } from "@/lib/response";
import { auditFromUser } from "@/lib/audit";
import {
  createExecutorCommission,
  reverseCommissionsForOrder,
} from "@/lib/commission";

// PATCH /api/service-orders — update status
export async function PATCH(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "DOCTOR", "RECEPTIONIST")) return forbidden();

  try {
    const body = await req.json();
    const { id, status, executorId } = body;
    if (!id) return err("id required");

    const old = await prisma.serviceOrder.findUnique({ where: { id } });
    if (!old) return err("ServiceOrder not found", 404);

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (executorId) updateData.executorId = executorId;

    const order = await prisma.serviceOrder.update({
      where: { id },
      data: updateData,
    });

    await auditFromUser(user, "UPDATE_SERVICE_ORDER", "ServiceOrder", id, old, order);

    // Business rule: executor commission on COMPLETED
    if (status === "COMPLETED" && old.status !== "COMPLETED") {
      await createExecutorCommission(id);
    }
    if (status === "CANCELLED" && old.status === "COMPLETED") {
      await reverseCommissionsForOrder(id);
    }

    return ok(order);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
