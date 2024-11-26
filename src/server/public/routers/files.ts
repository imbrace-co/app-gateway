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
      console.log(`========= proxy files:`);
      console.log(`   Original URL: ${req.originalUrl}`);
      console.log(`   Request Path: ${req.path}`);
      console.log(`   Target: ${config.fileService.host}`);
      console.log(
        `   Forwarded URL: ${config.fileService.host}/api/files${req.path}`
      );
      console.log(`   Method: ${req.method}`);
      console.log(
        `   Content-Type: ${req.headers['content-type'] || 'NONE'}`
      );
      console.log(
        `   Content-Length: ${req.headers['content-length'] || 'NONE'}`
      );
      console.log(`   Body: ${JSON.stringify(req.body)}`);
      console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
      console.log(
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
