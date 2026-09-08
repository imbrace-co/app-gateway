import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import { authorize } from '../../middlewares/auth';

const ipsProxy = createProxyMiddleware({
    target: config.ips.host,
    changeOrigin: true,
    pathRewrite: {
        '^/': '/api/v1/', // add /v1/ to the basepath
    },
    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            if (req.userContext && req.userContext.org_id) {
                proxyReq.setHeader('x-organization-id', req.userContext.org_id);
            }

            if (req.userContext && req.userContext.access_token) {
                proxyReq.setHeader('x-access-token', req.userContext.access_token);
            }

            const { user_id } = req.params;
            if (user_id) {
                proxyReq.setHeader('x-user-id', user_id);
            }
        },
    },
});

const ipsService = [authorize, ipsProxy];


export default ipsService;