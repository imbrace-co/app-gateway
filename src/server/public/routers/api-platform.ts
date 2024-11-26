import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request, Response, NextFunction } from 'express';
import { ClientRequest } from 'http';
import { apiAuthenticate } from '../../middlewares/apiAuth';
import { authorize } from '../../middlewares/auth';

// Create a proxy for the platform API
const platformProxy = createProxyMiddleware({
  target: config.platform.host,
  changeOrigin: true,
  pathRewrite: {
    '^/': '/v1/',
  },
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 30000,
  timeout: 30000,

  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      console.log(`========= platformProxy v1:`);
      console.log(`   Original URL: ${req.originalUrl}`);
      console.log(`   Request Path: ${req.path}`);
      console.log(`   Target: ${config.platform.host}`);
      console.log(`   Forwarded URL: ${config.platform.host}${req.path}`);
      console.log(`   Method: ${req.method}`);
      console.log(`   Content-Type: ${req.headers['content-type'] || 'NONE'}`);
      console.log(`   Body: ${JSON.stringify(req.body)}`);
      console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
      console.log(`   User Context: ${JSON.stringify(req.userContext, null, 2)}`);

      proxyReq.removeHeader('content-length');
      proxyReq.removeHeader('x-access-token');
      proxyReq.removeHeader('authorization');

      if (req.userContext?.org_id) {
        proxyReq.setHeader('x-organization-id', req.userContext.org_id);
      }
      if (req.userContext?.email) {
        proxyReq.setHeader('x-user-email', req.userContext.email);
      }
      if (req.userContext?.api_key) {
        proxyReq.setHeader('x-api-key', req.userContext.api_key);
      }
      if (req.userContext?.access_token) {
        proxyReq.setHeader('x-access-token', req.userContext.access_token);
      }
    },

    proxyRes: (proxyRes, req: Request) => {
      console.debug(
        `Platform response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`
      );
    },

    error: (err, req: Request) => {
      console.error(`Proxy error for ${req.method} ${req.path}:`, err.message);
    },
  },
});

const apiPlatformService = [platformProxy];

export default apiPlatformService;
