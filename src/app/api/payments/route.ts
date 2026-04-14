import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromRequest, requireRole } from "@/lib/auth";
import { ok, err, unauthorized, forbidden } from "@/lib/response";
import { auditFromUser } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return unauthorized();
  if (!requireRole(user, "ADMIN", "ACCOUNTANT", "RECEPTIONIST")) return forbidden();

  try {
    const body = await req.json();
    const { billId, amount, method } = body;

    if (!billId || !amount) return err("billId and amount required");

    const bill = await prisma.bill.findUnique({ where: { id: billId } });
    if (!bill) return err("Bill not found", 404);

    const payment = await prisma.payment.create({
      data: {
        billId,
        amount,
        method: method || "CASH",
        status: "SUCCESS",
      },
    });

    // Check if total paid >= bill total => mark PAID
    const totalPaid = await prisma.payment.aggregate({
      where: { billId, status: "SUCCESS" },
      _sum: { amount: true },
    });

    if (bill.status !== "PAID" && (totalPaid._sum.amount ?? 0) >= bill.totalAmount) {
      await prisma.bill.update({
        where: { id: billId },
        data: { status: "PAID" },
      });
      // Trigger referral commission
      const { createBillPaidCommissions } = await import("@/lib/commission");
      await createBillPaidCommissions(billId);
    }

    await auditFromUser(user, "CREATE_PAYMENT", "Payment", payment.id, null, payment);
    return ok(payment, 201);
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
