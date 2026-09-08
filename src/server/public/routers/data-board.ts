import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import { authorize } from '../../middlewares/auth';

const dataBoardProxy = createProxyMiddleware({
  target: config.dataBoard.host,
  changeOrigin: true,
  pathRewrite: {
    '^/': '/api/',
  },
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 30000,
  timeout: 30000,
  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      logger.info(`========= proxy data-board:`);
      logger.info(`   Original URL: ${req.originalUrl}`);
      logger.info(`   Request Path: ${req.path}`);
      logger.info(`   Target: ${config.dataBoard.host}`);
      logger.info(`   Forwarded URL: ${config.dataBoard.host}/api${req.path}`);
      logger.info(`   Method: ${req.method}`);
      logger.info(`   Content-Type: ${req.headers['content-type'] || 'NONE'}`);
      logger.info(
        `   Content-Length: ${req.headers['content-length'] || 'NONE'}`
      );
      logger.info(`   Query: ${JSON.stringify(req.query)}`);
      logger.info(`   Body: ${JSON.stringify(req.body)}`);
      logger.info(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
      logger.info(
        `   User Context: ${JSON.stringify(req.userContext, null, 2)}`
      );

      if (req.userContext?.org_id) {
        proxyReq.setHeader('x-organization-id', req.userContext.org_id);
      }
      if (req.userContext?.user_id) {
        proxyReq.setHeader('x-user-id', req.userContext.user_id);
      }
    },
  },
});

// Middleware to conditionally apply authorization for data-board routes
const conditionalAuth = (req: Request, res: any, next: any) => {
  // Skip authorization for auth-related paths
  if (req.path.startsWith('/auth/')) {
    return next();
  }

  // Apply authorization for all other paths
  return authorize(req, res, next);
};

const dataBoardService = [conditionalAuth, dataBoardProxy];

export default dataBoardService;
