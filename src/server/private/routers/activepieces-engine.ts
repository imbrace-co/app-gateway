import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

// Create a proxy for the ActivePieces engine API
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
            console.log(`🔄 AP-ENGINE PROXY:`);
            console.log(`   Original URL: ${req.originalUrl}`);
            console.log(`   Request Path: ${req.path}`);
            console.log(`   Target: ${config.activepieces.engine_host}`);
            console.log(`   Forwarded URL: ${config.activepieces.engine_host}${req.path}`);
            console.log(`   Method: ${req.method}`);

            // Remove any content-length header to avoid confusion
            proxyReq.removeHeader('content-length');

            // Add ActivePieces engine specific headers
            proxyReq.setHeader('x-gateway-source', 'imbrace-gateway');
        },

        proxyRes: (proxyRes, req: Request) => {
            console.debug(`ActivePieces Engine response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
        },

        error: (err, req: Request) => {
            console.error(`ActivePieces Engine proxy error for ${req.method} ${req.path}:`, err.message);
        }
    },
});

// Export the ActivePieces engine service (no auth middleware since it's private)
export default activePiecesEngineProxy;