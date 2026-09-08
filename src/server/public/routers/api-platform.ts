import logger from '../../logging/logger';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
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
      logger.info(`========= platformProxy v1:`);
      logger.info(`   Original URL: ${req.originalUrl}`);
      logger.info(`   Request Path: ${req.path}`);
      logger.info(`   Target: ${config.platform.host}`);
      logger.info(`   Forwarded URL: ${config.platform.host}${req.path}`);
      logger.info(`   Method: ${req.method}`);
      logger.info(`   Content-Type: ${req.headers['content-type'] || 'NONE'}`);
      logger.info(`   Body: ${JSON.stringify(req.body)}`);
      logger.info(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
      logger.info(`   User Context: ${JSON.stringify(req.userContext, null, 2)}`);

      proxyReq.removeHeader('content-length');
      proxyReq.removeHeader('authorization');

      // Prefer the trusted-internal header path on platform-service:
      //   if (xUserId && xOrgId) { mUser = userRepo.findById(xUserId) }
      // Legacy-issued acc_ tokens aren't in platform's access table, so
      // forwarding x-access-token triggers platform's 401. Forwarding
      // x-user-id + x-organization-id (both resolved by app-gateway's
      // authorize() above) lets platform trust us without re-validating.
      //
      // For public sub-paths (/login, /access, /organizations, etc.) authRouter
      // is skipped and userContext is undefined — forward the original
      // x-access-token so platform's loginAccessMiddleware can validate
      // login_acc_ tokens directly.
      if (!req.userContext) {
        // The new frontend (login_mode='sso') sends the legacy login_acc_/acc_ token as
        // `Authorization: Bearer`, but platform's loginAccessMiddleware reads x-access-token.
        // Fall back to the Bearer value so SSO completion (login-success/organizations/
        // access exchange) works without a frontend change.
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
        // Only forward the original access_token when we don't have a user_id
        // to rely on — this keeps the legacy single-token flow working for
        // platform endpoints that might prefer token-auth semantics. Also skip
        // when the value is an api-key string (apiAuth.ts puts the api-key in
        // userContext.access_token); platform doesn't validate api_xxx as a
        // legacy token and would 401.
        if (
          req.userContext.access_token &&
          !req.userContext.user_id &&
          !req.userContext.access_token.startsWith('api_')
        ) {
          proxyReq.setHeader('x-access-token', req.userContext.access_token);
        }
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

      // Re-stream the request body that the global express.urlencoded() already
      // consumed. Without this, proxied urlencoded POSTs reach platform-service with
      // an EMPTY body — which breaks the SAML ACS (SAMLResponse arrives undefined).
      // Scoped to urlencoded because JSON isn't parsed globally and still streams as-is.
      const contentType = req.headers['content-type'] || '';
      if (
        contentType.includes('x-www-form-urlencoded') &&
        req.body &&
        Object.keys(req.body).length > 0
      ) {
        fixRequestBody(proxyReq, req);
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

const apiPlatformService = [platformProxy];

export default apiPlatformService;
