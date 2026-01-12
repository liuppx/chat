export interface WebDAVQuota {
  quota: number; // 总配额
  used: number; // 已用
  available: number; // 剩余
  percentage: number; // 使用百分比
  unlimited: boolean; // 是否无限
}
export async function fetchQuota(): Promise<WebDAVQuota | undefined> {
  try {
    const response = await fetch("/api/v1/public/webdav/quota", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + localStorage.getItem("authToken"),
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP response.status:{await response.text()}`);
    }

    // 关键一步：告诉 TS “这就是 WebDAVQuota”
    const data: WebDAVQuota = await response.json();
    return data;
  } catch (error) {
    console.error("❌获取 quota 失败:", error);
  }
}
