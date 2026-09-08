import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import { authorize } from '../../middlewares/auth';

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
      if (req.userContext?.org_id) {
        proxyReq.setHeader('x-organization-id', req.userContext.org_id);
      }
      if (req.userContext?.user_id) {
        proxyReq.setHeader('x-user-id', req.userContext.user_id);
      }
    },
    error: (err, req: Request) => {
      logger.error(`File-service v1 proxy error for ${req.method} ${req.path}:`, err.message);
    },
  },
});

const fileServiceV1 = [authorize, fileServiceV1Proxy];

export default fileServiceV1;
