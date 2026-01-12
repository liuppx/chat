import { notifyError, notifySuccess } from "./show_window";
import { getServerSideConfig } from "@/app/config/server";

const config = getServerSideConfig();
console.log(`config=${JSON.stringify(config)}`);
// 等待钱包注入
export async function waitForWallet() {
  return new Promise((resolve, reject) => {
    if (typeof window.ethereum !== "undefined") {
      resolve(window.ethereum);
      return;
    }

    let attempts = 0;
    const maxAttempts = 50; // 5秒

    const interval = setInterval(() => {
      attempts++;

      if (typeof window.ethereum !== "undefined") {
        console.log("钱包检测就绪");
        clearInterval(interval);
        resolve(window.ethereum);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        reject(new Error("❌未检测到钱包"));
      }
    }, 100);
  });
}

// 连接钱包
export async function connectWallet() {
  if (localStorage.getItem("hasConnectedWallet") === "false") {
    notifyError("❌未检测到钱包，请先安装并连接钱包");
    return;
  }
  try {
    if (typeof window.ethereum === "undefined") {
      return;
    }
    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      if (Array.isArray(accounts) && accounts.length > 0) {
        const currentAccount = accounts[0];
        localStorage.setItem("currentAccount", currentAccount);
        notifySuccess(`✅钱包连接成功！\n账户: ${currentAccount}`);
        await loginWithChallenge();
      } else {
        notifyError("❌未获取到账户");
      }
    } catch (error) {
      // 类型守卫：判断是否为具有 message 和 code 的 Error 对象
      if (error && typeof error === "object" && "message" in error) {
        const err = error as {
          message?: string;
          code?: number;
          [key: string]: any;
        };
        console.log(`❌error.message=${err.message}`);
        if (
          typeof err.message === "string" &&
          err.message.includes("Session expired")
        ) {
          notifyError(
            `❌会话已过期，请打开钱包插件输入密码激活钱包状态 ${error}`,
          );
        } else if (err.code === 4001) {
          notifyError(`❌用户拒绝了连接请求 ${error}`);
        } else {
          console.error("❌未知连接错误:", error);
          notifyError(`❌连接失败，请检查钱包状态 ${error}`);
        }
      } else {
        // 处理非标准错误（比如字符串或 null）
        console.error("❌非预期的错误类型:", error);
        notifyError(`❌连接失败，发生未知错误 ${error}`);
      }
      return;
    }
  } catch (error) {
    console.error("❌连接失败:", error);
    notifyError(`❌连接失败: ${error}`);
  }
}

export function getCurrentAccount() {
  let account = localStorage.getItem("currentAccount");
  if (account === undefined || account === null) {
    account = "";
  }
  return account;
}

// 获取链 ID
export async function getChainId() {
  if (localStorage.getItem("hasConnectedWallet") === "false") {
    notifyError("❌未检测到钱包，请先安装并连接钱包");
    return;
  }
  try {
    if (typeof window.ethereum === "undefined") {
      return;
    }
    const chainId = (await window.ethereum.request({
      method: "eth_chainId",
    })) as string;

    const chainNames = {
      "0x1": "Ethereum Mainnet",
      "0xaa36a7": "Sepolia Testnet",
      "0x5": "Goerli Testnet",
      "0x1538": "YeYing Network",
    };

    const chainName =
      chainNames[chainId as keyof typeof chainNames] || "未知网络";
    return `链 ID: ${chainId}\n网络: ${chainName}`;
  } catch (error) {
    console.error("❌获取链 ID 失败:", error);
    notifyError(`❌获取链 ID 失败: ${error}`);
  }
}

// 获取余额
export async function getBalance() {
  if (localStorage.getItem("hasConnectedWallet") === "false") {
    notifyError("❌未检测到钱包，请先安装并连接钱包");
    return;
  }
  const currentAccount = getCurrentAccount();
  if (!currentAccount) {
    notifyError("❌请先连接钱包");
    return;
  }
  try {
    if (typeof window.ethereum === "undefined") {
      return;
    }
    const balance = (await window.ethereum.request({
      method: "eth_getBalance",
      params: [currentAccount, "latest"],
    })) as string;

    // 转换为 ETH
    const ethBalance = parseInt(balance, 16) / 1e18;
    return `余额: ${ethBalance.toFixed(6)} ETH\n原始值: ${balance}`;
  } catch (error) {
    console.error("❌获取余额失败:", error);
    notifyError(`❌获取余额失败: ${error}`);
  }
}

// Challenge 登录
export async function loginWithChallenge() {
  if (localStorage.getItem("hasConnectedWallet") === "false") {
    notifyError("❌未检测到钱包，请先安装并连接钱包");
    return;
  }
  const currentAccount = getCurrentAccount();
  if (!currentAccount) {
    notifyError("❌请先连接钱包");
    return;
  }
  try {
    // 1. 从后端获取 Challenge
    const body = {
      address: currentAccount,
    };
    const response = await fetch("/api/v1/public/common/auth/challenge", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    console.log(`response=${response}`);

    if (!response.ok) {
      throw new Error(
        `❌Failed to create post: ${
          response.status
        } error: ${await response.text()}`,
      );
    }
    const r = await response.json();
    const challenge = r.message;
    if (typeof window.ethereum === "undefined") {
      return;
    }
    // 2. 使用钱包签名 Challenge
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [challenge, currentAccount],
    });
    // 3. 发送签名到后端验证
    const body2 = {
      address: currentAccount,
      signature: signature,
    };
    const verifyRes = await fetch("/api/v1/public/common/auth/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body2),
    });
    if (!verifyRes.ok) {
      throw new Error("❌验证失败");
    }
    const r2 = await verifyRes.json();
    const token = r2.token;
    // 4. 保存 Token
    localStorage.setItem("authToken", token);
    notifySuccess(`✅登录成功`);
    window.location.reload();
  } catch (error) {
    console.error("❌登录失败:", error);
    notifyError(`❌登录失败: ${error}`);
  }
}

/**
 * 检查 token 是否有效
 * @param token
 * @returns
 */
export async function isValidToken(
  token: string | undefined | null,
): Promise<boolean> {
  try {
    if (token === undefined || token === null) {
      return false;
    }
    const payloadBase6 = token.split(".")[1];
    const payloadJson = atob(
      payloadBase6.replace(/-/g, "+").replace(/_/g, "/"),
    );
    const payload = JSON.parse(payloadJson);
    const currentTime = Math.floor(Date.now() / 1000); // 当前时间（秒）
    return payload.exp > currentTime;
  } catch (e) {
    // token 格式错误或无法解析
    return false;
  }
}
