import { getClientConfig } from "@/app/config/client";

export const UCAN_AUTH_MODE_KEY = "ucanAuthMode";
export const UCAN_AUTH_MODE_WALLET = "wallet";
export const UCAN_AUTH_MODE_CENTRAL = "central";
export const UCAN_AUTH_EVENT = "ucan-auth-change";

const CENTRAL_UCAN_TOKEN_KEY = "centralUcanToken";
const CENTRAL_ACCESS_TOKEN_KEY = "centralAccessToken";
const CENTRAL_UCAN_EXPIRES_AT_KEY = "centralUcanExpiresAt";
const CENTRAL_ACCESS_EXPIRES_AT_KEY = "centralAccessExpiresAt";
const CENTRAL_SUBJECT_KEY = "centralAuthSubject";
const TOKEN_SKEW_MS = 5 * 1000;

type Envelope<T> = {
  code: number;
  message: string;
  data: T;
  timestamp: number;
};

export type UcanCapability = {
  with?: string;
  can?: string;
  resource?: string;
  action?: string;
};

export type CentralAuthorizeRequestResult = {
  requestId: string;
  status: string;
  subject: string;
  subjectHint: string;
  clientId: string;
  redirectUri: string;
  state?: string;
  audience: string;
  capabilities: UcanCapability[];
  appName: string;
  createdAt: number;
  expiresAt: number;
  verifyUrl: string;
};

export type CentralAuthorizeExchangeResult = {
  requestId: string;
  subject: string;
  clientId: string;
  redirectUri: string;
  state?: string;
  token: string;
  expiresAt: number;
  refreshExpiresAt: number;
  ucan: string;
  issuer: string;
  audience: string;
  capabilities: UcanCapability[];
  notBefore: number;
  ucanExpiresAt: number;
  issuedAt: number;
};

export type UcanAuthMode =
  | typeof UCAN_AUTH_MODE_WALLET
  | typeof UCAN_AUTH_MODE_CENTRAL;

function emitAuthChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UCAN_AUTH_EVENT));
}

function normalizeEpochMs(value: number | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  if (!value) return null;
  return value < 1e12 ? value * 1000 : value;
}

function decodeBase64Url(input: string): string | null {
  if (!input) return null;
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): { exp?: number; nbf?: number } | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const text = decodeBase64Url(parts[1]);
  if (!text) return null;
  try {
    return JSON.parse(text) as { exp?: number; nbf?: number };
  } catch {
    return null;
  }
}

function parseStoredExpireAt(key: string): number | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = Number(raw);
  return normalizeEpochMs(parsed) ?? null;
}

function storeExpireAt(key: string, value: number | undefined) {
  if (typeof localStorage === "undefined") return;
  const normalized = normalizeEpochMs(value);
  if (!normalized) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, String(normalized));
}

function parseTokenExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return null;
  return normalizeEpochMs(payload.exp);
}

function isTokenValid(
  token: string,
  expiresAt: number | null,
  notBefore?: number | null,
) {
  if (!token) return false;
  const now = Date.now();
  if (notBefore && now < notBefore) return false;
  if (!expiresAt) return false;
  return expiresAt > now + TOKEN_SKEW_MS;
}

function parseEnvelope<T>(payload: string, fallbackMessage: string): T {
  if (!payload) {
    throw new Error(fallbackMessage);
  }
  let parsed: Envelope<T>;
  try {
    parsed = JSON.parse(payload) as Envelope<T>;
  } catch {
    throw new Error(payload);
  }
  if (parsed.code !== 0) {
    throw new Error(parsed.message || fallbackMessage);
  }
  return parsed.data;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function resolveCentralAuthBaseUrl(baseUrlOverride?: string): string {
  const fromOverride = normalizeBaseUrl(baseUrlOverride || "");
  if (fromOverride) return fromOverride;
  const config = getClientConfig();
  const fromConfig = normalizeBaseUrl(config?.centralUcanAuthBaseUrl || "");
  if (fromConfig) return fromConfig;
  const fallback = normalizeBaseUrl(config?.routerBackendUrl || "");
  return fallback || "http://127.0.0.1:8100";
}

function buildApiUrl(path: string, baseUrlOverride?: string) {
  const base = resolveCentralAuthBaseUrl(baseUrlOverride);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function getDefaultCentralClientId() {
  const config = getClientConfig();
  return (
    config?.centralUcanAppId?.trim() ||
    config?.centralUcanClientId?.trim() ||
    "chat-web"
  );
}

export function getUcanAuthMode(): UcanAuthMode {
  if (typeof localStorage === "undefined") return UCAN_AUTH_MODE_WALLET;
  const value = (localStorage.getItem(UCAN_AUTH_MODE_KEY) || "").trim();
  if (value === UCAN_AUTH_MODE_CENTRAL) {
    return UCAN_AUTH_MODE_CENTRAL;
  }
  return UCAN_AUTH_MODE_WALLET;
}

export function setUcanAuthMode(mode: UcanAuthMode, options?: { emit?: boolean }) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(UCAN_AUTH_MODE_KEY, mode);
  }
  if (options?.emit !== false) {
    emitAuthChange();
  }
}

export function isCentralModeEnabled() {
  return getUcanAuthMode() === UCAN_AUTH_MODE_CENTRAL;
}

export function clearCentralUcanAuth(
  options?: { preserveMode?: boolean; emit?: boolean },
) {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(CENTRAL_UCAN_TOKEN_KEY);
    localStorage.removeItem(CENTRAL_ACCESS_TOKEN_KEY);
    localStorage.removeItem(CENTRAL_UCAN_EXPIRES_AT_KEY);
    localStorage.removeItem(CENTRAL_ACCESS_EXPIRES_AT_KEY);
    localStorage.removeItem(CENTRAL_SUBJECT_KEY);
    if (!options?.preserveMode) {
      localStorage.removeItem(UCAN_AUTH_MODE_KEY);
    }
  }
  if (options?.emit !== false) {
    emitAuthChange();
  }
}

export function getCentralAccount(): string {
  if (typeof localStorage === "undefined") return "";
  return (localStorage.getItem(CENTRAL_SUBJECT_KEY) || "").trim();
}

export function getCentralUcanToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  const token = (localStorage.getItem(CENTRAL_UCAN_TOKEN_KEY) || "").trim();
  if (!token) return null;
  const storedExpiresAt = parseStoredExpireAt(CENTRAL_UCAN_EXPIRES_AT_KEY);
  const payload = decodeJwtPayload(token);
  const tokenExp = parseTokenExpiry(token);
  const expiresAt = storedExpiresAt || tokenExp;
  const notBefore = normalizeEpochMs(payload?.nbf);
  if (!isTokenValid(token, expiresAt, notBefore)) {
    clearCentralUcanAuth({ preserveMode: true, emit: false });
    return null;
  }
  if (!storedExpiresAt && tokenExp) {
    storeExpireAt(CENTRAL_UCAN_EXPIRES_AT_KEY, tokenExp);
  }
  return token;
}

export function getCentralAccessToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  const token = (localStorage.getItem(CENTRAL_ACCESS_TOKEN_KEY) || "").trim();
  if (!token) return null;
  const storedExpiresAt = parseStoredExpireAt(CENTRAL_ACCESS_EXPIRES_AT_KEY);
  const payload = decodeJwtPayload(token);
  const tokenExp = parseTokenExpiry(token);
  const expiresAt = storedExpiresAt || tokenExp;
  const notBefore = normalizeEpochMs(payload?.nbf);
  if (!isTokenValid(token, expiresAt, notBefore)) {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(CENTRAL_ACCESS_TOKEN_KEY);
      localStorage.removeItem(CENTRAL_ACCESS_EXPIRES_AT_KEY);
    }
    return null;
  }
  if (!storedExpiresAt && tokenExp) {
    storeExpireAt(CENTRAL_ACCESS_EXPIRES_AT_KEY, tokenExp);
  }
  return token;
}

export function isCentralUcanAuthorized(): boolean {
  if (!isCentralModeEnabled()) return false;
  return Boolean(getCentralUcanToken());
}

export function getCentralUcanAuthorizationHeader(): string | null {
  if (!isCentralModeEnabled()) return null;
  const token = getCentralUcanToken();
  if (!token) return null;
  return `Bearer ${token}`;
}

export function getCentralUcanExpiresAt(): number | null {
  const stored = parseStoredExpireAt(CENTRAL_UCAN_EXPIRES_AT_KEY);
  if (stored) return stored;
  const token = getCentralUcanToken();
  if (!token) return null;
  const exp = parseTokenExpiry(token);
  if (!exp) return null;
  storeExpireAt(CENTRAL_UCAN_EXPIRES_AT_KEY, exp);
  return exp;
}

export async function createCentralAuthorizeRequest(input: {
  address: string;
  clientId?: string;
  redirectUri: string;
  state?: string;
  audience?: string;
  capabilities?: UcanCapability[];
  appName?: string;
  requestTtlMs?: number;
  baseUrl?: string;
}): Promise<CentralAuthorizeRequestResult> {
  const response = await fetch(
    buildApiUrl("/api/v1/public/auth/totp/authorize/request", input.baseUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        address: input.address,
        clientId: input.clientId || getDefaultCentralClientId(),
        redirectUri: input.redirectUri,
        state: input.state || undefined,
        audience: input.audience || undefined,
        capabilities: input.capabilities || undefined,
        appName: input.appName || undefined,
        requestTtlMs: input.requestTtlMs,
      }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    let message = `创建中心化授权请求失败: ${response.status}`;
    try {
      const parsed = JSON.parse(text) as Envelope<unknown>;
      if (parsed?.message) message = parsed.message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return parseEnvelope<CentralAuthorizeRequestResult>(text, "创建中心化授权请求失败");
}

export async function exchangeCentralAuthorizeCode(input: {
  code: string;
  clientId?: string;
  redirectUri: string;
  baseUrl?: string;
}): Promise<CentralAuthorizeExchangeResult> {
  const response = await fetch(
    buildApiUrl("/api/v1/public/auth/totp/authorize/exchange", input.baseUrl),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        code: input.code,
        clientId: input.clientId || getDefaultCentralClientId(),
        redirectUri: input.redirectUri,
      }),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    let message = `中心化授权码兑换失败: ${response.status}`;
    try {
      const parsed = JSON.parse(text) as Envelope<unknown>;
      if (parsed?.message) message = parsed.message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return parseEnvelope<CentralAuthorizeExchangeResult>(text, "中心化授权码兑换失败");
}

export function applyCentralAuthorizeExchange(
  result: CentralAuthorizeExchangeResult,
  options?: { emit?: boolean },
) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(CENTRAL_UCAN_TOKEN_KEY, result.ucan);
    localStorage.setItem(CENTRAL_ACCESS_TOKEN_KEY, result.token);
    localStorage.setItem(CENTRAL_SUBJECT_KEY, result.subject);
    localStorage.setItem("currentAccount", result.subject);
    storeExpireAt(CENTRAL_UCAN_EXPIRES_AT_KEY, result.ucanExpiresAt);
    storeExpireAt(CENTRAL_ACCESS_EXPIRES_AT_KEY, result.expiresAt);
  }
  setUcanAuthMode(UCAN_AUTH_MODE_CENTRAL, { emit: false });
  if (options?.emit !== false) {
    emitAuthChange();
  }
}
