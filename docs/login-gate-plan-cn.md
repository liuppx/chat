# 登录页前置方案评估（UCAN / Access Code）

本文档评估在当前架构中增加“前置登录页”的可行性与改造方案，目标是 **登录成功后才进入 Chat**，并在 **token 过期/退出登录** 时自动跳回登录页。

## 目标

- 进入 Chat 前必须通过登录校验。
- 登录成功后自动跳转到目标页面（默认 Chat）。
- token 过期或用户退出后，立即回到登录页。
- 兼容 UCAN（钱包）和 Access Code / API Key 两种授权方式。

## 现状评估

当前已具备的基础能力：

- `/auth` 页面（`app/components/auth.tsx`）：用于 Access Code / API Key 输入，但没有“统一登录”语义。
- UCAN 钱包授权（`app/plugins/wallet.ts`）：登录与退出流程完整，且已发出 `UCAN_AUTH_EVENT` 事件。
- 授权判定逻辑（`app/store/access.ts`）：`isAuthorized()` 可综合判断 Access Code、API Key 与 UCAN root 状态。
- 路由（`app/components/home.tsx`）：使用 `HashRouter`，目前未做路由级鉴权。

问题：

- 不在路由层做拦截，用户可直接进入 Chat（未登录也能进入页面，只在请求时失败）。
- token 过期后不会自动回到登录页。
- `/auth` 页面不会引导 UCAN 钱包登录，不符合“统一登录入口”的目标。

## 方案概览

### 1) 增加 Auth Gate（路由守卫）

在路由层增加鉴权判断：

- 当 `!isAuthorized()` 且当前路径不在允许清单时，跳转到 `/auth`。
- 支持 `redirect` 参数（如 `/auth?redirect=/settings`），登录成功后跳回。

允许清单建议：

- `/auth`（登录页）
- `/artifacts/*`（如需公开访问）

> 其余路径（Chat、NewChat、Mask、Settings、Plugins、MCP 等）默认都需要登录。

### 2) 统一登录页（AuthPage 扩展）

在现有 `/auth` 页面补充 UCAN 钱包登录入口：

- 展示钱包状态（未连接/已授权/过期）。
- 提供 “连接钱包 / 授权 UCAN” 按钮（调用 `connectWallet()`）。
- 保留 Access Code / API Key 输入。
- “确认/进入”按钮逻辑：如果 `isAuthorized()` 为真则跳转，否则提示错误。

### 3) token 过期与退出处理

**token 过期**

- UCAN root 过期时间保存在 `localStorage.ucanRootExp`。
- 在应用启动时读取 `ucanRootExp` 并设置定时器，到期后触发一次鉴权刷新或 `UCAN_AUTH_EVENT`。
- 在 `Auth Gate` 中监听 `UCAN_AUTH_EVENT` 和 `storage` 事件，一旦变为未授权，立即跳转到 `/auth`。

**退出登录**

- 钱包退出（`logoutWallet()`）已触发 `UCAN_AUTH_EVENT`。
- Auth Gate 检测到未授权后自动跳回登录页。
- 可考虑新增“清除 Access Code / API Key”入口（例如在登录页增加“退出”按钮）。

## 流程示意

```mermaid
flowchart TB
  A[进入任意页面] --> B{isAuthorized?}
  B -- 否 --> C[/auth 登录页]
  B -- 是 --> D[Chat / 目标页面]
  C --> E{登录成功?}
  E -- 是 --> D
  E -- 否 --> C
  F[UCAN 过期/登出] --> B
```

## 关键实现点（建议改动位置）

1) **Auth Gate / 路由守卫**
   - 文件：`app/components/home.tsx`
   - 新增 `useAuthGuard` hook：
     - 读取 `useAccessStore().isAuthorized()`。
     - 监听 `UCAN_AUTH_EVENT`、`storage`、`visibilitychange`。
     - 未授权时跳转 `/auth?redirect=<当前路径>`。

2) **AuthPage 扩展为统一登录页**
   - 文件：`app/components/auth.tsx`
   - 增加 UCAN 登录卡片：
     - 显示钱包状态与“连接钱包/授权”按钮。
   - Confirm 按钮逻辑：如果未授权，提示错误，不跳转。

3) **token 过期监控**
   - 位置：可在 `Home` 或 `useAuthGuard` 中实现：
     - 读取 `ucanRootExp`，设置 `setTimeout`。
     - 到期后清理 `localStorage` 或触发 `UCAN_AUTH_EVENT`。
     - 触发后由 Auth Gate 跳转登录页。

4) **登录成功后的跳转**
   - 在 `/auth` 读取 `redirect` 参数，默认 `/`.
   - 登录完成后执行 `navigate(redirect)`。

## 兼容性与边界

- **Access Code 模式**：仍可走 `/auth` 输入 Access Code。
- **UCAN 模式**：连接钱包 + UCAN root 有效即可视为登录成功。
- **无访问控制**：`needCode=false` 时可跳过登录页（由 Auth Gate 判定）。
- **第三方 API Key**：输入后 `isAuthorized()` 为真即可进入。

## 测试清单（建议）

- 未登录访问 `/` → 自动跳转 `/auth`。
- 登录成功后 → 自动进入 `/` 或 redirect 页面。
- 退出钱包登录 → 自动跳回 `/auth`。
- `ucanRootExp` 过期 → 自动跳回 `/auth`。
- Access Code 模式：输入后可进入，清除后回登录页。

---

如需执行落地改造，可按以上步骤逐项实现并补充 UI 文案。
