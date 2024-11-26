import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

// Create a proxy for the backend API
const backendProxy = createProxyMiddleware({
  target: config.backend.private_host,
  changeOrigin: true,
  pathRewrite: {
    '^/': '/',
  },

  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 30000,
  timeout: 30000,

  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
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
