import { authUcanFetch } from "@yeying-community/web3-bs";
import {
  UCAN_SESSION_ID,
  getWebdavAudience,
  getWebdavCapabilities,
} from "./ucan";
import { getCachedUcanSession } from "./ucan-session";
import { getClientConfig } from "../config/client";
import { isCentralModeEnabled } from "./central-ucan";

export interface WebDAVQuota {
  quota: number; // 总配额（字节）
  used: number; // 已用（字节）
  available: number; // 剩余（字节）
  percentage: number; // 使用百分比
  unlimited: boolean; // 是否无限
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeQuota(data: unknown): WebDAVQuota | undefined {
  if (!data || typeof data !== "object") return;
  const payload = data as Record<string, unknown>;
  const quota = toFiniteNumber(payload.quota, 0);
  const used = toFiniteNumber(payload.used, 0);
  const unlimited = Boolean(payload.unlimited) || quota <= 0;
  const available = unlimited
    ? toFiniteNumber(payload.available, 0)
    : Math.max(
        0,
        toFiniteNumber(payload.available, quota - used),
      );
  const percentage = unlimited
    ? toFiniteNumber(payload.percentage, 0)
    : quota > 0
      ? toFiniteNumber(payload.percentage, (used / quota) * 100)
      : 0;

  return {
    quota,
    used,
    available,
    percentage,
    unlimited,
  };
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function getDirectQuotaUrl(): string {
  const backendBaseUrl = normalizeBaseUrl(
    getClientConfig()?.webdavBackendBaseUrl ?? "",
  );
  if (!backendBaseUrl) {
    throw new Error("WEBDAV_BACKEND_BASE_URL is not configured");
  }
  return `${backendBaseUrl}/api/v1/public/webdav/quota`;
}

export async function fetchQuota(): Promise<WebDAVQuota | undefined> {
  try {
    if (isCentralModeEnabled()) {
      // Center-issued login currently targets Router access only.
      return;
    }
    const audience = getWebdavAudience();
    if (!audience) {
      throw new Error("WebDAV UCAN audience is not configured");
    }
    const issuer = await getCachedUcanSession();
    if (!issuer) {
      return;
    }
    const response = await authUcanFetch(
      getDirectQuotaUrl(),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      {
        sessionId: UCAN_SESSION_ID,
        audience,
        capabilities: getWebdavCapabilities(),
        issuer: issuer ?? undefined,
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP response.status:{await response.text()}`);
    }

    const data = await response.json();
    return normalizeQuota(data);
  } catch (error) {
    console.error("❌获取 quota 失败:", error);
  }
}
