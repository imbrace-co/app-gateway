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
import { Request, Response, NextFunction } from 'express';
import { ClientRequest } from 'http';
import { authorize } from '../../middlewares/auth';
import { apiAuthenticate } from '../../middlewares/apiAuth';

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
    // Forward whichever credential the caller used so marketplace's own
    // downstream calls (ai-service createAssistant, channel-service channel
    // create) can re-auth without us re-issuing tokens.
    if (req.userContext?.access_token && !req.userContext.access_token.startsWith('api_')) {
        proxyReq.setHeader('x-access-token', req.userContext.access_token);
    }
    if (req.userContext?.api_key) {
        proxyReq.setHeader('x-api-key', req.userContext.api_key);
    }
};

// Dual auth — match the channel-service / data-board pattern so callers can
// use either an `x-api-key` (full-access third-party token) or an
// `x-access-token` (acc_ session token).
const authRouter = (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['x-api-key']) {
        return apiAuthenticate(req, res, next);
    }
    if (req.headers['authorization']?.toString().startsWith('Bearer ') || req.headers['x-access-token']) {
        return authorize(req, res, next);
    }
    return res.status(401).json({ message: 'Unauthorized - API key or Access Token required' });
};

/**
 * Rewrites the path so the marketplace receives /vN/<rest>.
 * Handles both:
 *   /vN/marketplaces/<rest>  →  /vN/<rest>
 *   /marketplaces/vN/<rest>  →  /vN/<rest>
 */
function rewritePath(path: string, req: Request): string {
    const originalUrl = req.originalUrl || '';
    const [base, qs] = originalUrl.split('?');
    const suffix = qs ? `?${qs}` : '';

    const m1 = base.match(/^\/(v\d+)\/marketplaces(\/.*)?$/);
    if (m1) return `/${m1[1]}${m1[2] || '/'}${suffix}`;

    const m2 = base.match(/^\/marketplaces\/(v\d+)(\/.*)?$/);
    if (m2) return `/${m2[1]}${m2[2] || '/'}${suffix}`;

    return path; // fallback — should not happen with correct mounts
}

const marketplaceProxy = createProxyMiddleware({
    target: config.marketplace.host,
    changeOrigin: true,
    pathRewrite: rewritePath,
    on: { proxyReq: injectUserContext },
});

// Authenticated service (used for all versioned marketplace routes).
// Accepts both x-api-key and x-access-token (matches channel-service pattern).
export const marketplaceService = [authRouter, marketplaceProxy];

// No-auth variant (used for public download endpoints)
export const marketplaceNoAuthService = [marketplaceProxy];

export default marketplaceService;
