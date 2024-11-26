import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request, Response, NextFunction } from 'express';
import { ClientRequest } from 'http';
import { apiAuthenticate } from '../../middlewares/apiAuth';
import { authorize } from '../../middlewares/auth';

// Create a proxy for the predict API endpoint
// Target URL: ${config.fraudDetection.host}
const predictProxy = createProxyMiddleware({
    target: config.fraudDetection.host,
    changeOrigin: true,
    pathRewrite: {
        '/': '/predict',
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
            // Remove any content-length header to avoid confusion
            proxyReq.removeHeader('content-length');
            
            // Forward organization ID if available
            if (req.userContext?.org_id) {
                proxyReq.setHeader('x-organization-id', req.userContext.org_id);
            }
            if (req.userContext?.user_id) {
                proxyReq.setHeader('x-user-id', req.userContext.user_id);
            }
            // Forward the original API key for backend validation
            if (req.userContext?.api_key) {
                proxyReq.setHeader('x-api-key', req.userContext.api_key);
            }
            // Forward the original access token if available
            if (req.userContext?.access_token) {
                proxyReq.setHeader('x-access-token', req.userContext.access_token);
            }
        },
        proxyRes: (proxyRes, req, res) => {
            // Log response for debugging
        },
        error: (err, req, res) => {
            // Handle proxy errors
            if (!res.headersSent) {
                res.status(500).json({ 
                    error: 'Proxy error', 
                    message: err.message,
                    target: config.fraudDetection.host 
                });
            }
        },
    },
});

// Authentication router middleware that chooses between API key and access token auth
const authRouter = (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['x-api-key']) {
        // If API key is present, use API authentication
        return apiAuthenticate(req, res, next);
    } else if (req.headers['authorization']?.startsWith('Bearer ') || req.headers['x-access-token']) {
        // If Bearer token or access token is present, use token authentication
        return authorize(req, res, next);
    } else {
        // If neither is present, return unauthorized
        return res.status(401).json({ message: "Unauthorized - API key or Access Token required" });
    }
};

// Export the predict API service with conditional authentication middleware
const apiPredictService = [authRouter, predictProxy];

export default apiPredictService; 