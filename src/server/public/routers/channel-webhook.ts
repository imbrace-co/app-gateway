import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

/**
 * Public (no-auth) WhatsApp webhook proxy → channel-service.
 *
 * Meta delivers the WhatsApp Cloud API webhook as an unauthenticated GET
 * (hub.challenge verification) and POST (inbound messages). The rest of
 * channel-service is fronted by `channelServiceAuthProxy` which requires an
 * API key / access token, so Meta's calls would 401. This route is mounted
 * BEFORE auth (like `/external-webhook`) and forwards to channel-service's
 * Cloud-API webhook, which both verifies (GET) and — when
 * INBOUND_INGEST_ENABLED — ingests inbound messages (POST).
 *
 * Route:      GET|POST /whatsapp-webhook
 * Proxied to: channel-service  GET|POST /v1/facebook/whatsapp/webhook
 */
const channelWhatsappWebhookProxy = createProxyMiddleware({
    target: config.channelService.host,
    changeOrigin: true,
    // Express strips the '/whatsapp-webhook' mount prefix, so the proxy sees
    // '/' (plus any query string). Rewrite the leading slash to the full
    // channel-service webhook path; the query string (hub.challenge etc.) is
    // preserved by the proxy.
    pathRewrite: {
        '^/': '/v1/facebook/whatsapp/webhook',
    },
    on: {
        proxyReq: (_proxyReq: ClientRequest, req: Request) => {
            logger.info(
                `========= /whatsapp-webhook -> channel-service: ${req.method} ${req.originalUrl}`,
            );
        },
        error: (err, req: Request) => {
            logger.error(
                `Channel webhook proxy error for ${req.method} ${req.originalUrl}:`,
                (err as Error).message,
            );
        },
    },
});

export default channelWhatsappWebhookProxy;
