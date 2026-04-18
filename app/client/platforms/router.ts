"use client";

import {
  ACCESS_CODE_PREFIX,
  ApiPath,
  OPENAI_BASE_URL,
  ServiceProvider,
} from "@/app/constant";
import { getClientConfig } from "@/app/config/client";
import { getCachedUcanSession } from "@/app/plugins/ucan-session";
import {
  getRouterAudience,
  getRouterCapabilities,
  getUcanRootCapsKey,
  UCAN_SESSION_ID,
} from "@/app/plugins/ucan";
import { useAccessStore } from "@/app/store";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";
import { fetch } from "@/app/utils/stream";
import {
  createInvocationUcan,
  getCapabilityAction,
  getCapabilityResource,
  normalizeUcanCapabilities,
  type UcanCapability,
} from "@yeying-community/web3-bs";
import {
  ChatOptions,
  LLMApi,
  LLMModel,
  LLMUsage,
  normalizeSupportedEndpoints,
  SupportedTextEndpoint,
  SpeechOptions,
} from "../api";

type RouterModelCard = {
  id?: string;
  owned_by?: string;
  supported_endpoints?: string[];
};

type RouterModelListResponse = {
  object?: string;
  data?: RouterModelCard[];
};

const ROUTER_HOST = "llm.yeying.pub";
const INVOCATION_TOKEN_SKEW_MS = 5 * 1000;

type CachedInvocationToken = {
  key: string;
  token: string;
  exp: number;
  nbf?: number;
};

let cachedRouterInvocationToken: CachedInvocationToken | null = null;

const ROUTER_BACKEND_HOST = (() => {
  try {
    const url = getClientConfig()?.routerBackendUrl;
    if (!url) return "";
    return new URL(url).host;
  } catch {
    return "";
  }
})();

function isRouterUrl(url: string): boolean {
  try {
    const base =
      typeof window === "undefined" ? "http://localhost" : window.location.origin;
    const parsed = new URL(url, base);
    return (
      parsed.host.includes(ROUTER_HOST) ||
      (ROUTER_BACKEND_HOST !== "" && parsed.host === ROUTER_BACKEND_HOST)
    );
  } catch {
    return false;
  }
}

function isUcanMetaValid(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const expRaw = localStorage.getItem("ucanRootExp");
    const iss = localStorage.getItem("ucanRootIss");
    const caps = localStorage.getItem("ucanRootCaps");
    const account = localStorage.getItem("currentAccount") || "";
    if (!expRaw || !iss || !account) return false;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= Date.now()) return false;
    if (!caps || caps !== getUcanRootCapsKey()) return false;
    return iss === `did:pkh:eth:${account.toLowerCase()}`;
  } catch {
    return false;
  }
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

function decodeUcanPayload(token: string): { exp?: number; nbf?: number } | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded) as { exp?: number; nbf?: number };
  } catch {
    return null;
  }
}

function buildCapsKey(caps: UcanCapability[]) {
  return normalizeUcanCapabilities(caps || [], { includeLegacyAliases: false })
    .map((cap) => {
      const resource = getCapabilityResource(cap);
      const action = getCapabilityAction(cap);
      return `${resource}:${action}`;
    })
    .filter((entry) => entry !== ":")
    .sort()
    .join("|");
}

function buildRouterInvocationCacheKey(
  audience: string,
  capabilities: UcanCapability[],
) {
  if (typeof localStorage === "undefined") return "";
  const account = localStorage.getItem("currentAccount") || "";
  const rootCaps = localStorage.getItem("ucanRootCaps") || "";
  return `${account}|${rootCaps}|${audience}|${buildCapsKey(capabilities)}`;
}

function getValidCachedRouterInvocationToken(
  audience: string,
  capabilities: UcanCapability[],
) {
  const cacheKey = buildRouterInvocationCacheKey(audience, capabilities);
  const cached = cachedRouterInvocationToken;
  if (!cached || !cacheKey || cached.key !== cacheKey) {
    return null;
  }
  const now = Date.now();
  if (cached.nbf && now < cached.nbf) {
    return null;
  }
  if (cached.exp <= now + INVOCATION_TOKEN_SKEW_MS) {
    return null;
  }
  return cached.token;
}

function getBaseRouterHeaders() {
  const accessStore = useAccessStore.getState();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const apiKey = accessStore.openaiApiKey.trim();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    return headers;
  }

  const accessCode = accessStore.accessCode.trim();
  if (accessStore.enabledAccessControl() && accessCode) {
    headers["Authorization"] = `Bearer ${ACCESS_CODE_PREFIX}${accessCode}`;
  }

  return headers;
}

async function getHeadersWithRouterUcan(url: string) {
  const headers = getBaseRouterHeaders();
  if (!isRouterUrl(url)) return headers;
  if (!isUcanMetaValid()) return headers;

  const audience = getRouterAudience();
  const capabilities = getRouterCapabilities();
  if (!audience || !capabilities.length) return headers;

  const cachedToken = getValidCachedRouterInvocationToken(
    audience,
    capabilities,
  );
  if (cachedToken) {
    headers["Authorization"] = `Bearer ${cachedToken}`;
    return headers;
  }

  try {
    const issuer = await getCachedUcanSession();
    if (!issuer) return headers;
    const ucan = await createInvocationUcan({
      audience,
      capabilities,
      sessionId: UCAN_SESSION_ID,
      issuer,
    });
    const payload = decodeUcanPayload(ucan);
    const key = buildRouterInvocationCacheKey(audience, capabilities);
    if (payload && typeof payload.exp === "number" && key) {
      cachedRouterInvocationToken = {
        key,
        token: ucan,
        exp: payload.exp,
        nbf: payload.nbf,
      };
    }
    headers["Authorization"] = `Bearer ${ucan}`;
  } catch (error) {
    console.warn("[Router Models] failed to create invocation token", error);
  }
  return headers;
}

function resolveProviderNameFromOwnedBy(
  ownedBy: string,
  modelName: string,
  supportedEndpoints: string[],
): ServiceProvider {
  const source = `${ownedBy} ${modelName}`.toLowerCase();
  const hasMessages = supportedEndpoints.includes(
    SupportedTextEndpoint.Messages,
  );
  const hasOpenAIText =
    supportedEndpoints.includes(SupportedTextEndpoint.Responses) ||
    supportedEndpoints.includes(SupportedTextEndpoint.ChatCompletions);

  if (hasMessages && !hasOpenAIText) {
    return ServiceProvider.Anthropic;
  }

  if (source.includes("anthropic") || source.includes("claude")) {
    return ServiceProvider.Anthropic;
  }
  if (
    source.includes("google") ||
    source.includes("gemini") ||
    source.includes("vertex")
  ) {
    return ServiceProvider.Google;
  }
  if (source.includes("deepseek")) {
    return ServiceProvider.DeepSeek;
  }
  if (source.includes("xai") || source.includes("grok")) {
    return ServiceProvider.XAI;
  }
  if (
    source.includes("zhipu") ||
    source.includes("chatglm") ||
    source.includes("bigmodel") ||
    source.includes("glm-")
  ) {
    return ServiceProvider.ChatGLM;
  }
  if (
    source.includes("bytedance") ||
    source.includes("doubao") ||
    source.includes("volc") ||
    source.includes("ark-")
  ) {
    return ServiceProvider.ByteDance;
  }
  if (
    source.includes("alibaba") ||
    source.includes("aliyun") ||
    source.includes("dashscope") ||
    source.includes("qwen")
  ) {
    return ServiceProvider.Alibaba;
  }
  if (source.includes("moonshot") || source.includes("kimi")) {
    return ServiceProvider.Moonshot;
  }
  if (source.includes("tencent") || source.includes("hunyuan")) {
    return ServiceProvider.Tencent;
  }
  if (source.includes("baidu") || source.includes("ernie")) {
    return ServiceProvider.Baidu;
  }
  if (
    source.includes("iflytek") ||
    source.includes("xunfei") ||
    source.includes("spark")
  ) {
    return ServiceProvider.Iflytek;
  }
  if (source.includes("siliconflow")) {
    return ServiceProvider.SiliconFlow;
  }
  if (source.includes("302.ai") || source.includes("302ai")) {
    return ServiceProvider["302.AI"];
  }
  if (hasMessages) {
    return ServiceProvider.Anthropic;
  }
  return ServiceProvider.OpenAI;
}

function providerId(providerName: ServiceProvider): string {
  switch (providerName) {
    case ServiceProvider["302.AI"]:
      return "302ai";
    default:
      return providerName.toLowerCase();
  }
}

function providerSort(providerName: ServiceProvider): number {
  switch (providerName) {
    case ServiceProvider.OpenAI:
      return 1;
    case ServiceProvider.Anthropic:
      return 2;
    case ServiceProvider.Google:
      return 3;
    case ServiceProvider.DeepSeek:
      return 4;
    case ServiceProvider.XAI:
      return 5;
    default:
      return 100;
  }
}

export class RouterApi implements LLMApi {
  async chat(_options: ChatOptions): Promise<void> {
    throw new Error("RouterApi only supports models()");
  }

  async speech(_options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("RouterApi does not support speech()");
  }

  async usage(): Promise<LLMUsage> {
    return {
      used: 0,
      total: 0,
    };
  }

  private path(path: string): string {
    const accessStore = useAccessStore.getState();
    let baseUrl = "";

    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.openaiUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      baseUrl = isApp ? OPENAI_BASE_URL : ApiPath.OpenAI;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.OpenAI)) {
      baseUrl = "https://" + baseUrl;
    }

    return cloudflareAIGatewayUrl([baseUrl, path].join("/"));
  }

  async models(): Promise<LLMModel[]> {
    const listPath = this.path("v1/models");
    const accessStore = useAccessStore.getState();
    const hasAccessCode =
      accessStore.enabledAccessControl() && accessStore.accessCode.trim() !== "";
    const hasApiKey = accessStore.openaiApiKey.trim() !== "";
    const shouldSkipRouterFetch =
      isRouterUrl(listPath) && !isUcanMetaValid() && !hasApiKey && !hasAccessCode;

    if (shouldSkipRouterFetch) {
      console.info("[Router Models] skip fetch before UCAN login");
      return [];
    }

    try {
      const headers = await getHeadersWithRouterUcan(listPath);
      const res = await fetch(listPath, {
        method: "GET",
        headers,
      });

      if (!res.ok) {
        throw new Error(`[Router Models] failed to fetch: ${res.status}`);
      }

      const resJson = (await res.json()) as RouterModelListResponse;
      const list = resJson.data ?? [];
      const seen = new Set<string>();
      const finalList: LLMModel[] = [];
      let seq = 1000;

      for (const item of list) {
        const name = item.id?.trim();
        if (!name) continue;
        const supportedEndpoints = normalizeSupportedEndpoints(
          item.supported_endpoints,
        );
        const providerName = resolveProviderNameFromOwnedBy(
          item.owned_by || "",
          name,
          supportedEndpoints,
        );
        const key = `${name}@${providerName}`;
        if (seen.has(key)) continue;
        seen.add(key);

        finalList.push({
          name,
          displayName: name,
          available: true,
          sorted: seq++,
          ownedBy: (item.owned_by || "").trim() || undefined,
          supportedEndpoints,
          provider: {
            id: providerId(providerName),
            providerName,
            providerType: providerId(providerName),
            sorted: providerSort(providerName),
          },
        });
      }

      return finalList;
    } catch (error) {
      console.warn("[Router Models] failed to fetch", error);
      return [];
    }
  }
}
