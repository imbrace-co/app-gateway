/**
 * Request Context Middleware (Express) — register FIRST, before everything.
 *
 * As the EDGE, app-gateway:
 *  - reuses an inbound `x-request-id` if present & sane, else mints a UUIDv4;
 *  - records the gateway's own `proxy` as the inbound `x-proxy` (or "client");
 *  - MUTATES `req.headers` to set `x-request-id` + `x-proxy: app-gateway`, so
 *    every downstream `http-proxy-middleware` proxy forwards them automatically
 *    — no per-router proxyReq edits needed;
 *  - echoes `x-request-id` back to the client;
 *  - binds a RequestContext for the request's async tree (logging + finish hook).
 */

import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";
import {
  runWithContext,
  REQUEST_ID_HEADER,
  PROXY_HEADER,
  type RequestContext,
} from "../logging/requestContext";

const SERVICE_NAME = process.env.SERVICE_NAME || "app-gateway";

function headerStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function resolveIp(req: Request): string {
  const fwd = headerStr(req.headers["x-forwarded-for"]);
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress ?? "";
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = headerStr(req.headers[REQUEST_ID_HEADER]);
  const requestId =
    incoming && incoming.length > 0 && incoming.length <= 64
      ? incoming
      : randomUUID();

  // What proxied US (for the gateway's own logs) — usually the client direct.
  const inboundProxy = headerStr(req.headers[PROXY_HEADER]) ?? "client";

  // Mutate the inbound headers so ALL downstream proxies forward them.
  req.headers[REQUEST_ID_HEADER] = requestId;
  req.headers[PROXY_HEADER] = SERVICE_NAME;

  // Echo back to the client.
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const ctx: RequestContext = {
    requestId,
    ip: resolveIp(req),
    method: req.method,
    path: (req.originalUrl || req.url || "").split("?")[0],
    proxy: inboundProxy,
    startTime: Date.now(),
  };

  runWithContext(ctx, () => next());
}

export default requestContext;
