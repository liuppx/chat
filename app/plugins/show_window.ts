import { toast, type ExternalToast } from "sonner";

const RECENT_TOASTS = new Map<string, number>();
const DEDUPE_WINDOW_MS = 1500;
const STATUS_EMOJI_PREFIX = /^[\u2705\u274C\u26A0\u{1F7E1}\uFE0F]+\s*/u;

function shouldToast(key: string) {
  const now = Date.now();
  const last = RECENT_TOASTS.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  RECENT_TOASTS.set(key, now);
  return true;
}

function normalizeToastMessage(msg: string) {
  return msg.replace(STATUS_EMOJI_PREFIX, "");
}

export const notifyError = (msg: string) => {
  const normalized = normalizeToastMessage(msg);
  const key = `error:${normalized}`;
  if (!shouldToast(key)) return;
  toast.error(normalized, { id: key, duration: 3000 });
};

export const notifyErrorWithOptions = (
  msg: string,
  options?: ExternalToast,
) => {
  const normalized = normalizeToastMessage(msg);
  const key = `error:${normalized}`;
  if (!shouldToast(key)) return;
  toast.error(normalized, {
    id: key,
    duration: 3000,
    ...options,
  });
};

export const notifyInfo = (msg: string) => {
  const normalized = normalizeToastMessage(msg);
  const key = `info:${normalized}`;
  if (!shouldToast(key)) return;
  toast.info(normalized, { id: key });
};

export const notifySuccess = (msg: string) => {
  const normalized = normalizeToastMessage(msg);
  const key = `success:${normalized}`;
  if (!shouldToast(key)) return;
  toast.success(normalized, { id: key });
};
