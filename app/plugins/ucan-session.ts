import {
  clearUcanSession,
  createUcanSession,
  type Eip1193Provider,
  type UcanSessionKey,
} from "@yeying-community/web3-bs";
import { UCAN_SESSION_ID } from "./ucan";

const SESSION_CACHE_MS = 5 * 60 * 1000;
const SESSION_RENEW_SKEW_MS = 30 * 1000;
const SESSION_MIN_RETRY_MS = 10 * 1000;
const LOCAL_SESSION_DB_NAME = "yeying-web3";
const LOCAL_SESSION_DB_STORE = "ucan-sessions";

type LocalSessionRecord = {
  id?: string;
  did?: string;
  createdAt?: number;
  expiresAt?: number | null;
  source?: string;
  privateKeyJwk?: JsonWebKey;
};

const FORCE_LOCAL_SESSION_PROVIDER = {
  request: async () => {
    throw new Error("force local ucan session");
  },
} as unknown as Eip1193Provider;

let cachedSession: UcanSessionKey | null = null;
let cachedAt = 0;
let sessionPromise: Promise<UcanSessionKey | null> | null = null;
let lastAttemptAt = 0;

function normalizeExpiry(exp: number): number {
  return exp < 1e12 ? exp * 1000 : exp;
}

function isSessionFresh(session: UcanSessionKey | null) {
  if (!session) return false;
  if (!isLocalSessionKey(session)) return false;
  if (typeof session.expiresAt === "number" && session.expiresAt > 0) {
    const expiresAt = normalizeExpiry(session.expiresAt);
    return expiresAt - SESSION_RENEW_SKEW_MS > Date.now();
  }
  return Date.now() - cachedAt < SESSION_CACHE_MS;
}

function isLocalSessionKey(session: UcanSessionKey | null) {
  if (!session) return false;
  if (session.source === "local") return true;
  return Boolean(session.privateKey);
}

function isLocalSessionRecord(
  record: LocalSessionRecord | null,
): record is LocalSessionRecord & { did: string; privateKeyJwk: JsonWebKey } {
  if (!record || typeof record !== "object") return false;
  if (typeof record.did !== "string" || !record.did) return false;
  return Boolean(record.privateKeyJwk);
}

function isLegacyWalletSessionRecord(record: LocalSessionRecord | null) {
  if (!record || typeof record !== "object") return false;
  const source = typeof record.source === "string" ? record.source : "";
  return source === "wallet" || !record.privateKeyJwk;
}

function isSessionExpired(expiresAt: number | null | undefined) {
  if (typeof expiresAt !== "number" || expiresAt <= 0) return false;
  return normalizeExpiry(expiresAt) <= Date.now();
}

async function openLocalSessionDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return null;
  }
  return await new Promise((resolve) => {
    const request = indexedDB.open(LOCAL_SESSION_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_SESSION_DB_STORE)) {
        db.createObjectStore(LOCAL_SESSION_DB_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readLocalSessionRecord(
  id: string,
): Promise<LocalSessionRecord | null> {
  const db = await openLocalSessionDb();
  if (!db) return null;
  return await new Promise((resolve) => {
    const tx = db.transaction(LOCAL_SESSION_DB_STORE, "readonly");
    const store = tx.objectStore(LOCAL_SESSION_DB_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const result = request.result;
      if (!result || typeof result !== "object") {
        resolve(null);
        return;
      }
      resolve(result as LocalSessionRecord);
    };
    request.onerror = () => resolve(null);
  });
}

async function clearLegacyWalletSessionRecord() {
  const record = await readLocalSessionRecord(UCAN_SESSION_ID);
  if (!isLegacyWalletSessionRecord(record)) return false;

  try {
    await clearUcanSession(UCAN_SESSION_ID);
    console.info("[UCAN] cleared legacy wallet session record");
    return true;
  } catch (error) {
    console.warn("[UCAN] failed to clear legacy wallet session record", error);
    return false;
  }
}

async function loadLocalUcanSessionFromRecord(
  id: string,
): Promise<UcanSessionKey | null> {
  const record = await readLocalSessionRecord(id);
  if (!isLocalSessionRecord(record)) return null;

  const normalizedExpiresAt =
    typeof record.expiresAt === "number" ? normalizeExpiry(record.expiresAt) : null;
  if (isSessionExpired(normalizedExpiresAt)) {
    return null;
  }
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return null;
  }

  try {
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      record.privateKeyJwk,
      "Ed25519",
      true,
      ["sign"],
    );
    return {
      id: record.id || id,
      did: record.did,
      createdAt:
        typeof record.createdAt === "number" ? record.createdAt : Date.now(),
      expiresAt: normalizedExpiresAt,
      source: "local",
      privateKey,
    };
  } catch {
    return null;
  }
}

async function loadStoredUcanSession(): Promise<UcanSessionKey | null> {
  try {
    const session = await loadLocalUcanSessionFromRecord(UCAN_SESSION_ID);
    if (!session) return null;
    cachedSession = session;
    cachedAt = Date.now();
    return session;
  } catch (error) {
    console.warn("❌读取本地 UCAN session 失败:", error);
    return null;
  }
}

async function loadOrCreateLocalUcanSession(
  options?: { forceNew?: boolean },
): Promise<UcanSessionKey | null> {
  const clearedLegacy = await clearLegacyWalletSessionRecord();
  const forceNew = Boolean(options?.forceNew || clearedLegacy);
  if (!forceNew) {
    const localSession = await loadStoredUcanSession();
    if (localSession) {
      return localSession;
    }
  }

  const session = await createUcanSession({
    id: UCAN_SESSION_ID,
    forceNew,
    // Ensure request paths never trigger wallet RPC implicitly.
    // Throwing request() makes SDK fallback to local Ed25519 session.
    provider: FORCE_LOCAL_SESSION_PROVIDER,
  });

  if (isLocalSessionKey(session)) {
    cachedSession = session;
    cachedAt = Date.now();
    return session;
  }

  return await loadLocalUcanSessionFromRecord(UCAN_SESSION_ID);
}

export async function ensureLocalUcanSession(
  options?: { forceNew?: boolean },
): Promise<UcanSessionKey | null> {
  if (!options?.forceNew && isSessionFresh(cachedSession)) {
    return cachedSession;
  }

  const storedSession = await loadStoredUcanSession();
  if (!options?.forceNew && isSessionFresh(storedSession)) {
    return storedSession;
  }

  if (sessionPromise) {
    return await sessionPromise;
  }
  if (!options?.forceNew && Date.now() - lastAttemptAt < SESSION_MIN_RETRY_MS) {
    return cachedSession;
  }

  lastAttemptAt = Date.now();
  sessionPromise = loadOrCreateLocalUcanSession(options)
    .then((session) => {
      cachedSession = session;
      cachedAt = Date.now();
      lastAttemptAt = cachedAt;
      return session;
    })
    .catch((error) => {
      console.warn("❌创建本地 UCAN session 失败:", error);
      cachedSession = null;
      cachedAt = Date.now();
      return null;
    })
    .finally(() => {
      sessionPromise = null;
    });

  return await sessionPromise;
}

export async function getCachedUcanSession(
  _provider?: Eip1193Provider,
  options?: { refresh?: boolean },
): Promise<UcanSessionKey | null> {
  if (isSessionFresh(cachedSession)) {
    return cachedSession;
  }

  const storedSession = await loadStoredUcanSession();
  if (isSessionFresh(storedSession)) {
    return storedSession;
  }

  const shouldRefresh = options?.refresh ?? Boolean(_provider);
  if (!shouldRefresh) {
    return null;
  }

  // Keep old provider signature for compatibility, but refresh path now
  // always materializes local session to avoid wallet RPC in background tabs.
  return await ensureLocalUcanSession();
}

export function clearCachedUcanSession() {
  cachedSession = null;
  cachedAt = 0;
  sessionPromise = null;
  lastAttemptAt = 0;
}

export async function refreshUcanSession(
  _provider?: Eip1193Provider,
): Promise<UcanSessionKey | null> {
  clearCachedUcanSession();
  return await ensureLocalUcanSession();
}
