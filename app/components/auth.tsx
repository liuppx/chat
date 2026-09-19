import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { useCallback, useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Path } from "../constant";
import Locale from "../locales";
import Delete from "../icons/close.svg";
import Logo from "../icons/yeying.svg";
import { useMobileScreen } from "@/app/utils";
import { getClientConfig } from "../config/client";
import { safeLocalStorage } from "@/app/utils";
import clsx from "clsx";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  UCAN_AUTH_EVENT,
  isValidUcanAuthorization,
  requestWalletIdentityAuthorization,
  waitForWallet,
} from "../plugins/wallet";
import {
  approveCentralAuthorizePresentation,
  applyCentralAuthorizeExchange,
  consumeCentralAuthorizeSession,
  createCentralAuthorizeSession,
  createCentralAuthorizeRequest,
  exchangeCentralAuthorizeCode,
  getCentralAppId,
  getCentralIdentityOwner,
  resolveCentralAuthBaseUrl,
  setUcanAuthMode,
  UCAN_AUTH_MODE_CENTRAL,
} from "../plugins/central-ucan";
import { notifyError, notifySuccess } from "../plugins/show_window";
import { isDesktopAppRuntime } from "../tauri";

const storage = safeLocalStorage();
const IDENTITY_LOGIN_SCOPES = [
  "identity.basic",
  "identity.wallet",
  "identity.username",
];
const DESKTOP_CENTRAL_REDIRECT_URI =
  "chat://localhost/central-ucan-callback.html";

type CentralCallback = {
  code: string;
  state: string;
};

function parseDesktopCentralCallback(raw: string): CentralCallback | null {
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol !== "chat:" ||
      parsed.hostname !== "localhost" ||
      parsed.pathname !== "/central-ucan-callback.html"
    ) {
      return null;
    }
    const code = (parsed.searchParams.get("code") || "").trim();
    const state = (parsed.searchParams.get("state") || "").trim();
    if (!code || !state) return null;
    return { code, state };
  } catch {
    return null;
  }
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
  // Packaged Tauri uses the registered custom protocol. Never let a stale
  // build variable send its callback back to the WebView origin.
  if (isDesktopAppRuntime()) return DESKTOP_CENTRAL_REDIRECT_URI;
  const configured = getClientConfig()?.centralUcanRedirectUri?.trim();
  if (configured) return configured;
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/central-ucan-callback.html`;
}

function formatCentralAuthError(error: unknown, redirectUri: string) {
  const message = error instanceof Error ? error.message : String(error);
  return redirectUri ? `${message} (redirectUri: ${redirectUri})` : message;
}

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [ucanStatus, setUcanStatus] = useState<
    "checking" | "authorized" | "expired" | "unauthorized"
  >("checking");
  const [centralLoading, setCentralLoading] = useState(false);
  const exchangedCodeRef = useRef("");

  const handleCentralCallback = useCallback(
    async (code: string, state: string | null | undefined) => {
      if (!code || exchangedCodeRef.current === code) return;
      exchangedCodeRef.current = code;
      setUcanAuthMode(UCAN_AUTH_MODE_CENTRAL, { emit: false });

      const session = consumeCentralAuthorizeSession(state);
      const redirectPath = session
        ? normalizeRedirectPath(session.redirectPath)
        : normalizeRedirectPath(state);
      const redirectUri = getCentralRedirectUri();

      setCentralLoading(true);
      try {
        if (!session?.codeVerifier) {
          throw new Error("钱包身份授权会话已失效，请重新登录");
        }
        const result = await exchangeCentralAuthorizeCode({
          code,
          appId: getCentralAppId(),
          redirectUri,
          codeVerifier: session.codeVerifier,
        });
        applyCentralAuthorizeExchange(result, { emit: false });
        notifySuccess(Locale.Auth.CentralLoginSuccess);
        navigate(redirectPath, { replace: true });
        window.dispatchEvent(new Event(UCAN_AUTH_EVENT));
      } catch (error) {
        const message = Locale.Auth.CentralExchangeFailed(
          formatCentralAuthError(error, redirectUri),
        );
        notifyError(message);
      } finally {
        setCentralLoading(false);
      }
    },
    [navigate],
  );

  useEffect(() => {
    const config = getClientConfig();
    const params = new URLSearchParams(location.search);
    const hasCentralCallbackCode = Boolean((params.get("code") || "").trim());
    const hasCentralAuthConfig = Boolean(config?.centralUcanAppId?.trim());
    if (config?.isApp && !hasCentralCallbackCode && !hasCentralAuthConfig) {
      navigate(Path.Settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;
    let refreshToken = 0;
    const refreshStatus = async () => {
      const token = ++refreshToken;
      const owner = getCentralIdentityOwner().trim();
      const valid = await isValidUcanAuthorization();
      if (cancelled || token !== refreshToken) return;
      if (valid) {
        setUcanStatus("authorized");
      } else if (owner) {
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
    const state = params.get("state");
    void handleCentralCallback(code, state);
  }, [handleCentralCallback, location.search]);

  useEffect(() => {
    if (!isDesktopAppRuntime()) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    const handleUrls = (urls: string[]) => {
      for (const raw of urls) {
        const callback = parseDesktopCentralCallback(raw);
        if (!callback) continue;
        void handleCentralCallback(callback.code, callback.state);
        break;
      }
    };

    const subscribe = async () => {
      try {
        const removeListener = await onOpenUrl(handleUrls);
        if (disposed) {
          removeListener();
          return;
        }
        unlisten = removeListener;
        const currentUrls = await getCurrent();
        if (!disposed && currentUrls?.length) {
          handleUrls(currentUrls);
        }
      } catch (error) {
        console.error("Failed to subscribe to desktop deep links", error);
      }
    };

    void subscribe();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleCentralCallback]);

  const handleCentralAuthorizeLogin = async () => {
    const redirectUri = getCentralRedirectUri();
    const params = new URLSearchParams(location.search);
    const redirectPath = normalizeRedirectPath(params.get("redirect"));
    setCentralLoading(true);
    try {
      const session = await createCentralAuthorizeSession(redirectPath);
      const request = await createCentralAuthorizeRequest({
        appId: getCentralAppId(),
        redirectUri,
        state: session.state,
        codeChallenge: session.codeChallenge,
        scopes: IDENTITY_LOGIN_SCOPES,
      });
      setUcanAuthMode(UCAN_AUTH_MODE_CENTRAL, { emit: false });
      notifySuccess(Locale.Auth.CentralRequestCreated);
      if (isDesktopAppRuntime()) {
        await openUrl(request.verifyUrl);
      } else {
        window.location.href = request.verifyUrl;
      }
    } catch (error) {
      notifyError(
        Locale.Auth.CentralRequestFailed(
          formatCentralAuthError(error, redirectUri),
        ),
      );
    } finally {
      setCentralLoading(false);
    }
  };

  const handleWalletIdentityLogin = async (
    provider: Awaited<ReturnType<typeof waitForWallet>>,
  ) => {
    const redirectUri = getCentralRedirectUri();
    const params = new URLSearchParams(location.search);
    const redirectPath = normalizeRedirectPath(params.get("redirect"));
    const session = await createCentralAuthorizeSession(redirectPath);
    setCentralLoading(true);
    try {
      const request = await createCentralAuthorizeRequest({
        appId: getCentralAppId(),
        redirectUri,
        state: session.state,
        codeChallenge: session.codeChallenge,
        scopes: IDENTITY_LOGIN_SCOPES,
      });
      const presentation = await requestWalletIdentityAuthorization({
        provider,
        request,
        issuerEndpoint: resolveCentralAuthBaseUrl(),
      });
      const approval = await approveCentralAuthorizePresentation({
        requestId: request.requestId,
        presentation,
      });
      const result = await exchangeCentralAuthorizeCode({
        code: approval.authorizationCode,
        appId: getCentralAppId(),
        redirectUri,
        codeVerifier: session.codeVerifier,
      });
      applyCentralAuthorizeExchange(result, { emit: false });
      notifySuccess(Locale.Auth.CentralLoginSuccess);
      navigate(redirectPath, { replace: true });
      window.dispatchEvent(new Event(UCAN_AUTH_EVENT));
    } finally {
      consumeCentralAuthorizeSession(session.state);
      setCentralLoading(false);
    }
  };

  const handlePrimaryLogin = async () => {
    if (centralLoading) return;
    if (isDesktopAppRuntime()) {
      await handleCentralAuthorizeLogin();
      return;
    }
    let provider: Awaited<ReturnType<typeof waitForWallet>>;
    try {
      provider = await waitForWallet();
    } catch {
      // A browser without a wallet uses the same Node Passkey flow as the
      // desktop build. There is no address input or address-selection branch.
      await handleCentralAuthorizeLogin();
      return;
    }

    try {
      await handleWalletIdentityLogin(provider);
    } catch (error) {
      notifyError(
        Locale.Auth.WalletLoginFailed(
          formatCentralAuthError(error, getCentralRedirectUri()),
        ),
      );
    }
  };

  const isWalletConnectDisabled = ucanStatus === "authorized" || centralLoading;
  const isDesktopApp = isDesktopAppRuntime();
  return (
    <div className={styles["auth-page"]}>
      <TopBanner></TopBanner>
      <div
        className={styles["auth-wallet"]}
        data-runtime={isDesktopApp ? "desktop" : "web"}
      >
        <IconButton
          text={
            centralLoading
              ? Locale.Auth.Processing
              : isDesktopApp
                ? Locale.Auth.PasskeyLogin
                : Locale.Auth.Confirm
          }
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
        <span>{Locale.Auth.TopTips}</span>
      </div>
      {(isHovered || isMobile) && (
        <Delete className={styles["top-banner-close"]} onClick={handleClose} />
      )}
    </div>
  );
}
