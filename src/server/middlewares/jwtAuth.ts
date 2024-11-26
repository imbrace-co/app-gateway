import { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import config from '../../config';

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
      console.log(
        `   ❌ REJECTED: organization_id "${orgId}" not found in JWT organizations`
      );
      return res.status(400).json({
        message: 'Bad Request - organization_id not found in user organizations',
      });
    }

    req.userContext = {
      org_id: orgId,
      user_id: payload.properties.user_id,
      email: payload.properties.email,
    };

    console.log(`✅ JWT auth: user=${payload.properties.user_id} org=${orgId}`);
    console.log(`   userContext:`, JSON.stringify(req.userContext));
    console.log(`   originalUrl: ${req.originalUrl}`);
    console.log(`   method: ${req.method}`);
    console.log(`   headers forwarded: x-organization-id=${orgId}, x-user-id=${payload.properties.user_id}, x-access-token=${req.userContext.access_token ?? '(not set)'}`);
    next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(`   ❌ REJECTED: JWT verification failed - ${message}`);
    return res.status(401).json({ message: 'Unauthorized - Invalid JWT' });
  }
};

/**
 * Check if the request has Bearer token + organization_id headers.
 */
export const hasBearerAuth = (req: Request): boolean => {
  const authHeader = req.headers.authorization as string | undefined;
  const orgId = req.headers['x-organization-id'] as string | undefined;
  return !!(authHeader?.startsWith('Bearer ') && orgId);
};