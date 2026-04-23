import { createWebDavClient } from "./webdav";
import { createUpstashClient } from "./upstash";

export enum ProviderType {
  WebDAV = "webdav",
  UpStash = "upstash",
}

export const SyncClients = {
  [ProviderType.UpStash]: createUpstashClient,
  [ProviderType.WebDAV]: createWebDavClient,
} as const;

type SyncClientConfig = {
  [K in keyof typeof SyncClients]: (typeof SyncClients)[K] extends (
    _: infer C,
  ) => any
    ? C
    : never;
};

export type SyncClient = {
  get: (key: string) => Promise<string>;
  set: (key: string, value: string) => Promise<void>;
  del: (key: string) => Promise<void>;
  check: () => Promise<boolean>;
  acquireLock: (key: string, owner: string, ttlMs: number) => Promise<boolean>;
  releaseLock: (key: string, owner: string) => Promise<void>;
  uploadMedia?: (
    mediaKey: string,
    blob: Blob,
    contentType?: string,
  ) => Promise<void>;
  downloadMedia?: (mediaKey: string) => Promise<Blob | null>;
};

export function createSyncClient<T extends ProviderType>(
  provider: T,
  config: SyncClientConfig[T],
): SyncClient {
  return SyncClients[provider](config as any) as any;
}
