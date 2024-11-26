import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

// Create a proxy for the backend API
const backendProxy = createProxyMiddleware({
  target: config.backend.public_host,
  changeOrigin: true,
  pathRewrite: {
    '^/': '/v1/', // add /v1/ to the basepath
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
      console.log(`========= backendProxy:`);
      console.log(`   Original URL: ${req.originalUrl}`);
      console.log(`   Request Path: ${req.path}`);
      console.log(`   Target: ${config.backend.public_host}`);
      console.log(`   Forwarded URL: ${config.backend.public_host}${req.path}`);
      console.log(`   Method: ${req.method}`);
      console.log(`   Content-Type: ${req.headers['content-type'] || 'NONE'}`);
      console.log(`   Body: ${JSON.stringify(req.body)}`);
      console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
      console.log(`   User Context: ${JSON.stringify(req.userContext, null, 2)}`);

      // Remove any content-length header to avoid confusion
      proxyReq.removeHeader('content-length');

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
      console.debug(
        `Backend response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`
      );
    },

    error: (err, req: Request) => {
      console.error(`Proxy error for ${req.method} ${req.path}:`, err.message);
    },
  },
});

export default backendProxy;
