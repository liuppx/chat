# Router 与 WebDAV 集成说明

> 登录/授权/钱包/UCAN 的统一说明已收口到 [用户登录](./用户登陆.md)。若你要先理解当前机制，请优先阅读该文档。


本文档说明当前 Chat 如何通过 UCAN 同时集成 Router 与 WebDAV，以及关键调用链路与配置点。

## 集成目标

- 通过一次钱包授权（UCAN Root），同时访问多个后端（Router + WebDAV）。
- Router 提供 OpenAI-compatible API；WebDAV 提供存储与配额服务。
- Next.js 承担前端与部分 API 代理层（WebDAV 同步代理）。

## 调用链路

```mermaid
flowchart TB
  subgraph Browser["浏览器"]
    UI["Next.js 前端<br/>- 钱包连接<br/>- Root UCAN<br/>- Invocation UCAN"]
  end
  subgraph Proxy["Next.js API 代理"]
    WEBDAVSYNC["/api/webdav/*"]
  end
  subgraph Backends["后端服务"]
    ROUTER["Router<br/>OpenAI-compatible"]
    WEBDAV["WebDAV<br/>Storage/Quota + /api/v1/public/webdav/quota"]
  end

  UI -->|"Authorization: Bearer UCAN"| ROUTER
  UI -->|"Authorization: Bearer UCAN"| WEBDAV
  UI -->|"Authorization: Bearer UCAN"| WEBDAVSYNC
  WEBDAVSYNC --> WEBDAV
```

## Router 集成

- **入口**：`app/client/platforms/openai.ts` 在请求 Router 相关接口时生成 Invocation UCAN。
- **请求头**：`Authorization: Bearer <UCAN>`。
- **访问方式**：前端直连 Router，不经过 Chat 的 auth 代理路由。
- **受众 (audience)**：自动按 Router 地址推导 `did:web:<router-host>`。

## WebDAV 集成

- **配额接口**：`app/plugins/webdav.ts` 使用 `authUcanFetch` 直连 `WEBDAV_BACKEND_BASE_URL + /api/v1/public/webdav/quota`（不经过 Next 代理）。
- **同步接口**：`/api/webdav/*` 负责 WebDAV 文件同步，代理到 `WEBDAV_BACKEND_BASE_URL + WEBDAV_BACKEND_PREFIX`，限制方法与目标路径，避免 SSRF。
- **请求头**：配额请求由浏览器直接发起，需由 WebDAV 服务端正确配置 CORS 与鉴权头放行。
- **受众 (audience)**：自动按 WebDAV 地址推导 `did:web:<webdav-host>`。
- **应用能力**：默认携带 `app:<appId>`（`appId` 默认当前域名）。
> 说明：`WEBDAV_BACKEND_PREFIX` 仅用于 WebDAV 协议接口路径，便于兼容第三方 WebDAV 客户端。
> quota / SIWE / UCAN 等 HTTP 接口不加前缀，仍走基础地址。

## WebDAV 直连（不走代理）

当关闭同步代理时，浏览器会直接请求 WebDAV 服务，不再经过 `/api/webdav/*`：

### 启用方式

1) 设置 `WEBDAV_BACKEND_BASE_URL` 为可公网访问的 WebDAV 基础地址（含协议，不含路径）。
2) 设置「同步配置」中的 **Proxy** 为关闭（`useProxy = false`）。
3) 如服务挂载在路径下，设置 `WEBDAV_BACKEND_PREFIX`（例如 `/dav`）。
4) 确保 WebDAV 服务支持 UCAN 鉴权与 CORS。

### 直连要求（必须满足）

- WebDAV 端允许跨域，并放行 `Authorization`、`Depth`、`Content-Type` 等头。
- WebDAV 端开放 `MKCOL/PUT/GET/PROPFIND` 等必要方法。
- WebDAV 端的 UCAN `aud` 与前端配置一致。

### 注意事项

- 直连会暴露 WebDAV 地址，安全与风控要求更高。
- 本地地址（如 `127.0.0.1`）只对本机有效，远端浏览器无法访问。

## 与登录文档的边界

本文档只保留 Router / WebDAV 集成实现本身：

- Router 如何生成并附带 Invocation UCAN
- WebDAV 是直连还是走 `/api/webdav/*` 代理
- `audience` / `capabilities` / 代理边界 / CORS 约束

以下通用内容不在本文重复展开，请统一参考 [用户登录](./用户登陆.md)：

- Root / Session / Invocation 的概念
- UCAN 的本地存储位置
- 为什么会提示“解锁钱包”
- 什么时候只解锁，什么时候必须重新授权

## 关键配置项

- `ROUTER_BACKEND_URL`: Router 默认后端地址（可选，前端默认值）
- `WEBDAV_BACKEND_BASE_URL`: WebDAV 后端基础地址（必填，不含路径）
- `WEBDAV_BACKEND_PREFIX`: WebDAV 路径前缀（默认 `/dav`，可选修改）
- `WebDAV app action`: 固定为 `write`
- `通用 UCAN 能力`: 固定为 `profile/read`

## 安全要点

- WebDAV 同步代理限制方法与目标路径，避免 SSRF。
- 配额接口为浏览器直连，必须在 WebDAV 端严格限制跨域来源与头部。
- UCAN `aud` 必须与后端配置保持一致。
