import { STORAGE_KEY } from "@/app/constant";
import { SyncStore } from "@/app/store/sync";
import { chunks } from "../format";

export type UpstashConfig = SyncStore["upstash"];
export type UpStashClient = ReturnType<typeof createUpstashClient>;
const LOCK_RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

export function createUpstashClient(store: SyncStore) {
  const config = store.upstash;
  const defaultStoreKey =
    config.username.length === 0 ? STORAGE_KEY : config.username;
  const resolveStoreKey = (key?: string) => {
    const normalized = (key || "").trim();
    return normalized || defaultStoreKey;
  };
  const chunkCountKey = (storeKey: string) => `${storeKey}-chunk-count`;
  const chunkIndexKey = (storeKey: string, index: number) =>
    `${storeKey}-chunk-${index}`;

  const proxyUrl =
    store.useProxy && store.proxyUrl.length > 0 ? store.proxyUrl : undefined;
  const encodeSegment = (value: string) => encodeURIComponent(value);

  return {
    async check() {
      try {
        const res = await fetch(
          this.path(`get/${resolveStoreKey(defaultStoreKey)}`, proxyUrl),
          {
            method: "GET",
            headers: this.headers(),
          },
        );
        console.log("[Upstash] check", res.status, res.statusText);
        return [200].includes(res.status);
      } catch (e) {
        console.error("[Upstash] failed to check", e);
      }
      return false;
    },

    async redisCommand(
      action: string,
      segments: string[],
      init?: { method?: "GET" | "POST"; body?: string },
    ) {
      const commandPath = `${action}/${segments.map(encodeSegment).join("/")}`;
      const res = await fetch(this.path(commandPath, proxyUrl), {
        method: init?.method ?? "GET",
        headers: this.headers(),
        body: init?.body ?? null,
      });
      if (!res.ok) {
        throw new Error(
          `Upstash ${action} failed: ${res.status} ${res.statusText}`,
        );
      }
      return (await res.json()) as { result?: unknown };
    },

    async redisGet(key: string) {
      const resJson = await this.redisCommand("get", [key]);
      console.log("[Upstash] get key = ", key, resJson.result);
      return String(resJson.result ?? "");
    },

    async redisSet(key: string, value: string) {
      await this.redisCommand("set", [key], { method: "POST", body: value });
      console.log("[Upstash] set key = ", key);
    },

    async redisSetNxWithTtl(key: string, value: string, ttlMs: number) {
      const resJson = await this.redisCommand("set", [
        key,
        value,
        "NX",
        "PX",
        `${Math.max(1000, Math.floor(ttlMs))}`,
      ]);
      return resJson.result === "OK";
    },

    async redisReleaseLock(key: string, owner: string) {
      await this.redisCommand("eval", [LOCK_RELEASE_SCRIPT, "1", key, owner]);
    },

    async get(key: string) {
      const storeKey = resolveStoreKey(key);
      const chunkCount = Number(await this.redisGet(chunkCountKey(storeKey)));
      if (!Number.isInteger(chunkCount) || chunkCount <= 0) return "";

      const chunks = await Promise.all(
        new Array(chunkCount)
          .fill(0)
          .map((_, i) => this.redisGet(chunkIndexKey(storeKey, i))),
      );
      console.log("[Upstash] get full chunks", { storeKey, chunkCount });
      return chunks.join("");
    },

    async set(key: string, value: string) {
      const storeKey = resolveStoreKey(key);
      // upstash limit the max request size which is 1Mb for “Free” and “Pay as you go”
      // so we need to split the data to chunks
      let index = 0;
      for await (const chunk of chunks(value)) {
        await this.redisSet(chunkIndexKey(storeKey, index), chunk);
        index += 1;
      }
      await this.redisSet(chunkCountKey(storeKey), index.toString());
    },

    async acquireLock(key: string, owner: string, ttlMs: number) {
      const lockKey = resolveStoreKey(key);
      return await this.redisSetNxWithTtl(lockKey, owner, ttlMs);
    },

    async releaseLock(key: string, owner: string) {
      const lockKey = resolveStoreKey(key);
      await this.redisReleaseLock(lockKey, owner);
    },

    headers() {
      return {
        Authorization: `Bearer ${config.apiKey}`,
      };
    },
    path(path: string, proxyUrl: string = "") {
      if (!path.endsWith("/")) {
        path += "/";
      }
      if (path.startsWith("/")) {
        path = path.slice(1);
      }

      if (proxyUrl.length > 0 && !proxyUrl.endsWith("/")) {
        proxyUrl += "/";
      }

      let url;
      const pathPrefix = "/api/upstash/";

      try {
        let u = new URL(proxyUrl + pathPrefix + path);
        // add query params
        u.searchParams.append("endpoint", config.endpoint);
        url = u.toString();
      } catch (e) {
        url = pathPrefix + path + "?endpoint=" + config.endpoint;
      }

      return url;
    },
  };
}
