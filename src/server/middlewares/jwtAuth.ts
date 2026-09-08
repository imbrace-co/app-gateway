import logger from '../logging/logger';
import { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import config from '../../config';

// In-memory cache: (org_id, email) → modern user_id (e.g. "u_<uuid>").
// The auth-service JWT carries `sub: user:<legacy-sub>` for accounts that
// existed before the platform-service migration; that legacy id has no
// counterpart on platform-service, so downstream services that key on
// platform user_ids (channel-service / etc.) miss every row keyed by the
// modern id. Resolve once via platform's /v1/organizations/:id/users
// endpoint and reuse for the life of the cache entry.
const USER_ID_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
type CacheEntry = { user_id: string; expires_at: number };
const userIdByOrgEmail = new Map<string, CacheEntry>();

async function resolveModernUserId(
  org_id: string,
  email: string,
): Promise<string | null> {
  const key = `${org_id}|${email.toLowerCase()}`;
  const cached = userIdByOrgEmail.get(key);
  const now = Date.now();
  if (cached && cached.expires_at > now) return cached.user_id;

  try {
    const url = `${config.platform.host}/v1/organizations/${encodeURIComponent(org_id)}/users`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json: any = await res.json();
    const items: any[] = Array.isArray(json) ? json : (json?.items ?? json?.data ?? []);
    const match = items.find(
      (u) => typeof u?.email === 'string' && u.email.toLowerCase() === email.toLowerCase(),
    );
    const id: string | undefined = match?.public_id ?? match?._id ?? match?.id;
    if (!id) return null;
    userIdByOrgEmail.set(key, { user_id: id, expires_at: now + USER_ID_CACHE_TTL_MS });
    return id;
  } catch {
    return null;
  }
}

interface AuthServicePayload extends JWTPayload {
  type: string;
  properties: {
    user_id: string;
    email: string;
    customer_id: string;
    organizations: Array<{
      organization_id: string;
      display_name: string;
      role: string;
      is_admin: boolean;
      status: string;
    }>;
  };
}

// Create JWKS client once — jose caches the keys automatically
const JWKS = createRemoteJWKSet(
  new URL(`${config.authService.url}/.well-known/jwks.json`)
);

/**
 * Verify a Bearer JWT token from auth-service and validate organization membership.
 *
 * Expects:
 *   - Authorization: Bearer <jwt>
 *   - x-organization-id: <org_id>
 *
 * On success, populates req.userContext with user info from the JWT payload.
 */
export const jwtAuthorize = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization as string;
  const orgId = req.headers['x-organization-id'] as string;

  const token = authHeader.replace('Bearer ', '');

  try {
    const { payload } = await jwtVerify(token, JWKS) as { payload: AuthServicePayload };

    const organizations = payload.properties?.organizations ?? [];
    const matchedOrg = organizations.find(
      (org) => org.organization_id === orgId
    );

    if (!matchedOrg) {
      logger.info(
        `   ❌ REJECTED: organization_id "${orgId}" not found in JWT organizations`
      );
      return res.status(400).json({
        message: 'Bad Request - organization_id not found in user organizations',
      });
    }

    // properties.user_id is absent in the current auth-service JWT — fall back
    // to (a) a platform-service email→users.id lookup, then (b) the standard
    // JWT `sub` claim. The lookup gives us the modern `u_<uuid>` that
    // downstream services (channel-service / data-board / etc.) actually
    // index conversation_members and team membership against; falling
    // straight to JWT.sub leaves new SSO logins keyed under the legacy
    // `user:<sub>` id and blank from the dashboard's perspective.
    let userId = payload.properties?.user_id ?? '';
    if (!userId && payload.properties?.email) {
      userId = (await resolveModernUserId(orgId, payload.properties.email)) ?? '';
    }
    if (!userId) userId = payload.sub ?? '';

    req.userContext = {
      org_id: orgId,
      user_id: userId,
      email: payload.properties?.email,
    };

    logger.info(`✅ JWT auth: user=${userId} org=${orgId}`);
    logger.info(`   userContext:`, JSON.stringify(req.userContext));
    logger.info(`   originalUrl: ${req.originalUrl}`);
    logger.info(`   method: ${req.method}`);
    logger.info(`   headers forwarded: x-organization-id=${orgId}, x-user-id=${userId}, x-access-token=${req.userContext.access_token ?? '(not set)'}`);
    next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.info(`   ❌ REJECTED: JWT verification failed - ${message}`);
    return res.status(401).json({ message: 'Unauthorized - Invalid JWT' });
  }
};

/**
 * Check if the request carries an SSO JWT we should verify.
 *
 * Requires Bearer + x-organization-id AND a JWT-shaped token (three
 * dot-separated segments). Legacy tokens like `acc_<uuid>` or contact
 * tokens that callers happen to put in Authorization land in the
 * legacy access-token path instead of failing JWT verification.
 */
export const hasBearerAuth = (req: Request): boolean => {
  const authHeader = req.headers.authorization as string | undefined;
  const orgId = req.headers['x-organization-id'] as string | undefined;
  if (!authHeader?.startsWith('Bearer ') || !orgId) return false;
  const token = authHeader.slice(7);
  return token.split('.').length === 3;
};