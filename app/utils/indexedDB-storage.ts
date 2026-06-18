import { StateStorage } from "zustand/middleware";
import { get, set, del, clear } from "idb-keyval";
import { safeLocalStorage } from "@/app/utils";

const localStorage = safeLocalStorage();
const STORAGE_KEY_ALIASES: Record<string, string[]> = {
  "skill-store": ["mask-store"],
};

class IndexedDBStorage implements StateStorage {
  public async getItem(name: string): Promise<string | null> {
    try {
      const value = (await get(name)) || localStorage.getItem(name);
      if (value) return value;

      const aliases = STORAGE_KEY_ALIASES[name] ?? [];
      for (const alias of aliases) {
        const legacyValue = (await get(alias)) || localStorage.getItem(alias);
        if (legacyValue) {
          await set(name, legacyValue);
          return legacyValue;
        }
      }
      return value;
    } catch (error) {
      const value = localStorage.getItem(name);
      if (value) return value;

      const aliases = STORAGE_KEY_ALIASES[name] ?? [];
      for (const alias of aliases) {
        const legacyValue = localStorage.getItem(alias);
        if (legacyValue) return legacyValue;
      }

      return null;
    }
  }

  public async setItem(name: string, value: string): Promise<void> {
    try {
      const _value = JSON.parse(value);
      if (!_value?.state?._hasHydrated) {
        console.warn("skip setItem", name);
        return;
      }
      await set(name, value);
      for (const alias of STORAGE_KEY_ALIASES[name] ?? []) {
        await del(alias);
        localStorage.removeItem(alias);
      }
    } catch (error) {
      localStorage.setItem(name, value);
      for (const alias of STORAGE_KEY_ALIASES[name] ?? []) {
        localStorage.removeItem(alias);
      }
    }
  }

  public async removeItem(name: string): Promise<void> {
    try {
      await del(name);
    } catch (error) {
      localStorage.removeItem(name);
    }
  }

  public async clear(): Promise<void> {
    try {
      await clear();
    } catch (error) {
      localStorage.clear();
    }
  }
}

export const indexedDBStorage = new IndexedDBStorage();
