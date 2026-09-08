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
    '^/': '/v2/',
  },
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 30000,
  timeout: 30000,

  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      logger.info(`========= platformProxy v2:`);
      logger.info(`   Original URL: ${req.originalUrl}`);
      logger.info(`   Request Path: ${req.path}`);
      logger.info(`   Target: ${config.platform.host}`);
      logger.info(`   Forwarded URL: ${config.platform.host}${req.path}`);
      logger.info(`   Method: ${req.method}`);
      logger.info(`   Content-Type: ${req.headers['content-type'] || 'NONE'}`);
      logger.info(`   Body: ${JSON.stringify(req.body)}`);
      logger.info(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
      logger.info(`   User Context: ${JSON.stringify(req.userContext, null, 2)}`);

      proxyReq.removeHeader('authorization');

      // If authRouter ran and populated userContext, use its resolved token.
      // Otherwise (public sub-paths like /organizations that skip authRouter),
      // forward the original x-access-token so platform's loginAccessMiddleware
      // can validate it directly (login_acc_ tokens).
      if (req.userContext?.access_token && !req.userContext.access_token.startsWith('api_')) {
        proxyReq.setHeader('x-access-token', req.userContext.access_token);
      } else if (!req.userContext) {
        // Frontend (login_mode='sso') may send the legacy login_acc_ token as
        // `Authorization: Bearer`; fall back to it so /v2/organizations works.
        const authHeader = req.headers['authorization'];
        const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : undefined;
        const originalToken = (req.headers['x-access-token'] as string) || bearer;
        if (originalToken) {
          proxyReq.setHeader('x-access-token', originalToken);
        } else {
          proxyReq.removeHeader('x-access-token');
        }
      } else {
        proxyReq.removeHeader('x-access-token');
      }

      if (req.userContext?.org_id) {
        proxyReq.setHeader('x-organization-id', req.userContext.org_id);
      }
      if (req.userContext?.user_id) {
        proxyReq.setHeader('x-user-id', req.userContext.user_id);
      }
      if (req.userContext?.email) {
        proxyReq.setHeader('x-user-email', req.userContext.email);
      }
      if (req.userContext?.api_key) {
        proxyReq.setHeader('x-api-key', req.userContext.api_key);
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

const apiPlatformServiceV2 = [platformProxy];

export default apiPlatformServiceV2;
