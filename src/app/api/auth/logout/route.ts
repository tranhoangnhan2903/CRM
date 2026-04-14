import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ success: true, data: { loggedOut: true } });
  response.cookies.set({
    name: "token",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: 0,
  });
  return response;
}
