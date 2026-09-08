import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import { authorize } from '../../middlewares/auth';

const proxyReqHandler = (proxyReq: ClientRequest, req: Request) => {
    if (req.userContext?.org_id) {
        proxyReq.setHeader('x-organization-id', req.userContext.org_id);
    }
    if (req.userContext?.user_id) {
        proxyReq.setHeader('x-user-id', req.userContext.user_id);
    }
    if (req.userContext?.business_unit_id) {
        proxyReq.setHeader('x-business-unit-id', req.userContext.business_unit_id);
    }
};

// Routes: /v2/templates, /templates/v2, /backend/v2/templates, /v2/backend/templates
// → marketplace /v3/use-cases/*
const marketplaceProxy = createProxyMiddleware({
    target: config.marketplace.host,
    changeOrigin: true,
    pathRewrite: { '^/': '/v3/use-cases/' },
    on: { proxyReq: proxyReqHandler },
});

const marketplaceTemplateService = [authorize, marketplaceProxy];

export default marketplaceTemplateService;