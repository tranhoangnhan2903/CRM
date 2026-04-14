import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { err, ok } from "@/lib/response";
import { processHisWebhook } from "@/lib/his-sync";
import { getHisConfig } from "@/lib/his-config";

export async function POST(req: NextRequest) {
  try {
    const config = getHisConfig();
    if (!config.webhookSecret) {
      return err("HIS webhook secret is not configured", 503);
    }

    const providedSecret = req.headers.get("x-his-secret");
    if (!providedSecret) {
      return err("Missing HIS webhook secret", 401);
    }

    const expected = Buffer.from(config.webhookSecret);
    const received = Buffer.from(providedSecret);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
      return err("Invalid HIS webhook secret", 401);
    }

    const body = await req.json() as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return err("Invalid webhook payload", 400);
    }

    const result = await processHisWebhook(body as Record<string, unknown>);
    return ok(result, 201);
  } catch (error) {
    return err(error instanceof Error ? error.message : "Webhook processing failed", 500);
  }
}
