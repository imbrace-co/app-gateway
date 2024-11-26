import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import { authorize } from '../../middlewares/auth';

/**
 * Build an unsigned JWT (header.payload.signature) that the file-service
 * can decode to extract organization_id and user_id.
 * File-service trusts the gateway and only decodes — it never verifies.
 */
function buildUnsignedJwt(orgId: string, userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ organization_id: orgId, user_id: userId })).toString('base64url');
  return `${header}.${payload}.`;
}

const fileServiceV1Proxy = createProxyMiddleware({
  target: config.fileService.host,
  changeOrigin: true,
  pathRewrite: {
    '^/': '/api/v1/',
  },
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 60000,
  timeout: 60000,
  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      if (req.userContext?.org_id && req.userContext?.user_id) {
        const token = buildUnsignedJwt(req.userContext.org_id, req.userContext.user_id);
        proxyReq.setHeader('Authorization', `Bearer ${token}`);
      }
      if (req.userContext?.org_id) {
        proxyReq.setHeader('x-organization-id', req.userContext.org_id);
      }
      if (req.userContext?.user_id) {
        proxyReq.setHeader('x-user-id', req.userContext.user_id);
      }
    },
    error: (err, req: Request) => {
      console.error(`File-service v1 proxy error for ${req.method} ${req.path}:`, err.message);
    },
  },
});

const fileServiceV1 = [authorize, fileServiceV1Proxy];

export default fileServiceV1;
