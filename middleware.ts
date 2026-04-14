import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type RateLimitRule = {
  windowMs: number;
  max: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();
const CORS_ALLOWED_METHODS = "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD";
const CORS_ALLOWED_HEADERS = "Authorization, Content-Type, Accept, Origin, X-Requested-With, X-HIS-Secret";

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "");
}

function getLocalOriginAliases(req: NextRequest) {
  const aliases = new Set<string>();
  const protocol = req.nextUrl.protocol.replace(":", "");
  const port = req.nextUrl.port || (protocol === "https" ? "443" : "80");

  [
    `${protocol}://localhost:${port}`,
    `${protocol}://127.0.0.1:${port}`,
    `${protocol}://[::1]:${port}`,
  ].forEach((origin) => aliases.add(normalizeOrigin(origin)));

  return aliases;
}

function isPrivateIpv4(hostname: string) {
  return /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function isTrustedLocalOrigin(origin: string, req: NextRequest) {
  try {
    const originUrl = new URL(origin);
    const requestProtocol = req.nextUrl.protocol.replace(":", "");
    const requestPort = req.nextUrl.port || (requestProtocol === "https" ? "443" : "80");
    const originPort = originUrl.port || (originUrl.protocol === "https:" ? "443" : "80");

    if (originUrl.protocol !== req.nextUrl.protocol || originPort !== requestPort) {
      return false;
    }

    const originHost = originUrl.hostname;
    const requestHost = req.nextUrl.hostname;

    const originIsLocal = isLocalHostname(originHost) || isPrivateIpv4(originHost);
    const requestIsLocal = isLocalHostname(requestHost) || isPrivateIpv4(requestHost);

    return originIsLocal && requestIsLocal;
  } catch {
    return false;
  }
}

function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return req.headers.get("x-real-ip") || "unknown";
}

function getAllowedOrigins(req: NextRequest) {
  const configured = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  const allowedOrigins = new Set<string>(configured);
  allowedOrigins.add(normalizeOrigin(req.nextUrl.origin));

  getLocalOriginAliases(req).forEach((origin) => {
    allowedOrigins.add(origin);
  });

  return allowedOrigins;
}

function getRateLimitRule(pathname: string): RateLimitRule | null {
  if (pathname === "/api/auth/login") {
    return { windowMs: 15 * 60 * 1000, max: 20 };
  }
  if (pathname === "/api/his/sync") {
    return { windowMs: 5 * 60 * 1000, max: 8 };
  }
  if (pathname === "/api/his/webhook") {
    return { windowMs: 60 * 1000, max: 60 };
  }
  return null;
}

function isRateLimited(req: NextRequest) {
  const rule = getRateLimitRule(req.nextUrl.pathname);
  if (!rule) {
    return null;
  }

  const now = Date.now();
  const key = `${req.nextUrl.pathname}:${getClientIp(req)}`;
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + rule.windowMs,
    });
    return null;
  }

  if (current.count >= rule.max) {
    return Math.ceil((current.resetAt - now) / 1000);
  }

  current.count += 1;
  rateLimitStore.set(key, current);
  return null;
}

function applyCors(req: NextRequest, response: NextResponse) {
  const origin = req.headers.get("origin");
  const allowedOrigins = getAllowedOrigins(req);

  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS);
  response.headers.set("Access-Control-Allow-Methods", CORS_ALLOWED_METHODS);
  response.headers.set("Access-Control-Max-Age", "600");
  response.headers.set("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");

  if (!origin) {
    return response;
  }

  if (!allowedOrigins.has(normalizeOrigin(origin)) && !isTrustedLocalOrigin(origin, req)) {
    return NextResponse.json({ success: false, error: "Origin not allowed" }, { status: 403 });
  }

  response.headers.set("Access-Control-Allow-Origin", normalizeOrigin(origin));
  return response;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (req.method === "OPTIONS") {
      return applyCors(req, new NextResponse(null, { status: 204 }));
    }

    const retryAfter = isRateLimited(req);
    if (retryAfter !== null) {
      const response = NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
      response.headers.set("Retry-After", String(retryAfter));
      return applyCors(req, response);
    }

    return applyCors(req, NextResponse.next());
  }

  if (pathname.startsWith("/dashboard")) {
    const hasSession = Boolean(req.cookies.get("token")?.value);
    if (!hasSession) {
      const loginUrl = new URL("/", req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*"],
};
