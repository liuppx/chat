// src/app/api/yeying/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "@/app/config/server";

const config = getServerSideConfig();
const WEBDAV_BACKEND_URL = config.web_dav_backend_url;

if (!WEBDAV_BACKEND_URL) {
  throw new Error("YEYING_BACKEND_URL is not set in environment variables");
}

async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  // 构造原始请求路径
  const requestUrl = new URL(req.url);
  const urlPath = requestUrl.pathname;

  // 构造目标 URL
  const targetUrl = `${WEBDAV_BACKEND_URL}${urlPath}`;

  // 转发请求头（保留 Content-Type、Authorization 等）
  const headers: HeadersInit = {};
  for (const [key, value] of req.headers.entries()) {
    // 可选：过滤敏感头，但通常直接透传即可
    headers[key] = value;
  }

  // 判断是否需要 body
  const shouldHaveBody = !["GET", "HEAD", "OPTIONS"].includes(
    req.method.toUpperCase(),
  );
  const body = shouldHaveBody ? await req.text() : null;

  try {
    const fetchRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      redirect: "manual",
    });

    // 返回响应
    const responseHeaders = new Headers(fetchRes.headers);
    // 删除 CORS 相关头（由 Next.js 处理）
    responseHeaders.delete("access-control-allow-origin");

    return new NextResponse(fetchRes.body, {
      status: fetchRes.status,
      statusText: fetchRes.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[Yeying Proxy] Error:", error);
    return NextResponse.json(
      { error: true, msg: "Failed to proxy request to Yeying backend" },
      { status: 500 },
    );
  }
}

// 导出所有需要的方法
export const GET = handle;

// 使用 Edge Runtime（与你的 webdav 代理一致）
export const runtime = "edge";
