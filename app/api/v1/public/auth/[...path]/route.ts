import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "@/app/config/server";

const config = getServerSideConfig();
const ROUTER_BACKEND_URL = config.router_backend_url;

if (!ROUTER_BACKEND_URL) {
  throw new Error("ROUTER_BACKEND_URL is not set in environment variables");
}

// 允许的路径前缀（安全限制）
const ALLOWED_PATHS = [
  "/api/v1/public/auth/challenge",
  "/api/v1/public/auth/verify",
  "/api/v1/public/auth/refresh",
  "/api/v1/public/auth/logout",
];

async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  // 构造原始请求路径
  const requestUrl = new URL(req.url);
  const urlPath = requestUrl.pathname;

  // 安全校验：只允许特定接口
  if (!ALLOWED_PATHS.some((allowed) => urlPath.endsWith(allowed))) {
    return NextResponse.json(
      { error: true, msg: "Forbidden API path => " + urlPath },
      { status: 403 },
    );
  }

  // 构造目标 URL
  const baseUrl = ROUTER_BACKEND_URL.replace(/\/$/, "");
  const targetUrl = `${baseUrl}${urlPath}`;

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
      body: body || undefined,
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
    console.error("[Router Auth Proxy] Error:", error);
    return NextResponse.json(
      { error: true, msg: "Failed to proxy request to router backend" },
      { status: 500 },
    );
  }
}

// 导出所有需要的方法
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const OPTIONS = handle;

// 使用 Node Runtime（需要访问本地/内网 router 服务）
export const runtime = "edge";
