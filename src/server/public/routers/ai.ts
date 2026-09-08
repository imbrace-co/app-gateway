import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request, Response, NextFunction } from 'express';
import { ClientRequest } from 'http';
import { apiAuthenticate } from '../../middlewares/apiAuth';
import { authorize } from '../../middlewares/auth';

const aiProxy = createProxyMiddleware({
    target: config.ai.host,
    changeOrigin: true,
    pathRewrite: {
        '^/': '/v1/', // add /v1/ to the basepath
    },
    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            if (req.userContext?.org_id) {
                proxyReq.setHeader('x-organization-id', req.userContext.org_id);
            }
            if (req.userContext?.user_id) {
                proxyReq.setHeader('x-user-id', req.userContext.user_id);
            }
            if (req.userContext?.api_key) {
                proxyReq.setHeader('x-api-key', req.userContext.api_key);
            }
            if (req.userContext?.access_token && !req.userContext.access_token.startsWith('api_')) {
                proxyReq.setHeader('x-access-token', req.userContext.access_token);
            }
        },
    },
});

// Authentication router middleware that chooses between API key, Bearer JWT, and access token auth
const authRouter = (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['x-api-key']) {
        return apiAuthenticate(req, res, next);
    } else if (req.headers['authorization']?.startsWith('Bearer ') || req.headers['x-access-token']) {
        return authorize(req, res, next);
    } else {
        return res.status(401).json({ message: 'Unauthorized - API key or Access Token required' });
    }
};

const aiService = [authRouter, aiProxy];

export default aiService;
