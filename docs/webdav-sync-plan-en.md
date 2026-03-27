# WebDAV Sync Plan (UCAN)

> The unified explanation for login, wallet, UCAN, and mobile-auth behavior has been moved to [User Login](./user-login-en.md). Read that first if you need the full authorization model.

This document describes the current WebDAV sync plan, proxy vs direct mode, conflict strategy, and remaining tasks.

## Goals

- Reuse the current UCAN authorization chain for WebDAV sync.
- WebDAV sync (check / download / upload).
- Support proxy mode and direct browser mode.
- Prevent deleted sessions from reappearing.

## Sync Flow

```mermaid
flowchart TB
  subgraph Browser["Browser"]
    UI["Sync Settings / Auto Sync"]
    UCAN["UCAN Root + Invocation"]
  end
  subgraph Proxy["Next.js Proxy (Optional)"]
    DAVAPI["/api/webdav/*"]
  end
  subgraph WebDAV["WebDAV Service"]
    DAV["WebDAV Endpoint"]
  end

  UI --> UCAN
  UCAN -->|"Authorization: Bearer UCAN"| DAVAPI
  UCAN -->|"Authorization: Bearer UCAN"| DAV
  DAVAPI --> DAV
```

## Modes

### 1) Proxy mode (optional)

- Browser calls `http://<chat>/api/webdav/*`.
- Next.js forwards to `WEBDAV_BACKEND_BASE_URL + WEBDAV_BACKEND_PREFIX`.
- Good for CORS avoidance and hiding backend URL.

### 2) Direct mode (default, useProxy=false)

- Browser calls `WEBDAV_BACKEND_BASE_URL + WEBDAV_BACKEND_PREFIX` directly.
- WebDAV must support CORS and `Authorization` header.
- Good for large traffic and lower proxy load.

> Note: **Only WebDAV protocol endpoints** (MKCOL/PUT/GET/PROPFIND, etc.)
> should include `WEBDAV_BACKEND_PREFIX`, so third‑party WebDAV clients can mount correctly.
> Other service APIs (quota, SIWE, UCAN, etc.) **must NOT** add the prefix and should use the base URL.

## UCAN Requirements

- `aud` must match the backend configuration:
  - `did:web:<host>` (derived from `WEBDAV_BACKEND_BASE_URL`).
- `capability` must include backend-required permissions (e.g. `app:all:<appId> + write`).
- When the backend enforces `required_resource=app:*`, the client must include `app:all:<appId>`
  and keep requests under `/apps/<appId>/...`.
- Root UCAN SIWE statement carries `service_hosts.router/webdav` for approval display.
- If current config does not match `service_hosts` in Root UCAN, frontend forces re-authorization.

## Boundary with the Login Document

This document only keeps sync-specific behavior:

- how sync traffic uses UCAN
- proxy vs direct mode
- merge rules, tombstones, and remaining sync risks

The following cross-cutting topics are intentionally kept in [User Login](./user-login-en.md):

- wallet login overview
- Root / Session / Invocation lifecycle
- browser storage layout
- wallet unlock vs re-authorization rules

## Chat Sync Rule (Plan A)

- **Only sync completed messages**: `status=done` / `status=error` are uploaded.
- **Streaming is excluded**: `status=streaming` messages are not synced.
- **Session-level filter**: if a session contains any streaming message, the session is not uploaded (avoid partial state).
- **Empty response filtered**: `empty response` messages are not uploaded.
- **Merge precedence**: for the same message ID, newer `updatedAt` (or `date`) wins.
- **Auto sync is delayed** while any streaming message exists.

## Delete Tombstone

Tombstone is enabled to prevent deleted sessions from reappearing:

- Deleting a session writes `deletedSessions` (id -> timestamp).
- Merge applies tombstones before merging sessions.
- Tombstones are kept for 30 days by default.

**Conflict policy: update-wins**  
If a session has a newer `lastUpdate` than the delete timestamp, the update overrides deletion and the session is kept.

## Key Configs

- `WEBDAV_BACKEND_BASE_URL`: WebDAV base URL (required, no path)
- `WEBDAV_BACKEND_PREFIX`: path prefix (default `/dav`, optional to change)
- `WebDAV app action`: fixed to `write`
- `Router UCAN capability`: `app:all:<appId> + invoke`
- `WebDAV UCAN capability`: `app:all:<appId> + write`
- `appId`: derived from frontend host (for example, `localhost:3020 -> localhost-3020`)
- Sync setting: `useProxy` (off = direct mode)
- Sync settings page shows and allows editing of WebDAV Base URL/Prefix to override env defaults

Default values (this project):

- WebDAV Auth = UCAN
- Proxy = off
- Auto Sync = on

## Remaining Tasks / Risks

### Must

- **CORS allowlist** for direct mode (e.g. `http://localhost:3020`).
- **UCAN alignment** between frontend and backend (`aud` + `with/can`, compat with `resource/action`).
- **Direct-mode verification** (Network shows direct requests to `WEBDAV_BACKEND_BASE_URL + WEBDAV_BACKEND_PREFIX`).

### Recommended

- **Observability**: log `useProxy/authType/backendUrl` (debug is in place).
- **Conflict policy**: decide delete-vs-update precedence for multi-device.
- **Tombstone cleanup**: adjust TTL if needed.
- **Large file handling**: add rate limit / audit on WebDAV.
- **Plan C (Outbox / incremental events)**: only sync completed message events to reduce conflicts and bandwidth.
