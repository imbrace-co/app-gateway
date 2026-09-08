import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import { authorize } from '../../middlewares/auth';

const aiProxy = createProxyMiddleware({
    target: config.ai.host,
    changeOrigin: true,
    pathRewrite: {
        '^/': '/v2/', // add /v2/ to the basepath
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

const aiServiceV2 = [authorize, aiProxy];

export default aiServiceV2;
