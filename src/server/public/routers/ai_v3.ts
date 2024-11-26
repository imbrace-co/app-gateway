import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import authRouter from '../../middlewares/authRouter';

const aiProxy = createProxyMiddleware({
    target: config.ai.python_host,
    changeOrigin: true,
    pathRewrite: {
        '^/': '/api/v1/', // add /v3/ to the basepath
    },
    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            if (req.userContext && req.userContext.org_id) {
                proxyReq.setHeader('x-organization-id', req.userContext.org_id);
            }
            if (req.userContext?.user_id) {
                proxyReq.setHeader('x-user-id', req.userContext.user_id);
            }
        },
    },
});

const aiServiceV3 = [authRouter, aiProxy];

export default aiServiceV3;
