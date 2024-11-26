import { Request, Response, NextFunction } from 'express';

type OrgGuardOptions = {
  headerName?: string;              // header do gateway set, mặc định 'x-organization-id' (cho context org)
  paramKeys?: string[];             // key tìm org trong params
  queryKeys?: string[];             // key tìm org trong query
  bodyKeys?: string[];              // key tìm org trong body
  headerKeys?: string[];            // key tìm org trong request headers (từ client)
  checkBody?: boolean;              // có đọc body hay không
  requireOrgInRequest?: boolean;    // có bắt buộc client gửi org trong payload không
  onlyPaths?: RegExp[];             // chỉ áp dụng cho các path khớp
  exceptPaths?: RegExp[];           // bỏ qua cho các path khớp
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
    console.log('========= [orgGuardGateway] MIDDLEWARE CALLED =========');
    console.log('   Path:', req.path);
    console.log('   Method:', req.method);
    console.log('   CheckBody:', checkBody);
    
    // Lọc theo path nếu cấu hình
    if (onlyPaths?.length && !onlyPaths.some(rx => rx.test(req.path))) {
      console.log('   SKIPPED: path not in onlyPaths');
      return next();
    }
    if (exceptPaths?.length &&  exceptPaths.some(rx => rx.test(req.path))) {
      console.log('   SKIPPED: path in exceptPaths');
      return next();
    }

    const ctxOrg =
      (req as any).userContext?.org_id ??
      req.get(headerName);

    console.log('   Context Org:', ctxOrg);

    if (!ctxOrg) {
      if (verbose) console.warn('[orgGuardGateway] missing organization context');
      return res.status(401).json({ message: 'Unauthorized - missing organization context' });
    }

    // Debug: kiểm tra body type và sources
    console.log('[orgGuardGateway] Body debug:', {
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
    
    // Ưu tiên sử dụng parsedBody nếu có (từ raw body middleware)
    let bodyObj = (req as any).parsedBody || req.body;
    
    // Nếu body là string (do express.text()), cần parse thành JSON
    if (checkBody && typeof bodyObj === 'string' && bodyObj.trim()) {
      try {
        bodyObj = JSON.parse(bodyObj);
        if (verbose) console.log('[orgGuardGateway] Parsed string body to object:', bodyObj);
      } catch (e) {
        if (verbose) console.warn('[orgGuardGateway] Failed to parse body as JSON:', e);
      }
    }
    
    const fromBody = checkBody ? pickFirst(bodyObj, bodyKeys) : undefined;

    // Ưu tiên: params > query > headers > body
    const requestedOrg = fromParams ?? fromQuery ?? fromHeaders ?? fromBody;
    
    if (verbose) {
      console.log('[orgGuardGateway] Org sources:', {
        fromParams,
        fromQuery,
        fromHeaders,
        fromBody,
        selected: requestedOrg,
      });
    }

    if (!requestedOrg) {
      if (requireOrgInRequest) {
        if (verbose) console.warn('[orgGuardGateway] org required but not provided');
        return res.status(400).json({ message: 'Bad Request - organization id is required' });
      }
      if (verbose) console.log('[orgGuardGateway] no org in request → skip match');
      return next();
    }

    // 4) So khớp
    if (`${requestedOrg}` !== `${ctxOrg}`) {
      if (verbose) {
        console.warn('[orgGuardGateway] organization mismatch', {
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
