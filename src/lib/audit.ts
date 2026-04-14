import prisma from "@/lib/prisma";
import { JwtPayload } from "@/lib/auth";

export interface AuditLogInput {
  userId?: string;
  action: string;
  entityType: string;
  entityId: string;
  oldData?: unknown;
  newData?: unknown;
}

export async function createAuditLog(input: AuditLogInput) {
  return prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldData: input.oldData ? JSON.parse(JSON.stringify(input.oldData)) : undefined,
      newData: input.newData ? JSON.parse(JSON.stringify(input.newData)) : undefined,
    },
  });
}

// Helper to log from API context
export async function auditFromUser(
  user: JwtPayload | null,
  action: string,
  entityType: string,
  entityId: string,
  oldData?: unknown,
  newData?: unknown
) {
  return createAuditLog({
    userId: user?.userId,
    action,
    entityType,
    entityId,
    oldData,
    newData,
  });
}
