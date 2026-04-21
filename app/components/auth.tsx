import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Path, SAAS_CHAT_URL } from "../constant";
import Locale from "../locales";
import Delete from "../icons/close.svg";
import Arrow from "../icons/arrow.svg";
import Logo from "../icons/yeying.svg";
import { useMobileScreen } from "@/app/utils";
import { getClientConfig } from "../config/client";
import { safeLocalStorage } from "@/app/utils";
import { trackSettingsPageGuideToCPaymentClick } from "../utils/auth-settings-events";
import clsx from "clsx";
import {
  UCAN_AUTH_EVENT,
  connectWallet,
  getCurrentAccount,
  isValidUcanAuthorization,
} from "../plugins/wallet";
import {
  applyCentralAuthorizeExchange,
  createCentralAuthorizeRequest,
  exchangeCentralAuthorizeCode,
  getDefaultCentralAppName,
  getDefaultCentralClientId,
  getUcanAuthMode,
  setUcanAuthMode,
  UCAN_AUTH_MODE_CENTRAL,
  UCAN_AUTH_MODE_WALLET,
} from "../plugins/central-ucan";
import { getRouterAudience } from "../plugins/ucan";
import { notifyError, notifyInfo, notifySuccess } from "../plugins/show_window";

const storage = safeLocalStorage();
const WALLET_HISTORY_KEY = "walletAccountHistory";
const WALLET_HISTORY_LIMIT = 10;

function normalizeAccount(account?: string | null) {
  return (account ?? "").trim();
}

function parseWalletHistory(raw: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => normalizeAccount(item))
      .filter((item) => {
        if (!item) return false;
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, WALLET_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function loadWalletHistory() {
  return parseWalletHistory(storage.getItem(WALLET_HISTORY_KEY));
}

function persistWalletHistory(history: string[]) {
  storage.setItem(WALLET_HISTORY_KEY, JSON.stringify(history));
}

function mergeWalletHistory(account: string, history: string[]) {
  if (!account) return history;
  return [
    account,
    ...history.filter((item) => item.toLowerCase() !== account.toLowerCase()),
  ].slice(0, WALLET_HISTORY_LIMIT);
}

function formatWalletAccount(account: string) {
  if (account.length <= 18) return account;
  return `${account.slice(0, 10)}...${account.slice(-8)}`;
}

function normalizeRedirectPath(raw: string | null | undefined) {
  const value = (raw || "").trim();
  if (!value || !value.startsWith("/")) {
    return Path.Home;
  }
  if (value === Path.Auth) {
    return Path.Home;
  }
  return value;
}

function getCentralRedirectUri() {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/central-ucan-callback.html`;
}

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ucanStatus, setUcanStatus] = useState<
    "checking" | "authorized" | "expired" | "unauthorized"
  >("checking");
  const [authMode, setAuthMode] = useState(getUcanAuthMode());
  const [walletHistory, setWalletHistory] = useState<string[]>([]);
  const [selectedWalletAccount, setSelectedWalletAccount] = useState("");
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const [centralAddress, setCentralAddress] = useState("");
  const [centralClientId, setCentralClientId] = useState(
    getDefaultCentralClientId(),
  );
  const [centralAppName, setCentralAppName] = useState(getDefaultCentralAppName());
  const [centralAuthBaseUrl, setCentralAuthBaseUrl] = useState(
    getClientConfig()?.centralUcanAuthBaseUrl || "http://127.0.0.1:8100",
  );
  const [centralLoading, setCentralLoading] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const exchangedCodeRef = useRef("");

  useEffect(() => {
    if (getClientConfig()?.isApp) {
      navigate(Path.Settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshStatus = async () => {
      const account = normalizeAccount(getCurrentAccount());
      const history = mergeWalletHistory(account, loadWalletHistory());
      const valid = await isValidUcanAuthorization();
      if (cancelled) return;
      if (history.length > 0) {
        persistWalletHistory(history);
      }
      setWalletHistory(history);
      setSelectedWalletAccount(account || "");
      setCentralAddress((prev) => prev || account || "");
      setAuthMode(getUcanAuthMode());
      if (valid) {
        setUcanStatus("authorized");
      } else if (account) {
        setUcanStatus("expired");
      } else {
        setUcanStatus("unauthorized");
      }
    };
    refreshStatus();
    const onAuthChange = () => {
      refreshStatus();
    };
    window.addEventListener(UCAN_AUTH_EVENT, onAuthChange);
    window.addEventListener("storage", onAuthChange);
    return () => {
      cancelled = true;
      window.removeEventListener(UCAN_AUTH_EVENT, onAuthChange);
      window.removeEventListener("storage", onAuthChange);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = (params.get("code") || "").trim();
    if (!code) {
      return;
    }
    if (exchangedCodeRef.current === code) {
      return;
    }
    exchangedCodeRef.current = code;
    setAuthMode(UCAN_AUTH_MODE_CENTRAL);
    setUcanAuthMode(UCAN_AUTH_MODE_CENTRAL, { emit: false });

    const redirectPath = normalizeRedirectPath(params.get("state"));
    const redirectUri = getCentralRedirectUri();

    const run = async () => {
      setCentralLoading(true);
      try {
        const result = await exchangeCentralAuthorizeCode({
          code,
          clientId: centralClientId,
          redirectUri,
          baseUrl: centralAuthBaseUrl,
        });
        applyCentralAuthorizeExchange(result, { emit: false });
        notifySuccess("✅中心化 UCAN 登录成功");
        const target = encodeURIComponent(redirectPath);
        navigate(`${Path.Auth}?redirect=${target}`, { replace: true });
        window.dispatchEvent(new Event(UCAN_AUTH_EVENT));
      } catch (error) {
        const message = `❌中心化授权码兑换失败: ${error}`;
        notifyError(message);
      } finally {
        setCentralLoading(false);
      }
    };

    run();
  }, [location.search, navigate, centralClientId, centralAuthBaseUrl]);

  useEffect(() => {
    if (!isWalletMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (
        walletMenuRef.current &&
        target instanceof Node &&
        !walletMenuRef.current.contains(target)
      ) {
        setIsWalletMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsWalletMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isWalletMenuOpen]);

  const handleWalletAccountSelect = (account: string) => {
    const normalized = normalizeAccount(account);
    setSelectedWalletAccount(normalized);
    setIsWalletMenuOpen(false);
    if (!normalized) return;
    storage.setItem("currentAccount", normalized);
  };

  const handleWalletConnect = () => {
    setAuthMode(UCAN_AUTH_MODE_WALLET);
    setUcanAuthMode(UCAN_AUTH_MODE_WALLET, { emit: false });
    connectWallet(selectedWalletAccount || undefined);
  };

  const handleAuthModeChange = (
    mode: typeof UCAN_AUTH_MODE_WALLET | typeof UCAN_AUTH_MODE_CENTRAL,
  ) => {
    if (mode === authMode) return;
    setAuthMode(mode);
    setUcanAuthMode(mode, { emit: true });
    if (mode === UCAN_AUTH_MODE_CENTRAL) {
      setCentralAddress((prev) => prev || selectedWalletAccount || getCurrentAccount());
    }
  };

  const handleCentralAuthorizeLogin = async () => {
    const address = normalizeAccount(centralAddress || selectedWalletAccount);
    if (!address) {
      notifyInfo("请先输入区块链地址");
      return;
    }
    const routerAudience = getRouterAudience();
    if (!routerAudience) {
      notifyError("❌无法解析 Router audience，请检查 ROUTER_BACKEND_URL");
      return;
    }
    const redirectUri = getCentralRedirectUri();
    const params = new URLSearchParams(location.search);
    const redirectPath = normalizeRedirectPath(params.get("redirect"));
    setCentralLoading(true);
    try {
      const request = await createCentralAuthorizeRequest({
        address,
        clientId: centralClientId,
        redirectUri,
        state: redirectPath,
        audience: routerAudience,
        appName: centralAppName,
        baseUrl: centralAuthBaseUrl,
      });
      setAuthMode(UCAN_AUTH_MODE_CENTRAL);
      setUcanAuthMode(UCAN_AUTH_MODE_CENTRAL, { emit: false });
      storage.setItem("currentAccount", address);
      notifySuccess("✅已创建中心化授权请求，跳转认证页");
      window.location.href = request.verifyUrl;
    } catch (error) {
      notifyError(`❌创建中心化授权请求失败: ${error}`);
    } finally {
      setCentralLoading(false);
    }
  };

  const isWalletConnectDisabled = ucanStatus === "authorized";
  const selectedWalletLabel = selectedWalletAccount
    ? formatWalletAccount(selectedWalletAccount)
    : "历史账户（可选）";

  const handleWalletMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsWalletMenuOpen((open) => !open);
    }
  };

  return (
    <div className={styles["auth-page"]}>
      <TopBanner></TopBanner>
      <div className={styles["auth-mode-switch"]}>
        <button
          type="button"
          className={styles["auth-mode-option"]}
          data-active={authMode === UCAN_AUTH_MODE_WALLET}
          onClick={() => handleAuthModeChange(UCAN_AUTH_MODE_WALLET)}
        >
          钱包 UCAN
        </button>
        <button
          type="button"
          className={styles["auth-mode-option"]}
          data-active={authMode === UCAN_AUTH_MODE_CENTRAL}
          onClick={() => handleAuthModeChange(UCAN_AUTH_MODE_CENTRAL)}
        >
          中心化 UCAN（服务）
        </button>
      </div>

      {authMode === UCAN_AUTH_MODE_WALLET ? (
        <div className={styles["auth-wallet"]}>
          <div className={styles["auth-wallet-select-wrap"]} ref={walletMenuRef}>
            <button
              type="button"
              className={styles["auth-wallet-select"]}
              aria-label="wallet-history-select"
              aria-haspopup="listbox"
              aria-expanded={isWalletMenuOpen}
              onClick={() => setIsWalletMenuOpen((open) => !open)}
              onKeyDown={handleWalletMenuKeyDown}
            >
              <span
                className={
                  selectedWalletAccount
                    ? styles["auth-wallet-select-value"]
                    : styles["auth-wallet-select-placeholder"]
                }
                title={selectedWalletAccount || undefined}
              >
                {selectedWalletLabel}
              </span>
              <span
                className={styles["auth-wallet-select-arrow"]}
                data-open={isWalletMenuOpen}
              />
            </button>
            {isWalletMenuOpen && (
              <div className={styles["auth-wallet-menu"]} role="listbox">
                {walletHistory.length > 0 ? (
                  walletHistory.map((account) => (
                    <button
                      type="button"
                      key={account}
                      className={styles["auth-wallet-option"]}
                      data-active={
                        account.toLowerCase() ===
                        selectedWalletAccount.toLowerCase()
                      }
                      onClick={() => handleWalletAccountSelect(account)}
                      title={account}
                    >
                      {account}
                    </button>
                  ))
                ) : (
                  <div className={styles["auth-wallet-option-empty"]}>
                    暂无历史账户
                  </div>
                )}
              </div>
            )}
          </div>
          <IconButton
            text="连接钱包"
            type="primary"
            className={styles["auth-wallet-connect"]}
            onClick={handleWalletConnect}
            disabled={isWalletConnectDisabled}
          />
        </div>
      ) : (
        <div className={styles["auth-central"]}>
          <div className={styles["auth-central-row"]}>
            <label>区块链地址</label>
            <input
              value={centralAddress}
              onChange={(event) => setCentralAddress(event.target.value)}
              placeholder="0x..."
            />
          </div>
          <div className={styles["auth-central-row"]}>
            <label>认证服务地址</label>
            <input
              value={centralAuthBaseUrl}
              onChange={(event) => setCentralAuthBaseUrl(event.target.value)}
              placeholder="http://127.0.0.1:8100"
            />
          </div>
          <div className={styles["auth-central-row"]}>
            <label>clientId</label>
            <input
              value={centralClientId}
              onChange={(event) => setCentralClientId(event.target.value)}
              placeholder="chat-web"
            />
          </div>
          <div className={styles["auth-central-row"]}>
            <label>appName</label>
            <input
              value={centralAppName}
              onChange={(event) => setCentralAppName(event.target.value)}
              placeholder="chat-web"
            />
          </div>
          <IconButton
            text={centralLoading ? "处理中..." : "中心化 UCAN 登录"}
            type="primary"
            className={styles["auth-wallet-connect"]}
            onClick={handleCentralAuthorizeLogin}
            disabled={centralLoading}
          />
        </div>
      )}
    </div>
  );
}

function TopBanner() {
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(() => {
    const bannerDismissed = storage.getItem("bannerDismissed");
    if (!bannerDismissed) {
      storage.setItem("bannerDismissed", "false");
      return true;
    }
    return bannerDismissed !== "true";
  });
  const isMobile = useMobileScreen();

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleClose = () => {
    setIsVisible(false);
    storage.setItem("bannerDismissed", "true");
  };

  if (!isVisible) {
    return null;
  }
  return (
    <div
      className={styles["top-banner"]}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={clsx(styles["top-banner-inner"], "no-dark")}>
        <Logo className={styles["top-banner-logo"]}></Logo>
        <span>
          {Locale.Auth.TopTips}
          <a
            href={SAAS_CHAT_URL}
            rel="stylesheet"
            onClick={() => {
              trackSettingsPageGuideToCPaymentClick();
            }}
          >
            {Locale.Settings.Access.SaasStart.ChatNow}
            <Arrow style={{ marginLeft: "4px" }} />
          </a>
        </span>
      </div>
      {(isHovered || isMobile) && (
        <Delete className={styles["top-banner-close"]} onClick={handleClose} />
      )}
    </div>
  );
}
