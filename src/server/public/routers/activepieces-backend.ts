import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import authRouter from '../../middlewares/authRouter';

// Create a proxy for the ActivePieces backend API
const activePiecesBackendProxy = createProxyMiddleware({
    target: config.activepieces.backend_host,
    changeOrigin: true,
    pathRewrite: {
        '^/api/v1': '/v1', // Convert /api/v1/* to /v1/* for AP-Backend
        '^/v1': '/v1', // Keep direct /v1/* paths as-is
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,

    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            // Add detailed logging for debugging
            console.log(`🔄 AP-BACKEND PROXY:`);
            console.log(`   Original URL: ${req.originalUrl}`);
            console.log(`   Forwarded URL: ${config.activepieces.backend_host}${req.path}`);

            // Forward user context information as headers
            if (req.userContext?.org_id) {
                proxyReq.setHeader('x-organization-id', req.userContext.org_id);
            }
            if (req.userContext?.user_id) {
                proxyReq.setHeader('x-user-id', req.userContext.user_id);
            }
            // Only forward access token if it's a real user token, not an api key
            if (req.userContext?.access_token && !req.userContext.access_token.startsWith('api_')) {
                proxyReq.setHeader('x-access-token', req.userContext.access_token);
            }
            if (req.userContext?.business_unit_id) {
                proxyReq.setHeader('x-business-unit-id', req.userContext.business_unit_id);
            }

            // Strip gateway auth headers so AP backend's DashboardAccessTokenAuthnHandler takes over
            proxyReq.removeHeader('x-api-key');
            proxyReq.removeHeader('authorization');
            proxyReq.setHeader('x-gateway-source', 'imbrace-gateway');
        },

        proxyRes: (proxyRes, req: Request) => {
            console.debug(`ActivePieces Backend response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
        },

        error: (err, req: Request) => {
            console.error(`ActivePieces Backend proxy error for ${req.method} ${req.path}:`, err.message);
        }
    },
});

// Export the ActivePieces backend service with standard authentication middleware
const activePiecesBackendService = [authRouter, activePiecesBackendProxy];

export default activePiecesBackendService;