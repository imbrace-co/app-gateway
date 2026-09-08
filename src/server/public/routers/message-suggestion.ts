import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import authRouter from '../../middlewares/authRouter';

const messageSuggestionProxy = createProxyMiddleware({
  target: config.messageSuggestion.host,
  changeOrigin: true,
  secure: false, // allow self-signed / staging certs
  proxyTimeout: 0, // no timeout — needed for SSE stream endpoints
  timeout: 0,
  pathRewrite: {
    '^/': '/api/', // service expects /api/* prefix
  },
  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      if (req.userContext?.org_id) {
        proxyReq.setHeader('x-organization-id', req.userContext.org_id);
      }
      if (req.userContext?.user_id) {
        proxyReq.setHeader('x-user-id', req.userContext.user_id);
      }
      // apiAuth puts the api-key string into userContext.access_token, so
      // skip x-access-token forwarding when the value is actually an api key.
      if (req.userContext?.access_token && !req.userContext.access_token.startsWith('api_')) {
        proxyReq.setHeader('x-access-token', req.userContext.access_token);
      }
      if (req.userContext?.api_key) {
        proxyReq.setHeader('x-api-key', req.userContext.api_key);
      }
    },
  },
});

const messageSuggestionService = [authRouter, messageSuggestionProxy];

export default messageSuggestionService;
