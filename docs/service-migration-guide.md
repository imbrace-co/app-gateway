# Service Migration Guide — Frontend Host Replacement

This document is the reference for the frontend team when switching API calls from the
backend monolith to dedicated microservices.

All calls go through the **App Gateway** (`NEXT_PUBLIC_GATEWAY_HOST` / `https://<your-gateway-host>/api`).
The frontend changes **path prefix only** — the host stays the same.

---

## How the gateway forwards identity

The gateway validates the frontend's `x-access-token`, resolves the account from the backend,
and injects identity headers into every proxied request:

| Header | Source |
|---|---|
| `x-organization-id` | Resolved from token via `GET /v1/account` |
| `x-user-id` | Resolved from token via `GET /v1/account` |
| `x-access-token` | Forwarded as-is from the original request |

Microservices should trust these headers directly — no `X-Internal-Request` flag needed.
Old URL path params like `/org/{orgId}/channels` or `/channel/{orgId}/_web` are removed.

---

## How routing works

```
Frontend → App Gateway → Microservice (or Backend fallback)
```

Each microservice now has a dedicated path prefix in the gateway.
Old `/v1/backend/*` paths are kept as **backward-compat aliases** and will be removed
once the frontend has fully migrated to the canonical paths below.

### Path conventions

Two equivalent conventions are supported for all versioned routes:

```
/vN/{service}/{resource}/...     ← original convention
/{service}/vN/{resource}/...     ← new reverse-alias convention (same target, same auth)
```

The reverse aliases (`/service/vN`) were added in parallel with the existing routes.
**Old routes are unchanged** — the mirrors will replace them once stable.

For dedicated microservice routes where the service owns its own versioning, the canonical path is:

```
/{service-name}/{service-own-version}/{resource}/...
```

Example:
```
GET /channel-service/v1/channels/:id
     ↑ service name  ↑ service version (owned by channel-service)
```

> No gateway-level version prefix — the service version in the path is sufficient.

---

## 1. Channel-service

**Canonical gateway prefix:** `/channel-service`
**Deprecated alias (still works):** `/v1/channel-service`
**Backend aliases (kept for compat):** `/v1/backend/{resource}`, `/v2/backend/{resource}`, `/v3/backend/channels`
**Reverse backend aliases (also work):** `/backend/v1/{resource}`, `/backend/v2/{resource}`, `/backend/v3/channels`

The service owns its own version — include it directly after `/channel-service`:

| Canonical path (use this) | Old alias (still works) | Status |
|---|---|---|
| `/channel-service/v1/channels/*` | `/v1/backend/channels/*` | ✅ Live |
| `/channel-service/v2/channels/*` | `/v2/backend/channels/*` | ✅ Live |
| `/channel-service/v3/channels/*` | `/v3/backend/channels/*` | ✅ Live |
| `/channel-service/v1/conversations/*` | `/v1/backend/conversations/*` | ✅ Live |
| `/channel-service/v2/conversations/*` | `/v2/backend/conversations/*` | ✅ Live |
| `/channel-service/v1/team_conversations/*` | `/v1/backend/team_conversations/*` | ✅ Live |
| `/channel-service/v2/team_conversations/*` | `/v2/backend/team_conversations/*` | ✅ Live |
| `/channel-service/v1/conversation_messages/*` | `/v1/backend/conversation_messages/*` | ✅ Live |
| `/channel-service/v1/campaign/*` | `/v1/backend/campaign/*` | ✅ Live |
| `/channel-service/v1/touchpoints/*` | `/v1/backend/touchpoints/*` | ✅ Live |
| `/channel-service/v1/touchpoint/*` | `/v1/backend/touchpoint/*` | ✅ Live |
| `/channel-service/v1/contacts/*` | `/v1/backend/contacts/*` | ✅ Live |
| `/channel-service/v1/contact/*` | `/v1/backend/contact/*` | ✅ Live |
| `/channel-service/v1/notifications/*` | `/v1/backend/notifications/*` | ✅ Live |
| `/channel-service/v1/message_templates/*` | `/v1/backend/message_templates/*` | ✅ Live |
| `/channel-service/v2/message_templates/*` | `/v2/backend/message_templates/*` | ✅ Live |
| `/channel-service/v1/whatsapp_templates/*` | `/v1/backend/whatsapp_templates/*` | ✅ Live |
| `/channel-service/v2/whatsapp_templates/*` | `/v2/backend/whatsapp_templates/*` | ✅ Live |
| `/channel-service/v1/outbounds/*` | `/v1/backend/outbounds/*` | ✅ Live |
| `/channel-service/v1/assign/*` | `/v1/backend/assign/*` | ✅ Live |
| `/channel-service/v1/conversations_activities/*` | `/v1/backend/conversations_activities/*` | ✅ Live |
| `/channel-service/v1/categories/*` | `/v1/backend/categories/*` | ✅ Live |

> **Path rewrite:** Express strips the `/channel-service` mount prefix before forwarding.
> `GET /channel-service/v1/channels/abc` is forwarded as `GET /v1/channels/abc` — no additional rewrite.

---

## 2. Data Board

**Canonical gateway prefix:** `/data-board`
**Deprecated aliases (still work):** `/v1/data-board`
**Old backend aliases (kept for compat):** `/v1/backend/board/*`, `/v1/backend/link_preview/*`, `/v1/backend/meilisearch/*`
**Reverse backend aliases (also work):** `/backend/v1/board/*`, `/backend/v1/link_preview/*`, `/backend/v1/meilisearch/*`

Data-board uses no version prefix — resources are directly after `/data-board`:

| Canonical path (use this) | Old alias (still works) | Notes |
|---|---|---|
| `GET /data-board/boards` | `GET /v1/backend/board` | ✅ Live |
| `POST /data-board/boards` | `POST /v1/backend/board` | ✅ Live |
| `GET /data-board/boards/:id` | `GET /v1/backend/board/:id` | ✅ Live |
| `PUT /data-board/boards/:id` | `PUT /v1/backend/board/:id` | ✅ Live |
| `DELETE /data-board/boards/:id` | `DELETE /v1/backend/board/:id` | ✅ Live |
| `GET /data-board/boards/:id/fields` | `GET /v1/backend/board/:id/board_fields` | ✅ Live |
| `POST /data-board/boards/:id/fields` | `POST /v1/backend/board/:id/board_fields` | ✅ Live |
| `PUT /data-board/boards/:id/fields/:fieldId` | `PUT /v1/backend/board/:id/board_fields/:fieldId` | ✅ Live |
| `DELETE /data-board/boards/:id/fields/:fieldId` | `DELETE /v1/backend/board/:id/board_fields/:fieldId` | ✅ Live |
| `POST /data-board/boards/:id/fields/reorder` | `PUT /v1/backend/board/:id/board_fields/_order` | ⚠️ Method changed POST |
| `PUT /data-board/boards/:id/fields/bulk` | `PUT /v1/backend/board/:id/multiple_board_fields` | ✅ Live |
| `GET /data-board/boards/:boardId/items` | `GET /v1/backend/board/:boardId/board_items` | ✅ Live |
| `POST /data-board/boards/:boardId/items` | `POST /v1/backend/board/:boardId/board_items` | ✅ Live |
| `GET /data-board/boards/:boardId/items/:id` | `GET /v1/backend/board/:boardId/board_items/:id` | ✅ Live |
| `PUT /data-board/boards/:boardId/items/:id` | `PUT /v1/backend/board/:boardId/board_items/:id` | ✅ Live |
| `DELETE /data-board/boards/:boardId/items/:id` | `DELETE /v1/backend/board/:boardId/board_items/:id` | ✅ Live |
| `DELETE /data-board/boards/:boardId/items/bulk-delete` | `DELETE /v1/backend/board/delete/:boardId/board_items` | ⚠️ Path changed |
| `GET /data-board/boards/:boardId/items/:id/related/:relatedBoardId` | `GET /v1/backend/board/:boardId/board_items/:id/related_boards/:relatedId/board_items` | ⚠️ Path changed |
| `POST /data-board/boards/:boardId/items/:id/related` | `POST /v1/backend/board/:boardId/board_items/:id/related_boards/:relatedId/link` | ⚠️ Path changed |
| `DELETE /data-board/boards/:boardId/items/:id/related` | `POST /v1/backend/board/:boardId/board_items/:id/related_boards/:relatedId/unlink` | ⚠️ Path+method changed |
| `GET /data-board/boards/by-contact/:contactId` | `GET /v1/backend/board/contact/:contactId` | ⚠️ Path changed |
| `GET /data-board/link_preview/getWebsiteInfo` | `GET /v1/backend/link_preview/getWebsiteInfo` | ✅ Live |
| `GET /data-board/meilisearch/:boardId/search` | `GET /v1/backend/meilisearch/:boardId/search` | ✅ Live |

> **Path rewrite:** Express strips `/data-board`, then `^/ → /api/` is applied.
> `GET /data-board/boards/123` is forwarded as `GET /api/boards/123`.

### Still on backend (not yet in data-board)
| Path | Notes |
|---|---|
| `POST/GET /v1/backend/board/:id/export_csv` | Not implemented |
| `POST /v1/backend/board/:id/import_csv` | Not implemented |
| `POST /v1/backend/board/:id/import_excel` | Not implemented |
| `GET /v1/backend/board/:id/import_progress` | Not implemented |
| `GET/POST /v1/backend/board/:id/segmentation` | Not implemented |
| `GET/PUT/DELETE /v1/backend/board/:id/segmentation/:segId` | Not implemented |
| `GET /v1/backend/board/:boardId/board_items/:id/_is_conflicted` | Not implemented |

---

## 3. Marketplace

Marketplace already uses dedicated paths — no change needed.

| Frontend path | Reverse alias | Status |
|---|---|---|
| `/v1/marketplaces/*` | `/marketplaces/v1/*` | ✅ Live |
| `/v2/marketplaces/*` | `/marketplaces/v2/*` | ✅ Live |
| `/v3/marketplaces/*` | `/marketplaces/v3/*` | ✅ Live |
| `/v2/templates/*` | `/templates/v2/*` | ✅ Live |

---

## 4. File-service

**Canonical gateway prefix:** `/v1/file-service`
**Legacy prefixes (still work):** `/v1/files`, `/files/v1`

| Canonical path (use this) | Old path | Status |
|---|---|---|
| `POST /v1/file-service/*` | `POST /v1/files/*` | ✅ Live |
| `POST /v1/channel-service/v1/conversation_messages/_fileupload` | `/v1/backend/conversation_messages/_fileupload` | ✅ Live (via channel) |
| `POST /v1/channel-service/v1/channels/_fileupload` | `/v1/backend/channels/_fileupload` | ✅ Live (via channel) |

> **Path rewrite:** Express strips the mount prefix, then `^/ → /api/v1/` is applied.
> `POST /v1/file-service/upload` is forwarded as `POST /api/v1/upload`.

---

## 5. IPS (Scheduler)

IPS already uses a dedicated path — no change needed.

| Frontend path | Reverse alias | Status |
|---|---|---|
| `/v1/ips/*` | `/ips/v1/*` | ✅ Live |
| `/v2/ips/*` | `/ips/v2/*` | ✅ Live |

---

## 6. AI Service

AI already uses a dedicated path — no change needed.

| Frontend path | Reverse alias | Status |
|---|---|---|
| `/v2/ai/*` | `/ai/v2/*` | ✅ Live |
| `/v3/ai/*` | `/ai/v3/*` | ✅ Live |
| `/chat/ai/*` | — | ✅ Live |

---

## 7. Platform (Auth / Users / Orgs)

Still routed through backend. No frontend change needed.

| Frontend path | Reverse alias | Status |
|---|---|---|
| `/v1/platform/*` | `/platform/v1/*` | ✅ Live |
| `/v2/platform/*` | `/platform/v2/*` | ✅ Live |
| `/v3/platform/*` | `/platform/v3/*` | ✅ Live |

Public sub-paths (no auth required):

| Path | Notes |
|---|---|
| `/v1/platform/login/*` | ✅ No auth |
| `/v1/platform/sso/*` | ✅ No auth |
| `/v1/platform/organizations/*` | ✅ No auth |
| `/v1/platform/access/*` | ✅ No auth |

---

## 8. Still on Backend (no migration planned yet)

| Domain | Notes |
|---|---|
| Workflows / n8n | n8n removal is a separate breaking-change branch |
| Knowledge base | Pending chat-ai integration |
| Physical stores | Deferred |
| Resources | Deferred |
| Business units | Deferred |

---

## Path changes requiring frontend update

These canonical paths differ structurally from the old backend paths.
Frontend must use the new path — the old alias does NOT exist for these:

| Old backend path | Canonical path | Service | Change |
|---|---|---|---|
| `PUT /v1/backend/board/:id/board_fields/_order` | `POST /data-board/boards/:id/fields/reorder` | data-board | Method: PUT→POST |
| `POST .../related_boards/:relatedId/link` | `POST /data-board/boards/:boardId/items/:id/related` | data-board | Simplified path |
| `POST .../related_boards/:relatedId/unlink` | `DELETE /data-board/boards/:boardId/items/:id/related` | data-board | Method: POST→DELETE |
| `DELETE /v1/backend/board/delete/:boardId/board_items` | `DELETE /data-board/boards/:boardId/items/bulk-delete` | data-board | Path restructured |
| `GET /v1/backend/board/contact/:contactId` | `GET /data-board/boards/by-contact/:contactId` | data-board | Path restructured |

---

## Environment variables (gateway)

| Service | Env var | Default |
|---|---|---|
| Backend | `BACKEND_PUBLIC_HOST` | `localhost:9981` |
| Channel-service | `CHANNEL_SERVICE_HOST` | `http://localhost:4100` |
| Data-board | `DATA_BOARD_HOST` | `http://localhost:8081` |
| Marketplace | `MARKETPLACE_SERVICE` | `localhost:6006` |
| File-service | `FILE_SERVICE_HOST` | `http://localhost:8080` |
| IPS | `IPS_SERVICE` | `localhost:6006` |
| Workflow-engine | `WORKFLOW_HOST` | `localhost:5678` |
