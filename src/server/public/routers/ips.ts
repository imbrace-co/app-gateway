import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import { authorize } from '../../middlewares/auth';

const ipsProxy = createProxyMiddleware({
    target: config.ips.host,
    changeOrigin: true,
    pathRewrite: {
        '^/': '/api/v1/', // add /v1/ to the basepath
    },
    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            logger.info(`========= /v1/ips:`);
            logger.info(`   Original URL: ${req.originalUrl}`);
            logger.info(`   Request Path: ${req.path}`);
            logger.info(`   Target: ${config.ips.host}`);
            logger.info(`   Forwarded URL: ${config.ips.host}${req.path}`);
            logger.info(`   Method: ${req.method}`);
            logger.info(`   Content-Type: ${req.headers['content-type'] || 'NONE'}`);
            logger.info(`   Content-Lenght: ${req.headers['content-length'] || 'NONE'}`);
            logger.info(`   Body: ${JSON.stringify(req.body)}`);
            logger.info(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
            logger.info(`   User Context: ${JSON.stringify(req.userContext, null, 2)}`);

            if (req.userContext && req.userContext.org_id) {
                proxyReq.setHeader('x-organization-id', req.userContext.org_id);
            }

            if (req.userContext && req.userContext.access_token && !req.userContext.access_token.startsWith('api_')) {
                proxyReq.setHeader('x-access-token', req.userContext.access_token);
            }

            if (req.userContext && req.userContext.user_id) {
                proxyReq.setHeader('x-user-id', req.userContext.user_id);
            }
        },
    },
});

const ipsService = [authorize, ipsProxy];

// Canonical proxy for /ips — IPS service owns its own versioning (/api/v1, /api/v2)
// Frontend calls /ips/api/v1/... so we just strip the /ips prefix and forward the rest
const ipsCanonicalProxy = createProxyMiddleware({
    target: config.ips.host,
    changeOrigin: true,
    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            if (req.userContext?.org_id) {
                proxyReq.setHeader('x-organization-id', req.userContext.org_id);
            }
            if (req.userContext?.access_token && !req.userContext.access_token.startsWith('api_')) {
                proxyReq.setHeader('x-access-token', req.userContext.access_token);
            }
            if (req.userContext?.user_id) {
                proxyReq.setHeader('x-user-id', req.userContext.user_id);
            }
        },
    },
});

export const ipsCanonicalService = [authorize, ipsCanonicalProxy];

export default ipsService;