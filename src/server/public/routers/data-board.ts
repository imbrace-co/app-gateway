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
      console.log(`========= proxy data-board:`);
      console.log(`   Original URL: ${req.originalUrl}`);
      console.log(`   Request Path: ${req.path}`);
      console.log(`   Target: ${config.dataBoard.host}`);
      console.log(`   Forwarded URL: ${config.dataBoard.host}/api${req.path}`);
      console.log(`   Method: ${req.method}`);
      console.log(`   Content-Type: ${req.headers['content-type'] || 'NONE'}`);
      console.log(
        `   Content-Length: ${req.headers['content-length'] || 'NONE'}`
      );
      console.log(`   Query: ${JSON.stringify(req.query)}`);
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
