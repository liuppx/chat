import styles from "./auth.module.scss";
import { IconButton } from "./button";
import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Path, SAAS_CHAT_URL } from "../constant";
import { useAccessStore } from "../store";
import Locale from "../locales";
import Delete from "../icons/close.svg";
import Arrow from "../icons/arrow.svg";
import Logo from "../icons/logo.svg";
import { useMobileScreen } from "@/app/utils";
import BotIcon from "../icons/bot.svg";
import { getClientConfig } from "../config/client";
import { PasswordInput, showToast } from "./ui-lib";
import { safeLocalStorage } from "@/app/utils";
import {
  trackSettingsPageGuideToCPaymentClick,
  trackAuthorizationPageButtonToCPaymentClick,
} from "../utils/auth-settings-events";
import clsx from "clsx";
import {
  UCAN_AUTH_EVENT,
  connectWallet,
  getCurrentAccount,
  isValidUcanAuthorization,
} from "../plugins/wallet";

const storage = safeLocalStorage();

export function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const accessStore = useAccessStore();
  const redirectTarget = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = params.get("redirect") || Path.Home;
    if (!raw.startsWith("/")) return Path.Home;
    if (raw === Path.Auth) return Path.Home;
    return raw;
  }, [location.search]);
  const goSaas = () => {
    trackAuthorizationPageButtonToCPaymentClick();
    window.location.href = SAAS_CHAT_URL;
  };
  const [ucanStatus, setUcanStatus] = useState<
    "checking" | "authorized" | "expired" | "unauthorized"
  >("checking");
  const [ucanAccount, setUcanAccount] = useState("");

  const resetAccessCode = () => {
    accessStore.update((access) => {
      access.openaiApiKey = "";
      access.accessCode = "";
    });
  }; // Reset access code to empty string

  useEffect(() => {
    if (getClientConfig()?.isApp) {
      navigate(Path.Settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshStatus = async () => {
      const account = getCurrentAccount() || "";
      const valid = await isValidUcanAuthorization();
      if (cancelled) return;
      setUcanAccount(account);
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

  const ucanActionText =
    ucanStatus === "authorized" ? "UCAN 已授权" : "连接钱包 / 授权 UCAN";

  return (
    <div className={styles["auth-page"]}>
      <TopBanner></TopBanner>
      <div className={clsx("no-dark", styles["auth-logo"])}>
        <BotIcon />
      </div>

      <div className={styles["auth-tips"]}>{Locale.Auth.Tips}</div>

      <div className={styles["auth-wallet"]}>
        {ucanAccount ? (
          <div className={styles["auth-wallet-account"]}>{ucanAccount}</div>
        ) : null}
        <IconButton
          text={ucanActionText}
          type="primary"
          onClick={() => connectWallet()}
          disabled={ucanStatus === "authorized"}
        />
      </div>

      <PasswordInput
        style={{ marginTop: "3vh", marginBottom: "3vh" }}
        aria={Locale.Settings.ShowPassword}
        aria-label={Locale.Auth.Input}
        value={accessStore.accessCode}
        type="text"
        placeholder={Locale.Auth.Input}
        onChange={(e) => {
          accessStore.update(
            (access) => (access.accessCode = e.currentTarget.value),
          );
        }}
      />

      {!accessStore.hideUserApiKey ? (
        <>
          <div className={styles["auth-tips"]}>{Locale.Auth.SubTips}</div>
          <PasswordInput
            style={{ marginTop: "3vh", marginBottom: "3vh" }}
            aria={Locale.Settings.ShowPassword}
            aria-label={Locale.Settings.Access.OpenAI.ApiKey.Placeholder}
            value={accessStore.openaiApiKey}
            type="text"
            placeholder={Locale.Settings.Access.OpenAI.ApiKey.Placeholder}
            onChange={(e) => {
              accessStore.update(
                (access) => (access.openaiApiKey = e.currentTarget.value),
              );
            }}
          />
          <PasswordInput
            style={{ marginTop: "3vh", marginBottom: "3vh" }}
            aria={Locale.Settings.ShowPassword}
            aria-label={Locale.Settings.Access.Google.ApiKey.Placeholder}
            value={accessStore.googleApiKey}
            type="text"
            placeholder={Locale.Settings.Access.Google.ApiKey.Placeholder}
            onChange={(e) => {
              accessStore.update(
                (access) => (access.googleApiKey = e.currentTarget.value),
              );
            }}
          />
        </>
      ) : null}

      <div className={styles["auth-actions"]}>
        <IconButton
          text={Locale.Auth.Confirm}
          type="primary"
          onClick={() => {
            if (accessStore.isAuthorized()) {
              navigate(redirectTarget);
              return;
            }
            showToast("请先完成登录");
          }}
        />
        <IconButton
          text={Locale.Auth.SaasTips}
          onClick={() => {
            goSaas();
          }}
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
