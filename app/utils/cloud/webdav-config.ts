type WebDavAddressConfig = {
  authType: "basic" | "ucan";
  baseUrl: string;
  prefix: string;
  endpoint?: string;
};

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function normalizePrefix(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "/") return "";
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = prefixed.replace(/\/+$/, "");
  return normalized === "/" ? "" : normalized;
}

function splitBaseUrlAndPrefix(raw: string): {
  baseUrl: string;
  prefix: string;
} {
  try {
    const url = new URL(raw);
    const pathname = url.pathname.replace(/\/+$/, "");
    return {
      baseUrl: `${url.protocol}//${url.host}`,
      prefix: pathname === "/" ? "" : pathname,
    };
  } catch {
    return { baseUrl: normalizeBaseUrl(raw), prefix: "" };
  }
}

export function resolveEffectiveWebdavAddress(
  config: WebDavAddressConfig,
  runtimeBaseUrl = "",
  runtimePrefix = "",
): { baseUrl: string; prefix: string } {
  const configuredBaseUrl = config.baseUrl.trim();
  const configuredPrefix = config.prefix.trim();
  const fallbackBaseUrl = runtimeBaseUrl.trim();

  if (config.authType === "ucan" && fallbackBaseUrl) {
    const runtime = splitBaseUrlAndPrefix(fallbackBaseUrl);
    return {
      baseUrl: runtime.baseUrl,
      prefix: normalizePrefix(runtimePrefix || runtime.prefix),
    };
  }

  if (configuredBaseUrl) {
    const configured = splitBaseUrlAndPrefix(configuredBaseUrl);
    return {
      baseUrl: configured.baseUrl,
      prefix: normalizePrefix(configuredPrefix || configured.prefix),
    };
  }

  if (fallbackBaseUrl) {
    const runtime = splitBaseUrlAndPrefix(fallbackBaseUrl);
    return {
      baseUrl: runtime.baseUrl,
      prefix: normalizePrefix(
        configuredPrefix || runtimePrefix || runtime.prefix,
      ),
    };
  }

  const endpoint = config.endpoint?.trim() || "";
  if (!endpoint) {
    return {
      baseUrl: "",
      prefix: normalizePrefix(configuredPrefix),
    };
  }

  const legacy = splitBaseUrlAndPrefix(endpoint);
  return {
    baseUrl: legacy.baseUrl,
    prefix: normalizePrefix(configuredPrefix || legacy.prefix),
  };
}
