import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import { authorize } from '../../middlewares/auth';

const fileServiceProxy = createProxyMiddleware({
  target: config.fileService.host,
  changeOrigin: true,
  pathRewrite: {
    '^/': '/api/files/',
  },
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 30000,
  timeout: 30000,
  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      logger.info(`========= proxy files:`);
      logger.info(`   Original URL: ${req.originalUrl}`);
      logger.info(`   Request Path: ${req.path}`);
      logger.info(`   Target: ${config.fileService.host}`);
      logger.info(
        `   Forwarded URL: ${config.fileService.host}/api/files${req.path}`
      );
      logger.info(`   Method: ${req.method}`);
      logger.info(
        `   Content-Type: ${req.headers['content-type'] || 'NONE'}`
      );
      logger.info(
        `   Content-Length: ${req.headers['content-length'] || 'NONE'}`
      );
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

const fileService = [authorize, fileServiceProxy];

export default fileService;
