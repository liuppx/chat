import { NextRequest, NextResponse } from "next/server";

const SHARE_GPT_URL = "https://sharegpt.com/api/conversations";

export async function POST(req: NextRequest) {
  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  } else {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(SHARE_GPT_URL, {
    method: "POST",
    headers,
    body: req.body,
    // @ts-ignore
    duplex: "half",
    redirect: "follow",
  });

  const newHeaders = new Headers(res.headers);
  newHeaders.delete("content-encoding");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: newHeaders,
  });
}

export async function OPTIONS() {
  return NextResponse.json({ body: "OK" }, { status: 200 });
}

export const runtime = "nodejs";
