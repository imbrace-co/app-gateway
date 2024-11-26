import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

// Create a proxy for the backend API
const backendProxy = createProxyMiddleware({
    target: config.backend.public_host,
    changeOrigin: true,
    pathRewrite: {
        '^/': '/v2/', // add /v1/ to the basepath
    },
    // Configure proxy options to play nicely with Fastify
    followRedirects: false, // Don't automatically follow redirects
    ws: false, // No websocket support needed
    preserveHeaderKeyCase: true, // Keep header case as-is
    proxyTimeout: 30000, // 30 second timeout
    timeout: 30000, // Socket timeout
    
    // Event handlers
    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            // Forward user context headers to backend
            if (req.userContext?.org_id) {
                proxyReq.setHeader('x-organization-id', req.userContext.org_id);
            }
            if (req.userContext?.user_id) {
                proxyReq.setHeader('x-user-id', req.userContext.user_id);
            }
            if (req.userContext?.api_key) {
                proxyReq.setHeader('x-api-key', req.userContext.api_key);
            }
            if (req.userContext?.access_token) {
                proxyReq.setHeader('x-access-token', req.userContext.access_token);
            }
        },
        
        // Debug response handling
        proxyRes: (proxyRes, req: Request) => {
            console.debug(`Backend response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`);
        },
        
        error: (err, req: Request) => {
            console.error(`Proxy error for ${req.method} ${req.path}:`, err.message);
        }
    },
});

export default backendProxy;