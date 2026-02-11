import tauriConfig from "../../src-tauri/tauri.conf.json";
import { DEFAULT_INPUT_TEMPLATE } from "../constant";

function splitWebdavUrl(raw: string): { baseUrl: string; prefix: string } {
  try {
    const url = new URL(raw);
    const baseUrl = `${url.protocol}//${url.host}`;
    const pathname = url.pathname.replace(/\/+$/, "");
    return { baseUrl, prefix: pathname === "/" ? "" : pathname };
  } catch {
    return { baseUrl: raw.trim(), prefix: "" };
  }
}

export const getBuildConfig = () => {
  if (typeof process === "undefined") {
    throw Error(
      "[Server Config] you are importing a nodejs-only module outside of nodejs",
    );
  }
  const defaultRouterBackendUrl = "http://127.0.0.1:3011";
  const adminWalletAccount = process.env.ADMIN_WALLET_ACCOUNT;
  const buildMode = process.env.BUILD_MODE ?? "standalone";
  const isApp = !!process.env.BUILD_APP;
  const version = "v" + tauriConfig.package.version;
  const webdavBackendBaseUrlEnv =
    process.env.WEBDAV_BACKEND_BASE_URL?.trim() || "";
  const rawWebdavBackendPrefixEnv = process.env.WEBDAV_BACKEND_PREFIX;
  const hasWebdavBackendPrefixEnv = rawWebdavBackendPrefixEnv !== undefined;
  const webdavBackendPrefixEnv = hasWebdavBackendPrefixEnv
    ? rawWebdavBackendPrefixEnv.trim()
    : "";
  let webdavBackendBaseUrl = webdavBackendBaseUrlEnv;
  let webdavBackendPrefix = webdavBackendPrefixEnv;
  if (webdavBackendBaseUrl) {
    const parsed = splitWebdavUrl(webdavBackendBaseUrl);
    webdavBackendBaseUrl = parsed.baseUrl;
    if (!webdavBackendPrefix && parsed.prefix) {
      webdavBackendPrefix = parsed.prefix;
    }
  }
  if (!hasWebdavBackendPrefixEnv && !webdavBackendPrefix) {
    webdavBackendPrefix = "/dav";
  }
  if (webdavBackendBaseUrl) {
    webdavBackendBaseUrl = webdavBackendBaseUrl.replace(/\/+$/, "");
  }
  if (webdavBackendPrefix) {
    const trimmed = webdavBackendPrefix.trim();
    webdavBackendPrefix = trimmed
      ? (trimmed.startsWith("/") ? trimmed : `/${trimmed}`).replace(/\/+$/, "")
      : "";
  }
  const routerBackendUrl =
    process.env.ROUTER_BACKEND_URL ??
    process.env.YEYING_BACKEND_URL ??
    defaultRouterBackendUrl;

  const commitInfo = (() => {
    try {
      const childProcess = require("child_process");
      const commitDate: string = childProcess
        .execSync('git log -1 --format="%at000" --date=unix')
        .toString()
        .trim();
      const commitHash: string = childProcess
        .execSync('git log --pretty=format:"%H" -n 1')
        .toString()
        .trim();

      return { commitDate, commitHash };
    } catch (e) {
      console.error("[Build Config] No git or not from git repo.");
      return {
        commitDate: "unknown",
        commitHash: "unknown",
      };
    }
  })();

  return {
    version,
    ...commitInfo,
    buildMode,
    isApp,
    template: process.env.DEFAULT_INPUT_TEMPLATE ?? DEFAULT_INPUT_TEMPLATE,
    adminWalletAccount,
    webdavBackendBaseUrl,
    webdavBackendPrefix,
    routerBackendUrl,
  };
};

export type BuildConfig = ReturnType<typeof getBuildConfig>;
