import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

/**
 * External Webhook Proxy — forwards provider webhook notifications to channel-service.
 *
 * No authentication required — external providers (Google Calendar, OneDrive, Dropbox)
 * send push notifications directly to this endpoint.
 *
 * Route: GET|POST|HEAD /external-webhook/:provider/:subscriptionId?
 * Proxied to: channel-service GET|POST|HEAD /v1/external-webhook/:provider/:subscriptionId?
 */
const externalWebhookProxy = createProxyMiddleware({
    target: config.channelService.host,
    changeOrigin: true,
    pathRewrite: {
        '^/': '/v1/external-webhook/',
    },
    on: {
        proxyReq: (_proxyReq: ClientRequest, req: Request) => {
            logger.info(`========= /external-webhook:`);
            logger.info(`   Original URL: ${req.originalUrl}`);
            logger.info(`   Request Path: ${req.path}`);
            logger.info(`   Target: ${config.channelService.host}`);
            logger.info(`   Method: ${req.method}`);
        },
        error: (err, req: Request) => {
            logger.error(
                `External webhook proxy error for ${req.method} ${req.originalUrl}:`,
                (err as Error).message,
            );
        },
    },
});

export default externalWebhookProxy;
