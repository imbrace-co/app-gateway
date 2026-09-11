# App Gateway

A self-hostable API Gateway built with **Node.js**, **Express**, and **TypeScript**.

It sits in front of your microservices and handles authentication, JWT validation, request routing, and reverse-proxying — so each downstream service doesn't need to re-implement those concerns.

---

## Features

- **Authentication** — supports Bearer JWT (via external auth service) and access-token header
- **Identity injection** — resolves `org_id` / `user_id` from token and injects them into downstream requests
- **Reverse proxy** — powered by [`http-proxy-middleware`](https://github.com/chimurai/http-proxy-middleware), including WebSocket support
- **Rate limiting** — configurable per-IP request window
- **CORS** — pre-configured with broad header support, ready to customize

---

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │             App Gateway               │
                    │                                       │
Client ──── HTTP ──►│  Auth Middleware → Route Matching     │
                    │                 → Proxy Forward       │
                    └──────────────────────┬────────────────┘
                                           │
         ┌─────────┬──────────┬────────────┼───────────┬─────────────┐
         ▼         ▼          ▼            ▼           ▼             ▼
      Backend   Channel    Data Board   AI Service  Platform   Workflow
      Service   Service    Service                  Service      Engine
```

The gateway exposes a single public port (default `9001`) and routes requests to each downstream service based on URL prefix. Downstream services only need to trust a few injected headers — no token validation required on their end.

---

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn (or npm)

### Installation

```sh
git clone <repository-url>
cd app-gateway
pnpm install
```

### Configuration

```sh
cp .env.example .env
# Edit .env and point each service URL to your actual instances
```

See the [Environment Variables](#environment-variables) section for all options.

### Running

```sh
# Development — watch mode (auto-recompile on change)
pnpm dev

# Production
pnpm build
pnpm start
```

### Health check

```sh
curl http://localhost:9001/
```

```json
{
  "name": "App Gateway Public Server",
  "version": "1.0.0",
  "env": "development"
}
```

---

## Docker

### Build & run the image

```sh
docker build -t app-gateway:latest .

docker run -d \
  --name app-gateway \
  -p 9001:9001 \
  --env-file .env \
  app-gateway:latest
```

### Docker Compose

```sh
cp .env.example .env      # then edit service URLs
docker compose up --build
```

---

## Route Map

All routes pass through the gateway. Auth is enforced by default; public sub-paths listed below bypass it.

### Platform

| Path | Downstream | Notes |
|---|---|---|
| `/v1/platform/*` | `PLATFORM_SERVICE_HOST` | Public sub-paths: `/login` `/sso` `/organizations` `/access` |
| `/v2/platform/*` | `PLATFORM_SERVICE_HOST` | Public sub-paths: `/organizations` |
| `/v3/platform/*` | `PLATFORM_SERVICE_HOST` | Auth required |

> Reverse aliases `/platform/v{1,2,3}/*` are also supported.

### Channel Service

| Path | Downstream |
|---|---|
| `/channel-service/*` | `CHANNEL_SERVICE_HOST` |

Routed resources: `channels`, `conversations`, `team_conversations`, `conversation_messages`, `campaign`, `touchpoints`, `contacts`, `notifications`, `message_templates`, `whatsapp_templates`, `outbounds`, `assign`, `conversations_activities`, `categories`

### AI Service

| Path | Downstream |
|---|---|
| `/v2/ai/*`, `/ai/v2/*` | `AI_SERVICE` |
| `/v3/ai/*`, `/ai/v3/*` | `AI_SERVICE` (v3 router) |
| `/chat/ai/*` | `AI_SERVICE` |
| `/chat/ai/ws/socket.io` | `AI_CHAT_WEBSOCKET` (WebSocket) |

### Other Services

| Path | Downstream |
|---|---|
| `/data-board/*` | `DATA_BOARD_HOST` |
| `/v1/files/*`, `/files/v1/*`, `/v1/file-service/*` | `FILE_SERVICE_HOST` |
| `/files/download/*` | `FILE_SERVICE_HOST` (no auth) |
| `/v1/ips/*`, `/v2/ips/*` | `IPS_SERVICE` |
| `/v{1,2,3}/marketplaces/*` | `MARKETPLACE_SERVICE` |
| `/v1/marketplaces/download/*` | `MARKETPLACE_SERVICE` (no auth) |
| `/v2/templates/*` | `MARKETPLACE_SERVICE` |
| `/activepieces/*` | `ACTIVEPIECES_BACKEND_HOST` |
| `/predict/*` | `SERVICE_PREDICT` |
| `/v1/ai-agent/*`, `/ai-agent/*` | `MESSAGE_SUGGESTION_HOST` |
| `/3rd/*` | Third-party proxy (third-party auth) |
| `/external-webhook/*` | External webhooks (no auth) |

---

## Authentication

Auth is evaluated in this order on every protected route:

1. **Bearer JWT** — `Authorization: Bearer <token>` + `x-organization-id` header → validated against `AUTH_SERVICE_URL`
2. **Access token** — `x-access-token` header → account resolved via `GET /v1/account`; `org_id` and `user_id` injected into downstream headers
3. **Access token + org param** — `x-access-token` + `?organizationId=` query param → forwarded without account resolution

After successful auth, the gateway injects these headers into every proxied request:

| Header | Value |
|---|---|
| `x-organization-id` | Resolved organization ID |
| `x-user-id` | Resolved user ID |
| `x-access-token` | Forwarded as-is |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ENV` | `development` | Environment label |
| `VERSION` | — | App version (returned in health check) |
| `PUBLIC_SERVER_PORT` | `9001` | Port to listen on |
| `LOG_LEVEL` | `debug` | Log verbosity |
| `RATELIMIT_WINDOW` | `1800000` | Rate-limit window in ms |
| `RATELIMIT_MAX_REQUEST_PER_WINDOW` | `100` | Max requests per IP per window |
| `AI_SERVICE` | `http://localhost:7100` | AI service |
| `AI_SERVICE_PYTHON` | `http://localhost:7101` | Python AI service |
| `AI_CHAT_WEBSOCKET` | `http://localhost:7100` | AI chat WebSocket |
| `IPS_SERVICE` | `http://localhost:6006` | IPS / Scheduler service |
| `MARKETPLACE_SERVICE` | `http://localhost:9982` | Marketplace service |
| `PLATFORM_SERVICE_HOST` | `http://localhost:6040` | Platform service |
| `FILE_SERVICE_HOST` | `http://localhost:8866` | File service |
| `DATA_BOARD_HOST` | `http://localhost:8081` | Data Board service |
| `DATA_BOARD_PROXY_TOKEN` | — | Admin proxy token for Data Board |
| `MESSAGE_SUGGESTION_HOST` | `http://localhost:8082` | Message suggestion service |
| `CHANNEL_SERVICE_HOST` | `http://localhost:4100` | Channel service |
| `CHANNEL_SERVICE_ENABLED` | `true` | Enable channel service routing |
| `AUTH_SERVICE_URL` | `http://localhost:3000` | JWT validation service |
| `ACTIVEPIECES_BACKEND_HOST` | `http://localhost:3000` | Workflow backend |
| `ACTIVEPIECES_ENGINE_HOST` | `http://localhost:3001` | Workflow engine |
| `ACTIVEPIECES_WS_HOST` | `http://localhost:3000` | Workflow WebSocket |
| `ACTIVEPIECES_TRUSTED_SOURCES` | `localhost,127.0.0.1` | IPs allowed to bypass auth on `/activepieces/webhooks` and `/activepieces/socket.io` |
| `SERVICE_PREDICT` | `http://localhost:8500` | Prediction service |

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes
4. Open a pull request

---

## License

MIT — see [LICENSE](LICENSE).
