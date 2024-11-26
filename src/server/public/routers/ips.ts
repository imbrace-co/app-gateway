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
            console.log(`========= /v1/ips:`);
            console.log(`   Original URL: ${req.originalUrl}`);
            console.log(`   Request Path: ${req.path}`);
            console.log(`   Target: ${config.ips.host}`);
            console.log(`   Forwarded URL: ${config.ips.host}${req.path}`);
            console.log(`   Method: ${req.method}`);
            console.log(`   Content-Type: ${req.headers['content-type'] || 'NONE'}`);
            console.log(`   Content-Lenght: ${req.headers['content-length'] || 'NONE'}`);
            console.log(`   Body: ${JSON.stringify(req.body)}`);
            console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
            console.log(`   User Context: ${JSON.stringify(req.userContext, null, 2)}`);

            if (req.userContext && req.userContext.org_id) {
                proxyReq.setHeader('x-organization-id', req.userContext.org_id);
            }

            if (req.userContext && req.userContext.access_token) {
                proxyReq.setHeader('x-access-token', req.userContext.access_token);
            }

            if (req.userContext && req.userContext.user_id) {
                proxyReq.setHeader('x-user-id', req.userContext.user_id);
            }
        },
    },
});

const ipsService = [authorize, ipsProxy];


export default ipsService;