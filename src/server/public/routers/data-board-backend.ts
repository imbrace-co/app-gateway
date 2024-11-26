import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request, Response, NextFunction } from 'express';
import { ClientRequest } from 'http';
import { apiAuthenticate } from '../../middlewares/apiAuth';
import { authorize } from '../../middlewares/auth';

/**
 * Data-board proxy.
 *
 * Mounted at: app.use('/v1/data-board', dataBoardBackendAuthProxy)
 *
 * Express strips the mount prefix, so the proxy receives paths like:
 *   /boards/...        → /api/boards/...
 *   /link_preview/...  → /api/link_preview/...
 *   /meilisearch/...   → /api/meilisearch/...
 *
 * The simple '^/ → /api/' rewrite handles all cases.
 */
const dataBoardBackendProxy = createProxyMiddleware({
  target: config.dataBoard.host,
  changeOrigin: true,
  pathRewrite: {
    '^/': '/api/',
  },
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 60000,
  timeout: 60000,
  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      console.log(`========= data-board-backend proxy:`);
      console.log(`   Original URL: ${req.originalUrl}`);
      console.log(`   Method: ${req.method}`);
      console.log(`   Target: ${config.dataBoard.host}`);

      if (req.userContext?.org_id) {
        proxyReq.setHeader('x-organization-id', req.userContext.org_id);
      }
      if (req.userContext?.user_id) {
        proxyReq.setHeader('x-user-id', req.userContext.user_id);
      }
    },
    error: (err, req: Request) => {
      console.error(`Data-board-backend proxy error for ${req.method} ${req.originalUrl}:`, err.message);
    },
  },
});

const authRouter = (req: Request, res: Response, next: NextFunction) => {
  // OAuth callbacks arrive from the provider with no auth headers — let them through
  const oauthCallbacks = [
    '/auth/google-drive/callback',
    '/auth/onedrive/callback',
    '/auth/dropbox/callback',
  ];
  if (oauthCallbacks.includes(req.path)) {
    return next();
  }
  if (req.headers['x-api-key']) {
    return apiAuthenticate(req, res, next);
  } else if (req.headers['authorization']?.startsWith('Bearer ') || req.headers['x-access-token']) {
    return authorize(req, res, next);
  } else {
    return res.status(401).json({ message: 'Unauthorized - API key or Access Token required' });
  }
};

export const dataBoardBackendAuthProxy = [authRouter, dataBoardBackendProxy];
export default dataBoardBackendProxy;
