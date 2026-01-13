// hooks/useAuth.ts
import { useEffect, useState } from "react";
import { isValidToken } from "../plugins/wallet";
import { refreshAccessToken, clearAccessToken } from "@yeying-community/web3";
import { notifyError } from "../plugins/show_window";

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  useEffect(() => {
    const check = async () => {
      if (localStorage.getItem("hasConnectedWallet") === "false") {
        notifyError("❌未检测到钱包，请先安装并连接钱包");
        setIsAuthenticated(false);
        return;
      }
      const token = localStorage.getItem("authToken");
      if (token === undefined || token === null) {
        setIsAuthenticated(false);
        notifyError("❌token 为空，请连接钱包生成 token");
        return;
      }
      const valid = await isValidToken(token);
      if (!valid) {
        try {
          await refreshAccessToken({
            baseUrl: "/api/v1/public/auth",
            refreshPath: "refresh",
            tokenStorageKey: "authToken",
          });
          const refreshed = localStorage.getItem("authToken");
          if (refreshed && (await isValidToken(refreshed))) {
            setIsAuthenticated(true);
            return;
          }
        } catch (error) {
          clearAccessToken({ tokenStorageKey: "authToken" });
        }
        setIsAuthenticated(false);
        notifyError("❌token 过期，请重新连接钱包生成 token");
        return;
      }
      setIsAuthenticated(true);
    };
    check();
  }, []);

  return isAuthenticated;
}
