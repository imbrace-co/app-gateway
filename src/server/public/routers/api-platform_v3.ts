import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request, Response, NextFunction } from 'express';
import { ClientRequest } from 'http';
import { apiAuthenticate } from '../../middlewares/apiAuth';
import { authorize } from '../../middlewares/auth';

const platformProxy = createProxyMiddleware({
  target: config.platform.host,
  changeOrigin: true,
  pathRewrite: {
    '^/': '/v3/',
  },
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 30000,
  timeout: 30000,

  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      logger.info(`========= platformProxy v3:`);
      logger.info(`   Original URL: ${req.originalUrl}`);
      logger.info(`   Request Path: ${req.path}`);
      logger.info(`   Target: ${config.platform.host}`);
      logger.info(`   Forwarded URL: ${config.platform.host}${req.path}`);
      logger.info(`   Method: ${req.method}`);
      logger.info(`   Content-Type: ${req.headers['content-type'] || 'NONE'}`);
      logger.info(`   Body: ${JSON.stringify(req.body)}`);
      logger.info(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
      logger.info(`   User Context: ${JSON.stringify(req.userContext, null, 2)}`);

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
      if (req.userContext?.access_token && !req.userContext.access_token.startsWith('api_')) {
        proxyReq.setHeader('x-access-token', req.userContext.access_token);
      }
    },

    proxyRes: (proxyRes, req: Request) => {
      logger.debug(
        `Platform response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`
      );
    },

    error: (err, req: Request) => {
      logger.error(`Proxy error for ${req.method} ${req.path}:`, err.message);
    },
  },
});

const apiPlatformServiceV3 = [platformProxy];

export default apiPlatformServiceV3;
