import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request, Response, NextFunction } from 'express';
import { ClientRequest } from 'http';
import { whitelistJourneyRoute } from '../../../core/journeyAllowRoute';
import { getTempToken } from '../../middlewares/auth';

const whitelistedRoutesRegex = whitelistJourneyRoute.map((route) => ({
  method: route.method,
  regex: new RegExp(`^${route.path.replace(/:\w+/g, '[^/]+')}/?$`),
}));

const whitelistMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Get the path for matching, removing query strings
  const path = req.path.split('?')[0];

  const isAllowed = whitelistedRoutesRegex.some(
    (route) => req.method === route.method && route.regex.test(path)
  );

  if (isAllowed) {
    return next();
  }

  res
    .status(403)
    .json({ message: 'Forbidden: This endpoint is not accessible.' });
};

// Create a proxy for the backend API
const backendProxy = createProxyMiddleware({
  target: config.backend.public_host,
  changeOrigin: true,
  pathRewrite: (path) => {
    logger.debug(`Forwarding path to backend: ${path}`);
    return path;
  },
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 30000,
  timeout: 30000,

  // Event handlers
  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      if (req.userContext?.api_key) {
        proxyReq.setHeader('x-temp-token', req.userContext.api_key);
      }
      if (req.userContext?.user_id) {
        proxyReq.setHeader('x-user-id', req.userContext.user_id);
      }
    },

    proxyRes: (proxyRes, req: Request) => {
      logger.debug(
        `Backend response: ${req.method} ${req.path} -> ${proxyRes.statusCode}`
      );
    },

    error: (err, req: Request) => {
      logger.error(`Proxy error for ${req.method} ${req.path}:`, err.message);
    },
  },
});

const authRouter = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers['x-temp-token'] || req.headers['user-agent']) {
    const token = getTempToken(req);
    if (!token) {
      return res
        .status(401)
        .json({ message: 'Unauthorized - Invalid temp token' });
    }
    next();
  } else {
    return res
      .status(401)
      .json({ message: 'Unauthorized - API temp key or user-agent' });
  }
};

// Export the API service with conditional authentication middleware
const apiBackendJourneyService = [
  whitelistMiddleware,
  authRouter,
  backendProxy,
];

export default apiBackendJourneyService;
