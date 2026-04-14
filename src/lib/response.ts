import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function okWithMeta(data: unknown, meta: Record<string, unknown>, status = 200) {
  return NextResponse.json({ success: true, data, meta }, { status });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function unauthorized(message = "Unauthorized") {
  return err(message, 401);
}

export function forbidden(message = "Forbidden") {
  return err(message, 403);
}
