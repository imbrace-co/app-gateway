import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

/**
 * Public (no-auth) Instagram webhook proxy → channel-service.
 *
 * Meta delivers the Instagram messaging webhook as an unauthenticated GET
 * (hub.challenge verification) and POST (inbound messages/comments). The rest of
 * channel-service is fronted by `channelServiceAuthProxy` which requires an
 * API key / access token, so Meta's calls would 401. This route is mounted
 * BEFORE auth (mirrors `/whatsapp-webhook`) and forwards to channel-service's
 * Instagram webhook, which verifies (GET) and ingests inbound events (POST).
 *
 * Route:      GET|POST /instagram-webhook
 * Proxied to: channel-service  GET|POST /v1/instagram/webhook
 */
const channelInstagramWebhookProxy = createProxyMiddleware({
    target: config.channelService.host,
    changeOrigin: true,
    // Express strips the '/instagram-webhook' mount prefix, so the proxy sees
    // '/' (plus any query string). Rewrite the leading slash to the full
    // channel-service webhook path; the verification query string
    // (hub.mode/hub.verify_token/hub.challenge) is preserved by the proxy.
    pathRewrite: {
        '^/': '/v1/instagram/webhook',
    },
    on: {
        proxyReq: (_proxyReq: ClientRequest, req: Request) => {
            logger.info(
                `========= /instagram-webhook -> channel-service: ${req.method} ${req.originalUrl}`,
            );
        },
        error: (err, req: Request) => {
            logger.error(
                `Instagram webhook proxy error for ${req.method} ${req.originalUrl}:`,
                (err as Error).message,
            );
        },
    },
});

export default channelInstagramWebhookProxy;
