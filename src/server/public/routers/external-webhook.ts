import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

/**
 * External Webhook Proxy — forwards provider webhook notifications to IPS.
 *
 * No authentication required — external providers (Google Calendar, etc.)
 * send push notifications directly to this endpoint.
 *
 * Route: POST /external-webhook/:provider
 * Proxied to: IPS /api/v1/external-data-sync/webhook/:provider
 */
const externalWebhookProxy = createProxyMiddleware({
    target: config.ips.host,
    changeOrigin: true,
    pathRewrite: {
        '^/': '/api/v1/external-data-sync/webhook/',
    },
    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            console.log(`========= /external-webhook:`);
            console.log(`   Original URL: ${req.originalUrl}`);
            console.log(`   Request Path: ${req.path}`);
            console.log(`   Target: ${config.ips.host}`);
            console.log(`   Method: ${req.method}`);
        },
    },
});

export default externalWebhookProxy;
