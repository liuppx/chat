import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { useState, useEffect, useRef, type FocusEvent } from "react";
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
  waitForWallet,
} from "../plugins/wallet";
import {
  applyCentralAuthorizeExchange,
  createCentralAuthorizeRequest,
  exchangeCentralAuthorizeCode,
  getDefaultCentralClientId,
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

function formatAccountPreview(account?: string | null) {
  const normalized = normalizeAccount(account);
  if (!normalized) return "";
  const prefixLength = 6;
  const suffixLength = 6;
  if (normalized.length <= prefixLength + suffixLength + 3) {
    return normalized;
  }
  return `${normalized.slice(0, prefixLength)}...${normalized.slice(-suffixLength)}`;
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
  const [walletHistory, setWalletHistory] = useState<string[]>([]);
  const [selectedWalletAccount, setSelectedWalletAccount] = useState("");
  const [isWalletAccountFocused, setIsWalletAccountFocused] = useState(false);
  const [isWalletHistoryOpen, setIsWalletHistoryOpen] = useState(false);
  const [centralLoading, setCentralLoading] = useState(false);
  const exchangedCodeRef = useRef("");
  const walletAccountInputRef = useRef<HTMLInputElement>(null);

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
    setUcanAuthMode(UCAN_AUTH_MODE_CENTRAL, { emit: false });

    const redirectPath = normalizeRedirectPath(params.get("state"));
    const redirectUri = getCentralRedirectUri();

    const run = async () => {
      setCentralLoading(true);
      try {
        const result = await exchangeCentralAuthorizeCode({
          code,
          clientId: getDefaultCentralClientId(),
          redirectUri,
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
  }, [location.search, navigate]);

  const handleCentralAuthorizeLogin = async (addressHint?: string) => {
    const address = normalizeAccount(addressHint || selectedWalletAccount);
    if (!address) {
      notifyInfo("请先输入或选择区块链地址");
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
        clientId: getDefaultCentralClientId(),
        redirectUri,
        state: redirectPath,
        audience: routerAudience,
      });
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

  const handlePrimaryLogin = async () => {
    if (centralLoading) return;
    const preferredAddress = normalizeAccount(selectedWalletAccount);
    try {
      await waitForWallet();
      setUcanAuthMode(UCAN_AUTH_MODE_WALLET, { emit: false });
      await connectWallet(preferredAddress || undefined);
      return;
    } catch {
      // wallet not available, fallback to centralized UCAN service
    }
    await handleCentralAuthorizeLogin(preferredAddress);
  };

  const handleCopyWalletAccount = async () => {
    const address = normalizeAccount(selectedWalletAccount);
    if (!address) {
      notifyInfo("请先输入或选择区块链地址");
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      notifySuccess("已复制地址");
    } catch (error) {
      console.error("copy wallet account failed", error);
      notifyError("复制失败");
    }
  };

  const handleWalletSelectWrapBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextFocused = event.relatedTarget as Node | null;
    if (nextFocused && event.currentTarget.contains(nextFocused)) {
      return;
    }
    setIsWalletHistoryOpen(false);
    setIsWalletAccountFocused(false);
    setSelectedWalletAccount((value) => normalizeAccount(value));
  };

  const handleWalletHistoryToggle = () => {
    const nextOpen = !isWalletHistoryOpen;
    setIsWalletHistoryOpen(nextOpen);
    if (nextOpen) {
      setIsWalletAccountFocused(true);
      walletAccountInputRef.current?.focus();
    } else {
      walletAccountInputRef.current?.blur();
    }
  };

  const handleWalletHistorySelect = (account: string) => {
    setSelectedWalletAccount(account);
    setIsWalletHistoryOpen(false);
    setIsWalletAccountFocused(false);
    walletAccountInputRef.current?.blur();
  };

  const isWalletConnectDisabled = ucanStatus === "authorized" || centralLoading;
  const normalizedSelectedWalletAccount = normalizeAccount(selectedWalletAccount);
  const walletAccountInputValue = isWalletAccountFocused
    ? selectedWalletAccount
    : formatAccountPreview(selectedWalletAccount);

  return (
    <div className={styles["auth-page"]}>
      <TopBanner></TopBanner>
      <div className={styles["auth-wallet"]}>
        <div
          className={styles["auth-wallet-select-wrap"]}
          onBlur={handleWalletSelectWrapBlur}
        >
          <input
            ref={walletAccountInputRef}
            className={styles["auth-wallet-select"]}
            value={walletAccountInputValue}
            onChange={(event) => {
              setSelectedWalletAccount(event.target.value);
              setIsWalletHistoryOpen(true);
            }}
            onFocus={() => {
              setIsWalletAccountFocused(true);
              setIsWalletHistoryOpen(true);
            }}
            data-empty={selectedWalletAccount ? "false" : "true"}
            aria-label="输入或选择区块链地址"
            placeholder="输入或选择区块链地址"
            autoComplete="off"
            spellCheck={false}
            title={selectedWalletAccount}
          />
          {isWalletHistoryOpen && (
            <div className={styles["auth-wallet-history-menu"]}>
              {walletHistory.length > 0 ? (
                walletHistory.map((account) => (
                  <button
                    key={account}
                    type="button"
                    className={styles["auth-wallet-history-option"]}
                    data-active={
                      account.toLowerCase() ===
                      normalizedSelectedWalletAccount.toLowerCase()
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleWalletHistorySelect(account)}
                    title={account}
                  >
                    {formatAccountPreview(account)}
                  </button>
                ))
              ) : (
                <div className={styles["auth-wallet-history-empty"]}>
                  暂无历史地址
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className={styles["auth-wallet-copy"]}
            onClick={handleCopyWalletAccount}
            disabled={!normalizedSelectedWalletAccount}
            title="复制完整地址"
            aria-label="复制完整地址"
          >
            复制
          </button>
          <button
            type="button"
            className={styles["auth-wallet-arrow-button"]}
            onClick={handleWalletHistoryToggle}
            aria-label="展开地址列表"
            title="展开地址列表"
          >
            <span
              className={styles["auth-wallet-select-arrow"]}
              data-open={isWalletHistoryOpen ? "true" : "false"}
            />
          </button>
        </div>
        <IconButton
          text={centralLoading ? "处理中..." : "登录"}
          type="primary"
          className={styles["auth-wallet-connect"]}
          onClick={handlePrimaryLogin}
          disabled={isWalletConnectDisabled}
        />
      </div>
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
