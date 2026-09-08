import logger from '../logging/logger';
import { NextFunction, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import config from '../../config';
import Account from '../../core/models/account';
import { hasBearerAuth, jwtAuthorize } from './jwtAuth';

// Helper function to check if request is from trusted source
const isTrustedSource = (req: Request): boolean => {
  // Check X-Forwarded-For, X-Real-IP, or direct IP
  const forwardedFor = req.headers['x-forwarded-for'] as string;
  const realIp = req.headers['x-real-ip'] as string;
  const remoteIp = req.socket.remoteAddress;

  // Get the host header
  const host = req.headers.host;

  // Check if any of these match trusted sources
  const sources = [forwardedFor, realIp, remoteIp, host].filter(Boolean);

  return sources.some((source) =>
    config.activepieces.trusted_sources.some((trusted) =>
      source?.includes(trusted)
    )
  );
};

// Token validation across both the legacy backend (pre-retire) and platform-
// service (post-retire). Both expose "give me the user owning this token"
// endpoints. Platform is tried first because it's the new source of truth;
// legacy is a fallback for acc_ tokens still held against the old service.
const getAccount = async (token: string): Promise<Account> => {
  // Tracks whether the platform (source of truth) explicitly rejected the token
  // with a 401. Used below so that a token the platform calls invalid still
  // resolves to 401 even when the legacy backend fallback is down/erroring.
  let platformRejected = false;

  // 1. Try platform — /v1/user/_me returns UserController.toResponse(user)
  //    with object_name/id/organization_id/etc. Shape adapted below.
  try {
    const platformUrl = `${config.platform.host}/v1/user/_me`;
    const response = await axios.get<any>(platformUrl, {
      headers: { 'X-Access-Token': token },
    });
    const u = response.data;
    if (u && (u.id || u.public_id) && u.organization_id) {
      return {
        // internal_id = PostgreSQL u_ UUID (needed by platform for BU membership lookup)
        // public_id   = legacy Mongo-migrated u_ UUID (used by channel-service notifications)
        id: u.internal_id || u.id,
        public_id: u.public_id || u.internal_id || u.id,
        organization_id: u.organization_id,
        team_roles: [],
        team_ids: u.team_ids ?? [],
      } as unknown as Account;
    }
  } catch (error) {
    const axiosError = error as AxiosError;
    // 401 = token isn't a platform token; fall through to backend
    if (axiosError.response && axiosError.response.status === 401) {
      platformRejected = true;
    } else {
      logger.warn(
        'platform auth lookup failed (non-401), falling back to backend:',
        axiosError.message
      );
    }
  }

  // 2. Fall back to legacy backend — /v1/account
  const url = `${config.backend.public_host}/v1/account`;
  try {
    const response = await axios.get<Account>(url, {
      headers: { 'X-Access-Token': token },
    });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error('getAccountError:', axiosError.message);
    if (axiosError.response && axiosError.response.status === 401) {
      throw new Error('Unauthorized');
    }
    // The legacy backend couldn't validate the token (it's down, 5xx, 404,
    // timeout, etc.). If the platform already rejected it with a 401, the token
    // is genuinely invalid — surface that as Unauthorized instead of letting it
    // bubble up as a 500. Only a token that neither source could even evaluate
    // stays a 5xx (a real infra failure worth alerting on).
    if (platformRejected) {
      throw new Error('Unauthorized');
    }
    throw axiosError;
  }
};

export const getTempToken = async (
  req: Request
): Promise<string | undefined> => {
  const tempToken = req.headers['x-temp-token'] as string;
  const userAgent = req.headers['user-agent'] as string;
  try {
    const response = await axios.get(
      `${config.backend.public_host}/v1/temp_token/${tempToken}`,
      {
        headers: {
          'X-Temp-Token': tempToken,
          'User-Agent': userAgent,
        },
      }
    );
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error('getTempTokenError:', axiosError);
    if (axiosError.response) {
      if (axiosError.response.status === 401) {
        throw new Error('Unauthorized');
      }
      if (axiosError.response.status === 404) {
        return undefined;
      }
      if (axiosError.response.status === 400) {
        return undefined;
      }
    }
    throw axiosError;
  }
};

// Short-TTL cache: access token -> resolved internal user_id. When the FE sends
// x-organization-id (the common dashboard/chatroom case) the request is already
// authorized without an account lookup, but we still want the caller's internal
// user_id for downstream attribution — this avoids a platform /v1/user/_me call
// on every request. "" caches a negative (contact/widget/invalid token).
const USER_ID_BY_TOKEN_TTL_MS = 5 * 60 * 1000;
const userIdByToken = new Map<string, { user_id: string; expires_at: number }>();

/**
 * Best-effort resolve a token → internal user_id, cached, NEVER throws. Returns
 * '' when the token isn't a platform/backend user (e.g. a chat-widget contact
 * token) or can't be resolved. Use on dual-use routes where a request may carry
 * either an agent USER token (needs x-user-id forwarded for attribution) or a
 * contact token (must pass through to channel-service's contactMiddleware).
 */
export async function resolveUserIdSoft(token: string): Promise<string> {
  if (!token) return '';
  const now = Date.now();
  const cached = userIdByToken.get(token);
  if (cached && cached.expires_at > now) return cached.user_id;
  let resolved = '';
  try {
    const account = await getAccount(token);
    if (account && account.id && account.organization_id) resolved = account.id;
  } catch {
    /* contact / invalid token — cache the negative below */
  }
  userIdByToken.set(token, { user_id: resolved, expires_at: now + USER_ID_BY_TOKEN_TTL_MS });
  return resolved;
}

export const authorize = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Skip authentication for Workflow webhook and socket.io endpoints from trusted sources only
  if (req.originalUrl.includes('/activepieces')) {
    if (
      req.originalUrl.includes('/webhooks') ||
      req.originalUrl.includes('/socket.io')
    ) {
      const trusted = isTrustedSource(req);
      const endpointType = req.originalUrl.includes('/webhooks')
        ? 'WEBHOOK'
        : 'SOCKET.IO';

      if (trusted) {
        logger.info(
          `🔓 BYPASSING AUTH FOR ACTIVEPIECES ${endpointType} FROM TRUSTED SOURCE: ${req.originalUrl}`
        );
        return next();
      } else {
        logger.info(
          `❌ BLOCKED ACTIVEPIECES ${endpointType} FROM UNTRUSTED SOURCE: ${req.originalUrl}`
        );
        logger.info(
          `   Trusted sources: ${config.activepieces.trusted_sources.join(', ')}`
        );
        return res
          .status(403)
          .json({ message: 'Forbidden - Untrusted source' });
      }
    }
  }

  // If request has Bearer token + x-organization-id, use JWT auth from auth-service
  if (hasBearerAuth(req)) {
    return jwtAuthorize(req, res, next);
  }

  const orgId = req.params?.org_id || (req.query?.organizationId as string);
  const xAccessToken = req.headers['x-access-token'] as string;
  const authHeader = req.headers.authorization as string | undefined;
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined;

  // The chat-widget puts the agent/user bootstrap token in Authorization and
  // its own contact token in X-Access-Token. Authenticate against Bearer first
  // (it identifies the calling user) and let X-Access-Token forward as-is for
  // downstream services that key off it (channel-service's contact middleware).
  let authToken = bearerToken || xAccessToken;

  // For Workflow routes, also check query parameters
  if (!authToken && req.originalUrl.includes('/activepieces')) {
    authToken = req.query?.token as string;
  }

  if (!orgId && !authToken) {
    logger.info(`   ❌ REJECTED: No orgId and no token`);
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Check if this is the admin proxy token
  if (
    authToken &&
    config.dataBoard.proxyToken &&
    authToken === config.dataBoard.proxyToken
  ) {
    logger.info('✅ Data-board admin proxy token authenticated');
    req.userContext = {
      org_id: orgId || 'admin',
      access_token: authToken,
      user_id: 'admin-proxy-user',
      is_proxy_token: true,
    };
    return next();
  }

  req.userContext = {
    org_id: orgId,
    // Preserve the original x-access-token so downstream services receive
    // exactly what the caller sent (e.g. chat-widget contact tokens).
    access_token: xAccessToken || authToken,
  };

  if (authToken) {
    try {
      const account = await getAccount(authToken);
      if (account && account.id && account.organization_id) {
        req.userContext.user_id = account.id;
        req.userContext.user_public_id = (account as any).public_id || account.id;
        req.userContext.org_id = account.organization_id;
        req.userContext.business_unit_id = account?.team_roles?.find(
          (role) => role.organization_id === account.organization_id
        )?.business_unit_id;
        // Platform auth returns no team_roles, so business_unit_id is empty above.
        // Channel create/onboard needs it (channel-service stamps bu_id, which
        // conversations inherit -> BU-scoped dashboard lists). Resolve the user's
        // team -> business_unit_id for those POSTs only (rare) to keep the auth
        // hot path light. Best-effort — never blocks the request.
        if (
          !req.userContext.business_unit_id &&
          req.method === 'POST' &&
          /\/channels?\/_/.test(req.originalUrl)
        ) {
          const teamId = (account as unknown as { team_ids?: string[] })
            .team_ids?.[0];
          if (teamId) {
            try {
              const teamResp = await axios.get<any>(
                `${config.platform.host}/v1/teams/${teamId}`,
                { headers: { 'X-Access-Token': authToken } },
              );
              req.userContext.business_unit_id =
                teamResp.data?.business_unit_id ??
                teamResp.data?.data?.business_unit_id;
            } catch (e) {
              logger.info(
                `   business_unit_id team lookup skipped: ${
                  e instanceof Error ? e.message : 'error'
                }`,
              );
            }
          }
        }
        next();
      } else {
        logger.info(
          `   ❌ REJECTED: Token validation failed - account: ${JSON.stringify(
            account
          )}`
        );
        return res
          .status(401)
          .json({ message: 'Unauthorized - Invalid token' });
      }
    } catch (error: unknown) {
      logger.info(
        `   ❌ REJECTED: Token validation failed - ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      if (error instanceof Error && error.message === 'Unauthorized') {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  } else {
    // orgId is present (FE sends x-organization-id) → the request is already
    // authorized. But downstream services still need the caller's internal
    // user_id to attribute agent actions — e.g. channel-service stores an agent
    // reply with from=user_id; without x-user-id it saves from="" and the reply
    // renders unattributed (and is_agent_sent is wrong). Resolve it best-effort
    // (cached). Contact/widget tokens aren't platform users → getAccount fails →
    // cached as negative and NEVER rejected (the widget keys off X-Access-Token).
    if (authToken && !req.userContext.user_id) {
      const uid = await resolveUserIdSoft(authToken);
      if (uid) req.userContext.user_id = uid;
    }
    next();
  }
};
