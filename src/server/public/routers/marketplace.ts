/**
 * Unified Marketplace proxy
 *
 * The marketplace service owns its own versioning (/v1, /v2, /v3).
 * This proxy extracts the version from the inbound URL and passes the
 * request through so the marketplace handles routing itself.
 *
 * Supported mount patterns (both handled the same way):
 *   /vN/marketplaces/...   →  marketplace /vN/...
 *   /marketplaces/vN/...   →  marketplace /vN/...
 */
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import { authorize } from '../../middlewares/auth';

const injectUserContext = (proxyReq: ClientRequest, req: Request) => {
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

/**
 * Rewrites the path so the marketplace receives /vN/<rest>.
 * Handles both:
 *   /vN/marketplaces/<rest>  →  /vN/<rest>
 *   /marketplaces/vN/<rest>  →  /vN/<rest>
 */
function rewritePath(path: string, req: Request): string {
    const base = (req.originalUrl || '').split('?')[0];

    const m1 = base.match(/^\/(v\d+)\/marketplaces(\/.*)?$/);
    if (m1) return `/${m1[1]}${m1[2] || '/'}`;

    const m2 = base.match(/^\/marketplaces\/(v\d+)(\/.*)?$/);
    if (m2) return `/${m2[1]}${m2[2] || '/'}`;

    return path; // fallback — should not happen with correct mounts
}

const marketplaceProxy = createProxyMiddleware({
    target: config.marketplace.host,
    changeOrigin: true,
    pathRewrite: rewritePath,
    on: { proxyReq: injectUserContext },
});

// Authenticated service (used for all versioned marketplace routes)
export const marketplaceService = [authorize, marketplaceProxy];

// No-auth variant (used for public download endpoints)
export const marketplaceNoAuthService = [marketplaceProxy];

export default marketplaceService;
