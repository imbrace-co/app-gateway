import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request, Response, NextFunction } from 'express';
import { ClientRequest } from 'http';
import { apiAuthenticate } from '../../middlewares/apiAuth';
import { authorize } from '../../middlewares/auth';

/**
 * Channel-service proxy.
 *
 * Mounted at: app.use('/v1/channel-service', channelServiceAuthProxy)
 *
 * Express strips the mount prefix before the proxy sees the request, so the
 * remaining path already contains the service version:
 *
 *   Frontend     : GET /v1/channel-service/v1/channels/abc123
 *   Proxy sees   : GET /v1/channels/abc123   (mount prefix stripped by Express)
 *   Forwarded to : GET /v1/channels/abc123   ← no rewrite needed
 */
const channelServiceProxy = createProxyMiddleware({
  target: config.channelService.host,
  changeOrigin: true,
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 30000,
  timeout: 30000,
  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      console.log(`========= channel-service proxy:`);
      console.log(`   Original URL: ${req.originalUrl}`);
      console.log(`   Method: ${req.method}`);
      console.log(`   Target: ${config.channelService.host}`);

      proxyReq.removeHeader('content-length');

      if (req.userContext?.org_id) {
        proxyReq.setHeader('x-organization-id', req.userContext.org_id);
      }
      if (req.userContext?.user_id) {
        proxyReq.setHeader('x-user-id', req.userContext.user_id);
      }
      if (req.userContext?.access_token) {
        proxyReq.setHeader('x-access-token', req.userContext.access_token);
      }
      if (req.userContext?.api_key) {
        proxyReq.setHeader('x-api-key', req.userContext.api_key);
      }
    },
    proxyRes: (_proxyRes, req: Request) => {
      console.debug(`Channel-service response: ${req.method} ${req.originalUrl} -> ${_proxyRes.statusCode}`);
    },
    error: (err, req: Request) => {
      console.error(`Channel-service proxy error for ${req.method} ${req.originalUrl}:`, err.message);
    },
  },
});

const authRouter = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers['x-api-key']) {
    return apiAuthenticate(req, res, next);
  } else if (req.headers['authorization']?.startsWith('Bearer ') || req.headers['x-access-token']) {
    return authorize(req, res, next);
  } else {
    return res.status(401).json({ message: 'Unauthorized - API key or Access Token required' });
  }
};

export const channelServiceAuthProxy = [authRouter, channelServiceProxy];
export default channelServiceProxy;
