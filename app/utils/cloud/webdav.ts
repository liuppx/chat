import { STORAGE_KEY } from "@/app/constant";
import { getClientConfig } from "@/app/config/client";
import {
  getWebdavAudience,
  getWebdavAppAction,
  getWebdavAppId,
  getWebdavCapabilities,
  getUcanCapsKey,
  getUcanRootCapsKey,
  UCAN_SESSION_ID,
} from "@/app/plugins/ucan";
import { SyncStore } from "@/app/store/sync";
import {
  getStoredUcanRoot,
  initWebDavStorage,
} from "@yeying-community/web3-bs";
import { getCachedUcanSession } from "@/app/plugins/ucan-session";
import { invalidateUcanAuthorization } from "@/app/plugins/wallet";
import { isCentralModeEnabled } from "@/app/plugins/central-ucan";
import {
  acquireUcanSignLock,
  isUcanSignPending,
  isUcanSignPendingError,
  refreshUcanSignLock,
  releaseUcanSignLock,
} from "@/app/plugins/ucan-sign-lock";

export type WebDAVConfig = SyncStore["webdav"];
export type WebDavClient = ReturnType<typeof createWebDavClient>;

const DEFAULT_FOLDER = STORAGE_KEY;
const BACKUP_FILENAME = "backup.json";
const MEDIA_FOLDER = `${DEFAULT_FOLDER}/media`;
const WEBDAV_PROXY_PREFIX = "/api/webdav";
const DEFAULT_STATE_KEY = BACKUP_FILENAME.replace(/\.json$/i, "");
const LOCK_DIR_SUFFIX = ".__sync_lock_v1";
const LOCK_META_FILENAME = "lock.json";
const ensuredAppDirs = new Set<string>();
const ensuredBasicMediaDirs = new Set<string>();
const INVOCATION_TOKEN_SKEW_MS = 5 * 1000;

type UcanPayload = {
  exp?: number;
  nbf?: number;
};

type CachedUcanWebDavClient = {
  key: string;
  client: Awaited<ReturnType<typeof initWebDavStorage>>["client"];
  filePath: string;
  mediaDir: string;
  exp: number;
  nbf?: number;
};

type SyncLockMeta = {
  owner: string;
  expiresAt: number;
};

let cachedUcanWebDavClient: CachedUcanWebDavClient | null = null;

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

function decodeUcanPayload(token: string): UcanPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded) as UcanPayload;
  } catch {
    return null;
  }
}

function buildUcanWebdavCacheKey(params: {
  backendUrl: string;
  webdavPrefix: string;
  useProxy: boolean;
  audience: string;
  appId: string;
  appAction: string;
  invocationCapsKey: string;
  rootIss: string;
  rootExp: number;
}) {
  return [
    params.backendUrl,
    params.webdavPrefix,
    params.useProxy ? "proxy" : "direct",
    params.audience,
    params.appId,
    params.appAction,
    params.invocationCapsKey,
    params.rootIss,
    params.rootExp,
  ].join("|");
}

function getValidCachedUcanWebdavClient(cacheKey: string) {
  const cached = cachedUcanWebDavClient;
  if (!cached || cached.key !== cacheKey) return null;
  const now = Date.now();
  if (cached.nbf && now < cached.nbf) return null;
  if (cached.exp <= now + INVOCATION_TOKEN_SKEW_MS) return null;
  return {
    client: cached.client,
    filePath: cached.filePath,
    mediaDir: cached.mediaDir,
  };
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function splitBaseUrlAndPrefix(raw: string): {
  baseUrl: string;
  prefix: string;
} {
  try {
    const url = new URL(raw);
    const baseUrl = `${url.protocol}//${url.host}`;
    const pathname = url.pathname.replace(/\/+$/, "");
    return { baseUrl, prefix: pathname === "/" ? "" : pathname };
  } catch {
    return { baseUrl: normalizeBaseUrl(raw), prefix: "" };
  }
}

function normalizePrefix(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "/") return "";
  let next = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  next = next.replace(/\/+$/, "");
  return next === "/" ? "" : next;
}

function joinBasePrefix(baseUrl: string, prefix: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const normalizedPrefix = normalizePrefix(prefix);
  if (!normalizedPrefix) return base;
  return `${base}${normalizedPrefix}`;
}

function getEnvWebdavBaseUrl(): string {
  return getClientConfig()?.webdavBackendBaseUrl?.trim() || "";
}

function getEnvWebdavPrefix(): string {
  return getClientConfig()?.webdavBackendPrefix?.trim() || "";
}

function resolveWebdavBaseUrl(store: SyncStore, fallbackBaseUrl = ""): string {
  const config = store.webdav;
  if (config.baseUrl.trim()) {
    return splitBaseUrlAndPrefix(config.baseUrl).baseUrl;
  }
  if (fallbackBaseUrl.trim()) return normalizeBaseUrl(fallbackBaseUrl);
  const endpoint = config.endpoint?.trim();
  if (!endpoint) return "";
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}`;
  } catch {
    return endpoint;
  }
}

function resolveWebdavPrefix(
  store: SyncStore,
  fallbackPrefix = "",
  fallbackBaseUrl = "",
): string {
  const config = store.webdav;
  const storePrefix = config.prefix.trim();
  const storeBase = config.baseUrl.trim();
  if (storeBase) {
    if (storePrefix) return normalizePrefix(storePrefix);
    return splitBaseUrlAndPrefix(storeBase).prefix;
  }
  if (fallbackBaseUrl.trim()) {
    return normalizePrefix(storePrefix || fallbackPrefix);
  }
  if (storePrefix) return normalizePrefix(storePrefix);
  const endpoint = config.endpoint?.trim();
  if (!endpoint) return "";
  try {
    const url = new URL(endpoint);
    const pathname = url.pathname.replace(/\/+$/, "");
    return pathname === "/" ? "" : pathname;
  } catch {
    return "";
  }
}

function normalizeSyncStateKey(key?: string) {
  const normalized = (key || "").trim();
  const safe = (normalized || DEFAULT_STATE_KEY).replaceAll("/", "_");
  return safe || DEFAULT_STATE_KEY;
}

function resolveBasicStateFilePath(key: string) {
  const fileName = `${normalizeSyncStateKey(key)}.json`;
  return `${DEFAULT_FOLDER}/${fileName}`;
}

function resolveUcanStateFilePath(defaultFilePath: string, key: string) {
  const fileName = `${normalizeSyncStateKey(key)}.json`;
  const index = defaultFilePath.lastIndexOf("/");
  const dir = index >= 0 ? defaultFilePath.slice(0, index) : "";
  return `${dir}/${fileName}`;
}

function resolveBasicLockDirPath(key: string) {
  const lockDir = `${normalizeSyncStateKey(key)}${LOCK_DIR_SUFFIX}`;
  return `${DEFAULT_FOLDER}/${lockDir}`;
}

function resolveBasicLockMetaPath(key: string) {
  return `${resolveBasicLockDirPath(key)}/${LOCK_META_FILENAME}`;
}

function resolveUcanLockDirPath(defaultFilePath: string, key: string) {
  const lockDir = `${normalizeSyncStateKey(key)}${LOCK_DIR_SUFFIX}`;
  const index = defaultFilePath.lastIndexOf("/");
  const dir = index >= 0 ? defaultFilePath.slice(0, index) : "";
  return `${dir}/${lockDir}`;
}

function resolveUcanLockMetaPath(defaultFilePath: string, key: string) {
  return `${resolveUcanLockDirPath(defaultFilePath, key)}/${LOCK_META_FILENAME}`;
}

function createLockMeta(owner: string, ttlMs: number): SyncLockMeta {
  return {
    owner,
    expiresAt: Date.now() + Math.max(1000, Math.floor(ttlMs)),
  };
}

function parseLockMeta(raw: string): SyncLockMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SyncLockMeta;
    if (
      typeof parsed.owner === "string" &&
      parsed.owner.length > 0 &&
      Number.isFinite(parsed.expiresAt)
    ) {
      return parsed;
    }
  } catch {
    // ignore invalid lock metadata
  }
  return null;
}

function createBasicWebDavClient(store: SyncStore) {
  const config = store.webdav;
  const proxyUrl =
    store.useProxy && store.proxyUrl.length > 0 ? store.proxyUrl : "";
  const envBaseUrl = getEnvWebdavBaseUrl();
  const envPrefix = getEnvWebdavPrefix();
  const baseUrl = resolveWebdavBaseUrl(store, envBaseUrl);
  const prefix = resolveWebdavPrefix(store, envPrefix, envBaseUrl);
  const endpoint = joinBasePrefix(baseUrl, prefix);

  return {
    async check() {
      try {
        const res = await fetch(
          this.path(DEFAULT_FOLDER, proxyUrl, "MKCOL", endpoint),
          {
            method: "GET",
            headers: this.headers(),
          },
        );
        const success = [201, 200, 404, 405, 301, 302, 307, 308].includes(
          res.status,
        );
        console.log(
          `[WebDav] check ${success ? "success" : "failed"}, ${res.status} ${
            res.statusText
          }`,
        );
        return success;
      } catch (e) {
        console.error("[WebDav] failed to check", e);
      }

      return false;
    },

    async get(key: string) {
      const statePath = resolveBasicStateFilePath(key);
      const res = await fetch(this.path(statePath, proxyUrl, "", endpoint), {
        method: "GET",
        headers: this.headers(),
      });

      console.log("[WebDav] get key = ", key, res.status, res.statusText);

      if (404 == res.status) {
        return "";
      }

      return await res.text();
    },

    async set(key: string, value: string) {
      const statePath = resolveBasicStateFilePath(key);
      const res = await fetch(this.path(statePath, proxyUrl, "", endpoint), {
        method: "PUT",
        headers: this.headers(),
        body: value,
      });

      console.log("[WebDav] set key = ", key, res.status, res.statusText);
    },

    async del(key: string) {
      const statePath = resolveBasicStateFilePath(key);
      const httpMethod = store.useProxy ? "GET" : "DELETE";
      const proxyMethod = store.useProxy ? "DELETE" : "";
      const res = await fetch(
        this.path(statePath, proxyUrl, proxyMethod, endpoint),
        {
          method: httpMethod,
          headers: this.headers(),
        },
      );
      if (![200, 204, 404].includes(res.status)) {
        throw new Error(
          `WebDav del key failed (${key}): ${res.status} ${res.statusText}`,
        );
      }
    },

    async requestLockPath(
      targetPath: string,
      method: "GET" | "PUT" | "MKCOL" | "DELETE",
      body?: string,
    ) {
      const httpMethod = store.useProxy
        ? method === "PUT"
          ? "PUT"
          : "GET"
        : method;
      const proxyMethod = store.useProxy ? method : "";
      const headers: Record<string, string> = this.headers();
      if (body !== undefined) {
        headers["content-type"] = "application/json";
      }
      return await fetch(
        this.path(targetPath, proxyUrl, proxyMethod, endpoint),
        {
          method: httpMethod,
          headers,
          body: body ?? null,
        },
      );
    },

    async readLockMeta(lockMetaPath: string) {
      const res = await this.requestLockPath(lockMetaPath, "GET");
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return parseLockMeta(await res.text());
    },

    async writeLockMeta(lockMetaPath: string, owner: string, ttlMs: number) {
      const payload = JSON.stringify(createLockMeta(owner, ttlMs));
      const res = await this.requestLockPath(lockMetaPath, "PUT", payload);
      if (![200, 201, 204].includes(res.status)) {
        throw new Error(
          `WebDav write lock metadata failed: ${res.status} ${res.statusText}`,
        );
      }
    },

    async deleteLockPath(targetPath: string) {
      const res = await this.requestLockPath(targetPath, "DELETE");
      if ([200, 204, 404].includes(res.status)) return;
      throw new Error(`WebDav DELETE ${targetPath} failed: ${res.status}`);
    },

    async acquireLock(key: string, owner: string, ttlMs: number) {
      const lockDirPath = resolveBasicLockDirPath(key);
      const lockMetaPath = resolveBasicLockMetaPath(key);
      const createRes = await this.requestLockPath(lockDirPath, "MKCOL");
      if (createRes.status === 201) {
        await this.writeLockMeta(lockMetaPath, owner, ttlMs);
        return true;
      }

      if (![405, 409].includes(createRes.status)) {
        throw new Error(
          `WebDav acquire lock failed: ${createRes.status} ${createRes.statusText}`,
        );
      }

      const currentMeta = await this.readLockMeta(lockMetaPath);
      const now = Date.now();
      if (!currentMeta) return false;

      if (currentMeta.owner === owner) {
        await this.writeLockMeta(lockMetaPath, owner, ttlMs);
        return true;
      }

      if (currentMeta.expiresAt > now) {
        return false;
      }

      try {
        await this.deleteLockPath(lockMetaPath);
      } catch (error) {
        console.warn("[WebDav] failed to cleanup stale lock metadata", error);
      }
      try {
        await this.deleteLockPath(lockDirPath);
      } catch (error) {
        console.warn("[WebDav] failed to cleanup stale lock dir", error);
      }
      return false;
    },

    async releaseLock(key: string, owner: string) {
      const lockDirPath = resolveBasicLockDirPath(key);
      const lockMetaPath = resolveBasicLockMetaPath(key);
      const currentMeta = await this.readLockMeta(lockMetaPath);
      const now = Date.now();
      if (
        currentMeta &&
        currentMeta.owner !== owner &&
        currentMeta.expiresAt > now
      ) {
        return;
      }
      try {
        await this.deleteLockPath(lockMetaPath);
      } catch (error) {
        console.warn("[WebDav] failed to remove lock metadata", error);
      }
      try {
        await this.deleteLockPath(lockDirPath);
      } catch (error) {
        console.warn("[WebDav] failed to remove lock dir", error);
      }
    },

    async ensureMediaDir() {
      const cacheKey = `${store.useProxy ? "proxy" : "direct"}|${endpoint}`;
      if (ensuredBasicMediaDirs.has(cacheKey)) return;

      const res = await fetch(
        this.path(MEDIA_FOLDER, proxyUrl, "MKCOL", endpoint),
        {
          method: store.useProxy ? "GET" : "MKCOL",
          headers: this.headers(),
        },
      );
      if (![201, 405, 409].includes(res.status)) {
        throw new Error(`WebDav MKCOL ${MEDIA_FOLDER} failed: ${res.status}`);
      }
      ensuredBasicMediaDirs.add(cacheKey);
    },

    async uploadMedia(mediaKey: string, blob: Blob, contentType?: string) {
      const path = `${MEDIA_FOLDER}/${mediaKey}`;
      const headers: Record<string, string> = this.headers();
      if (contentType) {
        headers["content-type"] = contentType;
      }
      let res = await fetch(this.path(path, proxyUrl, "", endpoint), {
        method: "PUT",
        headers,
        body: blob,
      });
      if ([404, 409].includes(res.status)) {
        await this.ensureMediaDir();
        res = await fetch(this.path(path, proxyUrl, "", endpoint), {
          method: "PUT",
          headers,
          body: blob,
        });
      }
      if (![200, 201, 204].includes(res.status)) {
        throw new Error(`WebDav upload media failed: ${res.status}`);
      }
    },

    async downloadMedia(mediaKey: string) {
      const path = `${MEDIA_FOLDER}/${mediaKey}`;
      const res = await fetch(this.path(path, proxyUrl, "", endpoint), {
        method: "GET",
        headers: this.headers(),
      });
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        throw new Error(`WebDav download media failed: ${res.status}`);
      }
      return await res.blob();
    },

    headers() {
      const auth = btoa(config.username + ":" + config.password);

      return {
        authorization: `Basic ${auth}`,
      };
    },
    path(
      path: string,
      proxyUrl: string = "",
      proxyMethod: string = "",
      endpointUrl: string = "",
    ) {
      if (path.startsWith("/")) {
        path = path.slice(1);
      }

      if (proxyUrl.endsWith("/")) {
        proxyUrl = proxyUrl.slice(0, -1);
      }

      const resolvedEndpoint = endpointUrl || endpoint;

      let url;
      const pathPrefix = `${WEBDAV_PROXY_PREFIX}/`;

      try {
        if (!store.useProxy && resolvedEndpoint) {
          const direct = joinBasePrefix(resolvedEndpoint, "");
          url = `${direct}/${path}`;
        } else {
          let u = new URL(proxyUrl + pathPrefix + path);
          // add query params
          u.searchParams.append("endpoint", resolvedEndpoint);
          proxyMethod && u.searchParams.append("proxy_method", proxyMethod);
          url = u.toString();
        }
      } catch (e) {
        if (!store.useProxy && resolvedEndpoint) {
          url = `${resolvedEndpoint.replace(/\/+$/, "")}/${path}`;
        } else {
          url = pathPrefix + path + "?endpoint=" + resolvedEndpoint;
          if (proxyMethod) {
            url += "&proxy_method=" + proxyMethod;
          }
        }
      }

      return url;
    },
  };
}

function createWebdavProxyFetcher(endpoint: string) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const origin =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin && window.location.origin !== "null"
          ? window.location.origin
          : window.location.href;
    const raw = typeof input === "string" ? input : input.toString();
    const url = new URL(raw, origin);
    if (url.pathname.startsWith(WEBDAV_PROXY_PREFIX)) {
      url.searchParams.set("endpoint", endpoint);
    }
    return fetch(url.toString(), init);
  };
}

async function getUcanWebDavClient(store: SyncStore) {
  if (isCentralModeEnabled()) {
    throw new Error("中心化 UCAN 模式暂不支持 WebDAV 同步");
  }
  const envBaseUrl = getEnvWebdavBaseUrl();
  const envPrefix = getEnvWebdavPrefix();
  console.log("[WebDav UCAN] config", {
    useProxy: store.useProxy,
    backendBaseUrl: envBaseUrl,
    backendPrefix: envPrefix,
    authType: store.webdav.authType,
  });
  const backendUrl = resolveWebdavBaseUrl(store, envBaseUrl);
  if (!backendUrl) {
    throw new Error("WEBDAV_BACKEND_BASE_URL is not configured");
  }
  const webdavPrefix = resolveWebdavPrefix(store, envPrefix, envBaseUrl);
  const audience = getWebdavAudience(backendUrl);
  if (!audience) {
    throw new Error("WebDAV UCAN audience is not configured");
  }
  const useProxy = store.useProxy;
  const endpoint = joinBasePrefix(backendUrl, webdavPrefix);
  const baseUrl = useProxy ? "" : backendUrl;
  const prefix = useProxy ? WEBDAV_PROXY_PREFIX : webdavPrefix;
  const fetcher = useProxy ? createWebdavProxyFetcher(endpoint) : undefined;
  const root = await getStoredUcanRoot(UCAN_SESSION_ID);
  if (!root) {
    await invalidateUcanAuthorization("UCAN root is not ready");
    throw new Error("UCAN root is not ready");
  }
  if (getUcanCapsKey(root.cap) !== getUcanRootCapsKey()) {
    await invalidateUcanAuthorization("UCAN root capability mismatch");
    throw new Error("UCAN root capability mismatch");
  }
  if (typeof root.exp === "number" && root.exp <= Date.now()) {
    await invalidateUcanAuthorization("UCAN root expired");
    throw new Error("UCAN root expired");
  }
  const appId = getWebdavAppId();
  const appAction = getWebdavAppAction();
  const invocationCaps = getWebdavCapabilities();
  const cacheKey = buildUcanWebdavCacheKey({
    backendUrl,
    webdavPrefix,
    useProxy,
    audience,
    appId,
    appAction,
    invocationCapsKey: getUcanCapsKey(invocationCaps),
    rootIss: root.iss || "",
    rootExp: root.exp || 0,
  });
  const cached = getValidCachedUcanWebdavClient(cacheKey);
  if (cached) {
    return cached;
  }
  const session = await getCachedUcanSession();
  if (!session) {
    await invalidateUcanAuthorization("UCAN session is not available");
    throw new Error("UCAN session is not available");
  }
  if (root.aud && root.aud !== session.did) {
    await invalidateUcanAuthorization("UCAN root audience mismatch");
    throw new Error("UCAN root audience mismatch");
  }

  if (isUcanSignPending()) {
    throw new Error("UCAN sign pending");
  }

  if (!acquireUcanSignLock()) {
    throw new Error("UCAN sign pending");
  }

  let webdav: Awaited<ReturnType<typeof initWebDavStorage>>;
  try {
    webdav = await initWebDavStorage({
      baseUrl,
      prefix,
      audience,
      appId,
      appAction,
      capabilities: root.cap,
      invocationCapabilities: invocationCaps,
      sessionId: UCAN_SESSION_ID,
      session,
      root,
      fetcher,
      ensureAppDir: false,
    });
    releaseUcanSignLock();
  } catch (error) {
    if (isUcanSignPendingError(error)) {
      refreshUcanSignLock();
    } else {
      releaseUcanSignLock();
    }
    throw error;
  }

  const appDir = webdav.appDir?.replace(/\/+$/, "") || "";
  const filePath = `${appDir || ""}/${BACKUP_FILENAME}`;
  const mediaDir = `${appDir || DEFAULT_FOLDER}/media`;

  if (appDir) {
    const key = `${baseUrl}|${prefix}|${appDir}`;
    if (!ensuredAppDirs.has(key)) {
      try {
        const res = await webdav.client.createDirectory(appDir);
        if (![201, 405, 409].includes(res.status)) {
          throw new Error(`WebDAV MKCOL ${appDir} failed: ${res.status}`);
        }
        ensuredAppDirs.add(key);
      } catch (error) {
        console.error("[WebDav UCAN] ensure app dir failed", error);
      }
    }
  }

  const mediaDirKey = `${baseUrl}|${prefix}|${mediaDir}`;
  if (!ensuredAppDirs.has(mediaDirKey)) {
    try {
      const res = await webdav.client.createDirectory(mediaDir);
      if (![201, 405, 409].includes(res.status)) {
        throw new Error(`WebDAV MKCOL ${mediaDir} failed: ${res.status}`);
      }
      ensuredAppDirs.add(mediaDirKey);
    } catch (error) {
      console.error("[WebDav UCAN] ensure media dir failed", error);
    }
  }

  const payload = decodeUcanPayload(webdav.token);
  if (payload && typeof payload.exp === "number") {
    cachedUcanWebDavClient = {
      key: cacheKey,
      client: webdav.client,
      filePath,
      mediaDir,
      exp: payload.exp,
      nbf: payload.nbf,
    };
  }

  return { client: webdav.client, filePath, mediaDir };
}

function createUcanWebDavClient(store: SyncStore) {
  return {
    async check() {
      try {
        const { client } = await getUcanWebDavClient(store);
        await client.getQuota();
        return true;
      } catch (e) {
        console.error("[WebDav UCAN] failed to check", e);
      }
      return false;
    },

    async get(key: string) {
      const { client, filePath } = await getUcanWebDavClient(store);
      const statePath = resolveUcanStateFilePath(filePath, key);
      try {
        return await client.downloadText(statePath);
      } catch (e) {
        if (String(e).includes("404")) {
          return "";
        }
        throw e;
      }
    },

    async set(key: string, value: string) {
      const { client, filePath } = await getUcanWebDavClient(store);
      const statePath = resolveUcanStateFilePath(filePath, key);
      await client.upload(statePath, value, "application/json");
    },

    async del(key: string) {
      const { client, filePath } = await getUcanWebDavClient(store);
      const statePath = resolveUcanStateFilePath(filePath, key);
      try {
        await client.remove(statePath);
      } catch (error) {
        if (String(error).includes("404")) return;
        throw error;
      }
    },

    async readLockMeta(lockMetaPath: string) {
      const { client } = await getUcanWebDavClient(store);
      try {
        const raw = await client.downloadText(lockMetaPath);
        return parseLockMeta(raw);
      } catch (error) {
        if (String(error).includes("404")) {
          return null;
        }
        throw error;
      }
    },

    async writeLockMeta(
      lockMetaPath: string,
      owner: string,
      ttlMs: number,
    ) {
      const { client } = await getUcanWebDavClient(store);
      const payload = JSON.stringify(createLockMeta(owner, ttlMs));
      await client.upload(lockMetaPath, payload, "application/json");
    },

    async removeLockPath(targetPath: string) {
      const { client } = await getUcanWebDavClient(store);
      try {
        await client.remove(targetPath);
      } catch (error) {
        if (String(error).includes("404")) return;
        throw error;
      }
    },

    async acquireLock(key: string, owner: string, ttlMs: number) {
      const { client, filePath } = await getUcanWebDavClient(store);
      const lockDirPath = resolveUcanLockDirPath(filePath, key);
      const lockMetaPath = resolveUcanLockMetaPath(filePath, key);
      try {
        const res = await client.createDirectory(lockDirPath);
        if (![200, 201, 204].includes(res.status)) {
          throw new Error(
            `WebDAV MKCOL ${lockDirPath} failed: ${res.status} ${res.statusText}`,
          );
        }
        await this.writeLockMeta(lockMetaPath, owner, ttlMs);
        return true;
      } catch (error) {
        const errorText = String(error);
        if (!errorText.includes("405") && !errorText.includes("409")) {
          throw error;
        }
        const currentMeta = await this.readLockMeta(lockMetaPath);
        const now = Date.now();
        if (!currentMeta) return false;

        if (currentMeta.owner === owner) {
          await this.writeLockMeta(lockMetaPath, owner, ttlMs);
          return true;
        }

        if (currentMeta.expiresAt > now) return false;

        try {
          await this.removeLockPath(lockMetaPath);
        } catch (cleanupError) {
          console.warn(
            "[WebDav UCAN] failed to cleanup stale lock metadata",
            cleanupError,
          );
        }
        try {
          await this.removeLockPath(lockDirPath);
        } catch (cleanupError) {
          console.warn(
            "[WebDav UCAN] failed to cleanup stale lock dir",
            cleanupError,
          );
        }
        return false;
      }
    },

    async releaseLock(key: string, owner: string) {
      const { filePath } = await getUcanWebDavClient(store);
      const lockDirPath = resolveUcanLockDirPath(filePath, key);
      const lockMetaPath = resolveUcanLockMetaPath(filePath, key);
      const currentMeta = await this.readLockMeta(lockMetaPath);
      const now = Date.now();
      if (
        currentMeta &&
        currentMeta.owner !== owner &&
        currentMeta.expiresAt > now
      ) {
        return;
      }
      try {
        await this.removeLockPath(lockMetaPath);
      } catch (error) {
        console.warn("[WebDav UCAN] failed to remove lock metadata", error);
      }
      try {
        await this.removeLockPath(lockDirPath);
      } catch (error) {
        console.warn("[WebDav UCAN] failed to remove lock dir", error);
      }
    },

    async uploadMedia(mediaKey: string, blob: Blob, contentType?: string) {
      const { client, mediaDir } = await getUcanWebDavClient(store);
      const mediaPath = `${mediaDir}/${mediaKey}`;
      await client.upload(
        mediaPath,
        blob,
        contentType || "application/octet-stream",
      );
    },

    async downloadMedia(mediaKey: string) {
      const { client, mediaDir } = await getUcanWebDavClient(store);
      const mediaPath = `${mediaDir}/${mediaKey}`;
      try {
        const res = await client.download(mediaPath);
        if (res.status === 404) {
          return null;
        }
        if (!res.ok) {
          throw new Error(`WebDAV download media failed: ${res.status}`);
        }
        return await res.blob();
      } catch (e) {
        if (String(e).includes("404")) {
          return null;
        }
        throw e;
      }
    },
  };
}

export function createWebDavClient(store: SyncStore) {
  if (store.webdav.authType === "ucan") {
    return createUcanWebDavClient(store);
  }
  return createBasicWebDavClient(store);
}
