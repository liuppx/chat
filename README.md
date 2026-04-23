# 项目名称

Chat（UCAN 定制版）

# 项目简介

一款 AI 聊天工具，包含 UCAN/钱包鉴权与 Router/WebDAV 代理。

# 功能特性

- 与多家大模型聊天（OpenAI/Gemini/Anthropic 等）
- UCAN + 钱包登录（可选）
- Router/WebDAV 代理转发

# 文档索引

- 用户手册：`docs/用户手册.md`
- 常见问题：`docs/常见问题.md`
- 架构 / 部署 / 安全清单：`docs/架构部署安全清单.md`
- 模型端点选择与支持机制：`docs/模型端点选择与支持机制.md`
- 用户登录总览：`docs/用户登录.md`
- 登录页前置方案评估：`docs/登录页前置方案评估.md`
- 移动端登录与双后端鉴权方案：`docs/移动端登录与双后端鉴权方案.md`
- Router 与 WebDAV 集成说明：`docs/Router与WebDAV集成说明.md`
- 数据同步：`docs/数据同步.md`
- UCAN 与 SIWE 权限设计（可扩展版）：`docs/UCAN与SIWE权限设计可扩展版.md`
- Cloudflare Pages 部署指南：`docs/CloudflarePages部署指南.md`
- Vercel 使用说明：`docs/Vercel使用说明.md`
- 文生图与上传图片聊天工作流实现说明：`docs/文生图与上传图片聊天工作流实现说明.md`
- MCP 启用机制与演进：`docs/MCP启用机制与演进.md`
- 新增翻译指南：`docs/新增翻译指南.md`
- 新用户使用流程：`docs/用户使用流程.md`

# 环境要求

- Node.js 18+（建议使用 LTS）
- npm（项目统一使用 npm 安装依赖与运行脚本）

# 本地开发

## 本地启动

```bash
cp .env.template .env
# 确保本地 router 地址指向 3011（示例）
# ROUTER_BACKEND_URL=http://localhost:3011/
# 如启用中心化 UCAN 登录，需配置 Node 认证服务地址
# CENTRAL_UCAN_AUTH_BASE_URL=http://127.0.0.1:8100
# 登录路径强制模式：auto（默认）| wallet（仅钱包）| central（仅中心化授权）
# UCAN_LOGIN_FORCE_MODE=auto
# 如使用 WebDAV 代理，请设置 WEBDAV_BACKEND_BASE_URL（仅填基础地址，不含路径）
npm install
npm run dev
```

默认端口：`3020`

## 测试机器启动

```bash
bash scripts/start-all.sh
```

# 生产部署

## 部署前准备

1) **统一使用 npm 安装依赖**。
2) 配置环境变量（`.env`）：
   - `ROUTER_BACKEND_URL`：router 鉴权后端地址  
   - `UCAN_LOGIN_FORCE_MODE`：登录路径强制模式（`auto`/`wallet`/`central`，默认 `auto`）
   - `WEBDAV_BACKEND_BASE_URL`：WebDAV 后端基础地址（**不设会导致 build 失败**，不含路径）
   - `WEBDAV_BACKEND_PREFIX`：WebDAV 路径前缀（默认 `/dav`，可选修改）

## 部署步骤（standalone）

```bash
npm install
npm run build
nohup npm start > /home/ubuntu/code/chat_UCAN/next-start.log 2>&1 &
```

默认端口：`3020`

## 反代配置（如需公网）

将 Nginx 反代指向 `127.0.0.1:3020`。  
若使用仓库脚本：`scripts/start-nginx.sh`（会复制 `scripts/https.conf`）。

## 健康检查

```bash
ss -ltnp | rg -n ":3020"
curl -s -o /dev/null -w "http=%{http_code} time=%{time_total}\n" http://127.0.0.1:3020/
```

验证静态资源缓存（生产应为长缓存）：

```bash
curl -I -k https://<你的域名>/_next/static/chunks/webpack-*.js | sed -n '1,15p'
```

# 贡献指南

欢迎提交 issue 与 PR。
