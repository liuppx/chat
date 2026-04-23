import { STORAGE_KEY } from "@/app/constant";
import { type SyncClient, ProviderType } from ".";

const SYNC_TXN_VERSION = 1;
const DEFAULT_STATE_KEY = "backup";
const SYNC_LOCK_KEY_SUFFIX = "__sync_mutex_v1";
const SYNC_LOCK_TTL_MS = 150 * 1000;
const SYNC_LOCK_WAIT_TIMEOUT_MS = 180 * 1000;
const SYNC_LOCK_RETRY_BASE_MS = 300;

type TxnKeyLayout = {
  name: "safe";
  buildHeadKey: (baseKey: string) => string;
  buildHeadBackupKey: (baseKey: string) => string;
  buildDataKey: (baseKey: string, txId: string) => string;
};

const TXN_LAYOUT: TxnKeyLayout = {
  name: "safe",
  buildHeadKey: (baseKey) => `${baseKey}.__sync_txn_head_v1`,
  buildHeadBackupKey: (baseKey) => `${baseKey}.__sync_txn_head_v1_bak`,
  buildDataKey: (baseKey, txId) => `${baseKey}.__sync_txn_data_v1.${txId}`,
};

type SyncTxnHead = {
  version: number;
  txId: string;
  payloadHash: string;
  payloadBytes: number;
  committedAt: number;
  prevTxId?: string;
};

type SyncTxnEnvelope = {
  version: number;
  txId: string;
  payload: string;
  payloadHash: string;
  payloadBytes: number;
  createdAt: number;
};

type SyncTxnHeadRef = {
  head: SyncTxnHead;
};

function normalizeStateKey(key?: string) {
  const trimmed = (key || "").trim();
  return trimmed || DEFAULT_STATE_KEY;
}

function isSyncTxnHead(value: unknown): value is SyncTxnHead {
  if (!value || typeof value !== "object") return false;
  const head = value as SyncTxnHead;
  return (
    Number(head.version) === SYNC_TXN_VERSION &&
    typeof head.txId === "string" &&
    head.txId.length > 0 &&
    typeof head.payloadHash === "string" &&
    head.payloadHash.length > 0 &&
    Number.isFinite(head.payloadBytes) &&
    Number.isFinite(head.committedAt) &&
    (head.prevTxId === undefined ||
      (typeof head.prevTxId === "string" && head.prevTxId.length > 0))
  );
}

function isSyncTxnEnvelope(value: unknown): value is SyncTxnEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as SyncTxnEnvelope;
  return (
    Number(envelope.version) === SYNC_TXN_VERSION &&
    typeof envelope.txId === "string" &&
    envelope.txId.length > 0 &&
    typeof envelope.payload === "string" &&
    typeof envelope.payloadHash === "string" &&
    envelope.payloadHash.length > 0 &&
    Number.isFinite(envelope.payloadBytes) &&
    Number.isFinite(envelope.createdAt)
  );
}

function safeJsonParse<T>(raw: string): T | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function utf8BytesLength(value: string) {
  return new TextEncoder().encode(value).length;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  if (typeof crypto === "undefined" || !crypto.subtle) {
    let checksum = 0;
    for (const byte of bytes) {
      checksum = ((checksum << 5) - checksum + byte) | 0;
    }
    return `fallback-${bytes.length}-${checksum >>> 0}`;
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createTxId() {
  const timestamp = Date.now();
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    return `${timestamp}-${random[0].toString(16)}`;
  }
  return `${timestamp}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildSyncLockKey(baseKey: string) {
  return `${baseKey}.${SYNC_LOCK_KEY_SUFFIX}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function loadLatestTxnHead(
  client: SyncClient,
  baseKey: string,
): Promise<SyncTxnHeadRef[]> {
  const [primaryRaw, backupRaw] = await Promise.all([
    client.get(TXN_LAYOUT.buildHeadKey(baseKey)),
    client.get(TXN_LAYOUT.buildHeadBackupKey(baseKey)),
  ]);
  const refs = [primaryRaw, backupRaw]
    .map((raw) => safeJsonParse<SyncTxnHead>(raw))
    .filter(isSyncTxnHead)
    .map((head) => ({ head }));

  const deduped = new Map<string, SyncTxnHeadRef>();
  for (const ref of refs) {
    const key = [ref.head.txId, ref.head.payloadHash, ref.head.payloadBytes].join(
      "|",
    );
    const current = deduped.get(key);
    if (!current || ref.head.committedAt > current.head.committedAt) {
      deduped.set(key, ref);
    }
  }

  return Array.from(deduped.values()).sort(
    (left, right) => right.head.committedAt - left.head.committedAt,
  );
}

async function validateTxnEnvelope(
  client: SyncClient,
  baseKey: string,
  ref: SyncTxnHeadRef,
): Promise<SyncTxnEnvelope | null> {
  const raw = await client.get(TXN_LAYOUT.buildDataKey(baseKey, ref.head.txId));
  const envelope = safeJsonParse<SyncTxnEnvelope>(raw);
  if (!envelope || !isSyncTxnEnvelope(envelope)) return null;
  if (envelope.txId !== ref.head.txId) return null;
  if (envelope.payloadHash !== ref.head.payloadHash) return null;
  if (envelope.payloadBytes !== ref.head.payloadBytes) return null;
  const payloadBytes = utf8BytesLength(envelope.payload);
  if (payloadBytes !== envelope.payloadBytes) return null;
  const payloadHash = await sha256Hex(envelope.payload);
  if (payloadHash !== envelope.payloadHash) return null;
  return envelope;
}

async function loadLatestValidTxnHead(
  client: SyncClient,
  baseKey: string,
): Promise<SyncTxnHead | null> {
  const headRefs = await loadLatestTxnHead(client, baseKey);
  for (const ref of headRefs) {
    const envelope = await validateTxnEnvelope(client, baseKey, ref);
    if (envelope) {
      return ref.head;
    }
  }
  return null;
}

export function resolveSyncStateBaseKey(
  provider: ProviderType,
  config: { username?: string },
) {
  if (provider === ProviderType.WebDAV) {
    return DEFAULT_STATE_KEY;
  }
  const username = (config.username || "").trim();
  return username || STORAGE_KEY;
}

export async function readSyncState(
  client: SyncClient,
  baseKey: string,
): Promise<string> {
  const normalizedBaseKey = normalizeStateKey(baseKey);
  const headRefs = await loadLatestTxnHead(client, normalizedBaseKey);
  for (const ref of headRefs) {
    const envelope = await validateTxnEnvelope(client, normalizedBaseKey, ref);
    if (envelope) {
      return envelope.payload;
    }
    console.warn("[Sync] transaction head exists but payload is invalid", {
      baseKey: normalizedBaseKey,
      txId: ref.head.txId,
    });
  }

  // Fallback for non-transactional data.
  return await client.get(normalizedBaseKey);
}

export async function withSyncStateLock<T>(
  client: SyncClient,
  baseKey: string,
  runner: () => Promise<T>,
): Promise<T> {
  const normalizedBaseKey = normalizeStateKey(baseKey);
  const lockKey = buildSyncLockKey(normalizedBaseKey);
  const lockOwner = createTxId();
  const deadline = Date.now() + SYNC_LOCK_WAIT_TIMEOUT_MS;
  let acquired = false;

  while (Date.now() <= deadline) {
    acquired = await client.acquireLock(lockKey, lockOwner, SYNC_LOCK_TTL_MS);
    if (acquired) break;
    const jitter = Math.floor(Math.random() * SYNC_LOCK_RETRY_BASE_MS);
    await sleep(SYNC_LOCK_RETRY_BASE_MS + jitter);
  }

  if (!acquired) {
    throw new Error(
      `sync lock timeout after ${SYNC_LOCK_WAIT_TIMEOUT_MS}ms (${lockKey})`,
    );
  }

  try {
    return await runner();
  } finally {
    try {
      await client.releaseLock(lockKey, lockOwner);
    } catch (error) {
      console.warn("[Sync] failed to release sync lock", {
        lockKey,
        error,
      });
    }
  }
}

export async function writeSyncState(
  client: SyncClient,
  baseKey: string,
  payload: string,
): Promise<void> {
  const normalizedBaseKey = normalizeStateKey(baseKey);
  const writeLayout = TXN_LAYOUT;
  const latestCommittedHead = await loadLatestValidTxnHead(
    client,
    normalizedBaseKey,
  );
  const txId = createTxId();
  const payloadBytes = utf8BytesLength(payload);
  const payloadHash = await sha256Hex(payload);
  const committedAt = Date.now();
  const envelope: SyncTxnEnvelope = {
    version: SYNC_TXN_VERSION,
    txId,
    payload,
    payloadHash,
    payloadBytes,
    createdAt: committedAt,
  };
  const dataKey = writeLayout.buildDataKey(normalizedBaseKey, txId);

  await client.set(dataKey, JSON.stringify(envelope));
  const verifyEnvelope = await validateTxnEnvelope(client, normalizedBaseKey, {
    head: {
      version: SYNC_TXN_VERSION,
      txId,
      payloadHash,
      payloadBytes,
      committedAt,
    },
  });
  if (!verifyEnvelope) {
    throw new Error("sync transaction payload verification failed");
  }

  const head: SyncTxnHead = {
    version: SYNC_TXN_VERSION,
    txId,
    payloadHash,
    payloadBytes,
    committedAt,
    prevTxId: latestCommittedHead?.txId,
  };
  const serializedHead = JSON.stringify(head);
  await client.set(writeLayout.buildHeadKey(normalizedBaseKey), serializedHead);
  try {
    await client.set(
      writeLayout.buildHeadBackupKey(normalizedBaseKey),
      serializedHead,
    );
  } catch (error) {
    console.warn("[Sync] failed to write backup transaction head", error);
  }

  // Keep the latest two committed payloads: current + previous.
  // Delete the older one to avoid unbounded growth of txn data objects.
  const staleTxId = latestCommittedHead?.prevTxId;
  if (
    staleTxId &&
    staleTxId !== txId &&
    staleTxId !== latestCommittedHead?.txId
  ) {
    try {
      await client.del(writeLayout.buildDataKey(normalizedBaseKey, staleTxId));
    } catch (error) {
      console.warn("[Sync] failed to cleanup stale transaction payload", {
        baseKey: normalizedBaseKey,
        staleTxId,
        error,
      });
    }
  }
}
