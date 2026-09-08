import logger from '../logging/logger';
import { Request, Response, NextFunction } from 'express';

type OrgGuardOptions = {
  headerName?: string;              // header set by the gateway, defaults to 'x-organization-id' (for org context)
  paramKeys?: string[];             // keys to find org in params
  queryKeys?: string[];             // keys to find org in query
  bodyKeys?: string[];              // keys to find org in body
  headerKeys?: string[];            // keys to find org in request headers (from client)
  checkBody?: boolean;              // whether to read the body
  requireOrgInRequest?: boolean;    // whether the client must send org in the payload
  onlyPaths?: RegExp[];             // only apply to matching paths
  exceptPaths?: RegExp[];           // skip matching paths
  verbose?: boolean;                // log debug
};

function pickFirst(obj: any, keys: string[]): string | undefined {
  if (!obj) return;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && `${v}`.trim() !== '') return `${v}`;
  }
}

export function orgGuardGateway(opts: OrgGuardOptions = {}) {
  const {
    headerName = 'x-organization-id',
    paramKeys = ['orgId', 'organization_id', 'org_id'],
    queryKeys = ['orgId', 'organization_id', 'org_id'],
    bodyKeys  = ['orgId', 'organization_id', 'org_id'],
    headerKeys = ['organization_id', 'organization-id', 'org_id', 'org-id'],
    checkBody = false,
    requireOrgInRequest = false,
    onlyPaths,
    exceptPaths,
    verbose = false,
  } = opts;

  return (req: Request, res: Response, next: NextFunction) => {
    logger.info('========= [orgGuardGateway] MIDDLEWARE CALLED =========');
    logger.info('   Path:', req.path);
    logger.info('   Method:', req.method);
    logger.info('   CheckBody:', checkBody);
    
    // Filter by path if configured
    if (onlyPaths?.length && !onlyPaths.some(rx => rx.test(req.path))) {
      logger.info('   SKIPPED: path not in onlyPaths');
      return next();
    }
    if (exceptPaths?.length &&  exceptPaths.some(rx => rx.test(req.path))) {
      logger.info('   SKIPPED: path in exceptPaths');
      return next();
    }

    const ctxOrg =
      (req as any).userContext?.org_id ??
      req.get(headerName);

    logger.info('   Context Org:', ctxOrg);

    if (!ctxOrg) {
      if (verbose) logger.warn('[orgGuardGateway] missing organization context');
      return res.status(401).json({ message: 'Unauthorized - missing organization context' });
    }

    // Debug: check body type and sources
    logger.info('[orgGuardGateway] Body debug:', {
      bodyType: typeof req.body,
      bodyIsString: typeof req.body === 'string',
      bodyKeys: typeof req.body === 'object' ? Object.keys(req.body) : 'N/A',
      bodyRaw: req.body,
      hasRawBody: !!(req as any).rawBody,
      hasParsedBody: !!(req as any).parsedBody,
      parsedBodyValue: (req as any).parsedBody,
    });

    const fromParams = pickFirst(req.params, paramKeys);
    const fromQuery  = pickFirst(req.query,  queryKeys);
    const fromHeaders = pickFirst(req.headers, headerKeys);
    
    // Prefer parsedBody if present (from the raw body middleware)
    let bodyObj = (req as any).parsedBody || req.body;
    
    // If body is a string (from express.text()), parse it to JSON
    if (checkBody && typeof bodyObj === 'string' && bodyObj.trim()) {
      try {
        bodyObj = JSON.parse(bodyObj);
        if (verbose) logger.info('[orgGuardGateway] Parsed string body to object:', bodyObj);
      } catch (e) {
        if (verbose) logger.warn('[orgGuardGateway] Failed to parse body as JSON:', e);
      }
    }
    
    const fromBody = checkBody ? pickFirst(bodyObj, bodyKeys) : undefined;

    // Priority: params > query > headers > body
    const requestedOrg = fromParams ?? fromQuery ?? fromHeaders ?? fromBody;
    
    if (verbose) {
      logger.info('[orgGuardGateway] Org sources:', {
        fromParams,
        fromQuery,
        fromHeaders,
        fromBody,
        selected: requestedOrg,
      });
    }

    if (!requestedOrg) {
      if (requireOrgInRequest) {
        if (verbose) logger.warn('[orgGuardGateway] org required but not provided');
        return res.status(400).json({ message: 'Bad Request - organization id is required' });
      }
      if (verbose) logger.info('[orgGuardGateway] no org in request → skip match');
      return next();
    }

    // 4) Match
    if (`${requestedOrg}` !== `${ctxOrg}`) {
      if (verbose) {
        logger.warn('[orgGuardGateway] organization mismatch', {
          expected: `${ctxOrg}`, received: `${requestedOrg}`, path: req.path, method: req.method,
        });
      }
      return res.status(403).json({
        message: 'Forbidden - organization mismatch',
        details: { expected: `${ctxOrg}`, received: `${requestedOrg}` },
      });
    }

    return next();
  };
}
