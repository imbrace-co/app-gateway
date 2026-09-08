/**
 * Request Context (AsyncLocalStorage) — Express variant.
 *
 * Holds per-request correlation data so any code on the call stack can attach
 * the same `request_id`, `ip`, `method`, `path` and `proxy` to its log lines.
 *
 * Populated once per request by `middlewares/requestContext.ts`, read by the
 * structured logger (`logging/logger.ts`).
 *
 * This is the reusable Express template for the observability rollout
 * (mirrors data-board's Hono version; same field schema, same headers).
 */

import { AsyncLocalStorage } from "async_hooks";

/** Canonical correlation-id header. Same name on every service & every hop. */
export const REQUEST_ID_HEADER = "x-request-id";

/** Header naming the immediate upstream that proxied the request. */
export const PROXY_HEADER = "x-proxy";

export interface RequestContext {
  requestId: string;
  ip: string;
  method: string;
  path: string;
  proxy: string;
  /** epoch ms when the request entered — used for response_time. */
  startTime: number;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return als.getStore();
}

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId;
}
