import { NextRequest, NextResponse } from "next/server";

const GOOGLE_FONTS_BASE_URL = "https://fonts.googleapis.com";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const resolved = await params;
  if (!Array.isArray(resolved.path) || resolved.path.length === 0) {
    return NextResponse.json({ error: "Missing font path" }, { status: 400 });
  }

  const upstreamUrl = new URL(
    `${GOOGLE_FONTS_BASE_URL}/${resolved.path.join("/")}`,
  );
  req.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });

  const headers = new Headers();
  const userAgent = req.headers.get("user-agent");
  const acceptLanguage = req.headers.get("accept-language");
  if (userAgent) headers.set("user-agent", userAgent);
  if (acceptLanguage) headers.set("accept-language", acceptLanguage);

  const res = await fetch(upstreamUrl.toString(), {
    method: "GET",
    headers,
    redirect: "follow",
  });

  const newHeaders = new Headers(res.headers);
  // Avoid content-encoding mismatch when downstream applies its own compression.
  newHeaders.delete("content-encoding");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: newHeaders,
  });
}

export const runtime = "nodejs";
