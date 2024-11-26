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

const getAccount = async (token: string): Promise<Account> => {
  const url = `${config.backend.public_host}/v1/account`;
  try {
    const response = await axios.get<Account>(url, {
      headers: {
        'X-Access-Token': token,
      },
    });
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('getAccountError:', axiosError);
    if (axiosError.response && axiosError.response.status === 401) {
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
    console.error('getTempTokenError:', axiosError);
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

export const authorize = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Skip authentication for ActivePieces webhook and socket.io endpoints from trusted sources only
  if (req.originalUrl.includes('/activepieces')) {
    if (
      req.originalUrl.includes('/webhooks') ||
      req.originalUrl.includes('/socket.io')
    ) {
      // const trusted = isTrustedSource(req);
      const endpointType = req.originalUrl.includes('/webhooks')
        ? 'WEBHOOK'
        : 'SOCKET.IO';

      if (true) {
        console.log(
          `🔓 BYPASSING AUTH FOR ACTIVEPIECES ${endpointType} FROM TRUSTED SOURCE: ${req.originalUrl}`
        );
        console.log(
          `   Source: ${
            req.headers['x-real-ip'] ||
            req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress
          }`
        );
        console.log(`   Host: ${req.headers.host}`);
        return next();
      } else {
        console.log(
          `❌ BLOCKED ACTIVEPIECES ${endpointType} FROM UNTRUSTED SOURCE: ${req.originalUrl}`
        );
        console.log(
          `   Source: ${
            req.headers['x-real-ip'] ||
            req.headers['x-forwarded-for'] ||
            req.socket.remoteAddress
          }`
        );
        console.log(`   Host: ${req.headers.host}`);
        console.log(
          `   Trusted sources: ${config.activepieces.trusted_sources.join(
            ', '
          )}`
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
  let token = req.headers['x-access-token'] as string;

  // For ActivePieces routes, also check query parameters
  if (!token && req.originalUrl.includes('/activepieces')) {
    token = req.query?.token as string;
  }

  if (!orgId && !token) {
    console.log(`   ❌ REJECTED: No orgId and no token`);
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // Check if this is the admin proxy token
  if (
    token &&
    config.dataBoard.proxyToken &&
    token === config.dataBoard.proxyToken
  ) {
    console.log('✅ Data-board admin proxy token authenticated');
    req.userContext = {
      org_id: orgId || 'admin',
      access_token: token,
      user_id: 'admin-proxy-user',
      is_proxy_token: true,
    };
    return next();
  }

  req.userContext = {
    org_id: orgId,
    access_token: token,
  };

  if (token && !orgId) {
    try {
      const account = await getAccount(token);
      if (account && account.id && account.organization_id) {
        req.userContext.user_id = account.id;
        req.userContext.org_id = account.organization_id;
        req.userContext.business_unit_id = account?.team_roles?.find(
          (role) => role.organization_id === account.organization_id
        )?.business_unit_id;
        next();
      } else {
        console.log(
          `   ❌ REJECTED: Token validation failed - account: ${JSON.stringify(
            account
          )}`
        );
        return res
          .status(401)
          .json({ message: 'Unauthorized - Invalid token' });
      }
    } catch (error: unknown) {
      console.log(
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
    next();
  }
};
