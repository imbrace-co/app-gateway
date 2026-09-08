import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

// Create a proxy for the Workflow engine API
const activePiecesEngineProxy = createProxyMiddleware({
    target: config.activepieces.engine_host,
    changeOrigin: true,
    pathRewrite: {
        '^/api/v1': '/v1', // Convert /api/v1/* to /v1/* for AP-Engine
        '^/v1': '/v1', // Keep direct /v1/* paths as-is
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,

    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            logger.info(`🔄 AP-ENGINE PROXY:`);
            logger.info(`   Original URL: ${req.originalUrl}`);
            logger.info(`   Request Path: ${req.path}`);
            logger.info(`   Target: ${config.activepieces.engine_host}`);
            logger.info(`   Forwarded URL: ${config.activepieces.engine_host}${req.path}`);
            logger.info(`   Method: ${req.method}`);

            // Remove any content-length header to avoid confusion
            proxyReq.removeHeader('content-length');

            // Add Workflow engine specific headers
            proxyReq.setHeader('x-gateway-source', 'app-gateway');
        },

        proxyRes: (proxyRes, req: Request) => {
            logger.debug(`Workflow Engine response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
        },

        error: (err, req: Request) => {
            logger.error(`Workflow Engine proxy error for ${req.method} ${req.path}:`, err.message);
        }
    },
});

// Export the Workflow engine service (no auth middleware since it's private)
export default activePiecesEngineProxy;