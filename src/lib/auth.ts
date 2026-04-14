import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return secret;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  departmentId?: string | null;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "8h" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const cookie = req.cookies.get("token");
  return cookie?.value ?? null;
}

export function getUserFromRequest(req: NextRequest): JwtPayload | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return verifyToken(token);
}

// Role-based guard
export function requireRole(user: JwtPayload | null, ...roles: string[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}
