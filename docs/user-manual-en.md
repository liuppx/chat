# User Manual

This document introduces the current system architecture, authorization flow, and core features.

## System Overview

This system is built with Next.js (frontend) and integrates YeYing Wallet with the `@yeying-community/web3-bs` SDK. Authentication has been migrated from SIWE to UCAN, enabling a single wallet authorization to access multiple backends (Router and WebDAV).

Core components:

- Frontend: Next.js (this project)
- Wallet: YeYing Wallet (EIP-1193)
- Auth: UCAN (Root + Invocation)
- Backends: Router (OpenAI-compatible), WebDAV (storage)

## Authorization Flow (UCAN)

1. After connecting the wallet, the frontend requests a UCAN session key from the wallet.
2. A Root UCAN is created using a SIWE-based wallet signature and stored locally.
3. For each request, an Invocation UCAN is generated and sent as `Authorization: Bearer <UCAN>`.

The Root UCAN can be reused across multiple backends, while Invocation UCANs are minted per backend with the proper `audience` and `capabilities`.

## Multi-backend Login

With a single authorization, the system can access:

- Router: OpenAI-compatible APIs (models, chat, usage, etc.)
- WebDAV: storage and quota endpoints

Invocation UCANs are generated per target backend and attached automatically.

## Configuration

Key environment variables:

- `WEBDAV_BACKEND_BASE_URL`: WebDAV base URL (no path)
- `WEBDAV_BACKEND_PREFIX`: path prefix (default `/dav`, optional to change)
- `ROUTER_BACKEND_URL`: Router backend URL
- Shared UCAN caps: fixed to `profile/read`
- `NEXT_PUBLIC_WEBDAV_UCAN_AUD`: WebDAV audience override (optional)
- `NEXT_PUBLIC_ROUTER_UCAN_AUD`: Router audience override (optional)

If `*_UCAN_AUD` is not set, the system derives `did:web:<host>` from the backend URL.

Note: `WEBDAV_BACKEND_PREFIX` is only for WebDAV protocol paths (third‑party WebDAV client mounting).
Quota / SIWE / UCAN HTTP APIs should not include the prefix.

## Local Storage

UCAN-related local storage keys:

- `localStorage`
  - `currentAccount`: current wallet address
  - `ucanRootExp`: Root UCAN expiration (ms)
  - `ucanRootIss`: Root UCAN issuer
- `IndexedDB`
  - DB: `yeying-web3`
  - Store: `ucan-sessions` (Root UCAN + session metadata)

When the Root UCAN expires or the wallet account changes, re-authorization is required.

## UCAN Token Lifetime, Refresh, and Wallet Unlock

### Token lifecycle (current implementation)

- **Root UCAN**: default TTL is **24 hours** (`@yeying-community/web3-bs` default `24 * 60 * 60 * 1000`).
- **Invocation UCAN**: default TTL is **5 minutes** (minted per request, default `5 * 60 * 1000`).
- **Wallet UCAN Session Key**: `expiresAt` comes from the wallet; the frontend keeps a short cache and renews near expiry.

### Refresh behavior after login

- **Router requests**: automatically try to get/refresh the UCAN session, then mint a new Invocation UCAN.
- **WebDAV sync**: reuses current session first; if session is unavailable, requests fail and are retried in later interactions.
- **Root UCAN**: not renewed forever in the background; if root expires, account changes, or capabilities mismatch, re-authorization is required.

### Why wallet unlock is required

Seeing a wallet unlock prompt after being idle or switching pages is usually expected security behavior, not a Chat-only fault. Common causes:

1. Wallet extension auto-lock policy (idle timeout, background state, etc.).
2. UCAN session has expired and must be requested again from wallet.
3. Wallet signing is needed (for example, rebuilding Root UCAN or issuing session-related capabilities).

In short: **private key/signing capability is protected by the wallet**, and the frontend cannot bypass unlock.

### Unlock-only vs re-authorize

- **Unlock only**: Root UCAN is still valid, account is unchanged, and capabilities still match.
- **Re-authorize required**: `ucanRootExp` expired, `currentAccount` does not match Root issuer, or capability set changed.

## Run & Port

Dev server runs on port `3020`:

```bash
npm run dev
```

Production:

```bash
npm run build
npm run start
```
