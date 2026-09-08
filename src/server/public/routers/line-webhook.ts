import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

/**
 * Public (no-auth) LINE webhook proxy → channel-service.
 *
 * LINE delivers Messaging-API events as an unauthenticated POST signed with the
 * `X-Line-Signature` header (HMAC-SHA256 of the raw body). The rest of
 * channel-service is fronted by an auth proxy that requires an API key / access
 * token, so LINE's callback would 401. Mount BEFORE auth (like the WhatsApp /
 * WeChat webhooks) and forward to channel-service's LINE webhook, which
 * verifies the signature and — when INBOUND_INGEST_ENABLED — ingests the events.
 *
 * LINE posts application/json, which the gateway does NOT parse globally (only
 * express.text({type:'text/*'}) + urlencoded run), so the raw body streams
 * through untouched — the signature (computed over the raw body) stays valid.
 * No body re-stream needed (unlike the WeChat text/xml proxy).
 *
 * Route:      POST /line-webhook
 * Proxied to: channel-service  POST /v1/line/webhook
 */
const channelLineWebhookProxy = createProxyMiddleware({
    target: config.channelService.host,
    changeOrigin: true,
    // Express strips the '/line-webhook' mount prefix, so the proxy sees '/'.
    // Rewrite the leading slash to the full channel-service webhook path.
    pathRewrite: {
        '^/': '/v1/line/webhook',
    },
    on: {
        proxyReq: (_proxyReq: ClientRequest, req: Request) => {
            logger.info(
                `========= /line-webhook -> channel-service: ${req.method} ${req.originalUrl}`,
            );
        },
        error: (err, req: Request) => {
            logger.error(
                `LINE webhook proxy error for ${req.method} ${req.originalUrl}:`,
                (err as Error).message,
            );
        },
    },
});

export default channelLineWebhookProxy;
