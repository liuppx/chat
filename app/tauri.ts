import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { check } from "@tauri-apps/plugin-updater";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    isTauri?: boolean;
  }
}

export function isDesktopAppRuntime() {
  if (typeof window === "undefined") return false;

  // `isTauri()` is the normal marker. Older WebView runtimes may expose the
  // IPC object without the marker, so keep the protocol/host fallback for
  // packaged apps using Tauri's HTTPS scheme.
  if (isTauri() || window.__TAURI_INTERNALS__) return true;
  return (
    window.location.protocol === "tauri:" ||
    window.location.hostname === "tauri.localhost"
  );
}

export {
  check as checkForAppUpdate,
  invoke as tauriInvoke,
  isPermissionGranted as isNotificationPermissionGranted,
  listen as tauriListen,
  requestPermission as requestNotificationPermission,
  save as saveWithDialog,
  sendNotification,
  writeClipboardText,
  writeFile,
  writeTextFile,
};
