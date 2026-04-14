import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/auth";
import { err } from "@/lib/response";

type AttemptEntry = {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number;
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const loginAttemptStore = new Map<string, AttemptEntry>();

function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return req.headers.get("x-real-ip") || "unknown";
}

function getAttemptEntry(key: string, now: number) {
  const existing = loginAttemptStore.get(key);
  if (!existing) {
    return null;
  }

  if (existing.blockedUntil > now) {
    return existing;
  }

  if (existing.firstAttemptAt + LOGIN_WINDOW_MS <= now) {
    loginAttemptStore.delete(key);
    return null;
  }

  return existing;
}

function getRetryAfterSeconds(entries: Array<AttemptEntry | null>, now: number) {
  const retryAfterMs = Math.max(
    0,
    ...entries.map((entry) => (entry?.blockedUntil && entry.blockedUntil > now ? entry.blockedUntil - now : 0))
  );

  return retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : null;
}

function registerFailedAttempt(key: string, now: number) {
  const existing = getAttemptEntry(key, now);

  if (!existing) {
    loginAttemptStore.set(key, {
      count: 1,
      firstAttemptAt: now,
      blockedUntil: 0,
    });
    return;
  }

  const nextCount = existing.count + 1;
  loginAttemptStore.set(key, {
    count: nextCount,
    firstAttemptAt: existing.firstAttemptAt,
    blockedUntil: nextCount >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_BLOCK_MS : 0,
  });
}

function clearAttempts(keys: string[]) {
  keys.forEach((key) => loginAttemptStore.delete(key));
}

async function delayFailedLoginResponse() {
  await new Promise((resolve) => setTimeout(resolve, 350));
}

export async function POST(req: NextRequest) {
  try {
    const now = Date.now();
    const clientIp = getClientIp(req);
    const { email, password } = await req.json();
    if (typeof email !== "string" || typeof password !== "string") {
      return err("Email and password required");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    const attemptKeys = [`ip:${clientIp}`, `email:${normalizedEmail}`, `ip-email:${clientIp}:${normalizedEmail}`];
    const retryAfter = getRetryAfterSeconds(attemptKeys.map((key) => getAttemptEntry(key, now)), now);

    if (retryAfter !== null) {
      const response = NextResponse.json(
        { success: false, error: "Too many failed login attempts. Please try again later." },
        { status: 429 }
      );
      response.headers.set("Retry-After", String(retryAfter));
      return response;
    }

    if (!normalizedEmail || !normalizedPassword) {
      return err("Email and password required");
    }

    if (!normalizedEmail.includes("@") || normalizedEmail.length > 120) {
      return err("Invalid email format");
    }

    if (normalizedPassword.length < 8 || normalizedPassword.length > 128) {
      return err("Invalid password format");
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { role: true },
    });

    if (!user) {
      attemptKeys.forEach((key) => registerFailedAttempt(key, now));
      await delayFailedLoginResponse();
      return err("Invalid credentials", 401);
    }

    const valid = await bcrypt.compare(normalizedPassword, user.passwordHash);
    if (!valid) {
      attemptKeys.forEach((key) => registerFailedAttempt(key, now));
      await delayFailedLoginResponse();
      return err("Invalid credentials", 401);
    }

    clearAttempts(attemptKeys);

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role.name,
      departmentId: user.departmentId,
    });

    const response = NextResponse.json({
      success: true,
      data: {
        user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role.name },
      },
    });

    response.cookies.set({
      name: "token",
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (e: unknown) {
    return err((e as Error).message, 500);
  }
}
