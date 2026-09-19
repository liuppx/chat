// hooks/useAuth.ts
import { useEffect, useState } from "react";
import { isCentralModeEnabled } from "../plugins/central-ucan";
import { isValidUcanAuthorization, UCAN_AUTH_EVENT } from "../plugins/wallet";
import { notifyError } from "../plugins/show_window";

export function useAuth(options?: { notify?: boolean }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const shouldNotify = options?.notify === true;
  useEffect(() => {
    let cancelled = false;
    let checkToken = 0;
    const check = async () => {
      const token = ++checkToken;
      if (
        !isCentralModeEnabled() &&
        localStorage.getItem("hasConnectedWallet") === "false"
      ) {
        if (!cancelled && token === checkToken) {
          setIsAuthenticated(false);
        }
        return;
      }
      const valid = await isValidUcanAuthorization();
      if (cancelled || token !== checkToken) return;
      if (!valid) {
        setIsAuthenticated(false);
        if (shouldNotify) {
          notifyError("未完成登录，请使用钱包或通行证完成授权");
        }
        return;
      }
      setIsAuthenticated(true);
    };
    check();
    const onAuthChange = () => {
      check();
    };
    window.addEventListener(UCAN_AUTH_EVENT, onAuthChange);
    window.addEventListener("storage", onAuthChange);
    return () => {
      cancelled = true;
      window.removeEventListener(UCAN_AUTH_EVENT, onAuthChange);
      window.removeEventListener("storage", onAuthChange);
    };
  }, [shouldNotify]);

  return isAuthenticated;
}
