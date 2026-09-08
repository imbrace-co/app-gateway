import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

const aiProxy = createProxyMiddleware({
    target: config.ai.python_host,
    changeOrigin: true,
    pathRewrite: {
        '^/': '/', // add /chat/ to the basepath
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

export default aiProxy;
