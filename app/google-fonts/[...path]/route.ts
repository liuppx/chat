import { NextRequest, NextResponse } from "next/server";

const GOOGLE_FONTS_BASE_URL = "https://fonts.googleapis.com";

export const dynamic = "force-dynamic";

const FONT_PROXY_TIMEOUT_MS = 5000;
const FALLBACK_CSS =
  "/* Google Fonts is unavailable; use the system font stack. */\n";

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

  let res: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FONT_PROXY_TIMEOUT_MS);
    try {
      res = await fetch(upstreamUrl.toString(), {
        method: "GET",
        headers,
        redirect: "follow",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    // Fonts are an optional enhancement. A blocked or unavailable Google
    // endpoint must not turn the application shell into a 500 response.
    console.warn("[Google Fonts] upstream unavailable", error);
    return new Response(FALLBACK_CSS, {
      status: 200,
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  if (!res.ok) {
    console.warn("[Google Fonts] upstream returned an error", res.status);
    return new Response(FALLBACK_CSS, {
      status: 200,
      headers: {
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

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
