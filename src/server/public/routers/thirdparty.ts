import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';
import crypto from 'crypto';
import { orgGuardGateway } from '../../middlewares/orgGuardGateway';

const router = express.Router();

// Middleware to capture and buffer the raw body
router.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    const chunks: Buffer[] = [];
    
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      
      if (rawBody) {
        try {
          (req as any).rawBody = rawBody;
          (req as any).parsedBody = JSON.parse(rawBody);
          console.log('========= CAPTURED RAW BODY =========');
          console.log('   Raw:', rawBody);
          console.log('   Parsed:', (req as any).parsedBody);
          
          // Re-inject body stream cho proxy middleware
          req.body = (req as any).parsedBody;
        } catch (e) {
          console.log('   Failed to parse body:', e);
          (req as any).rawBody = rawBody;
        }
      }
      next();
    });
    
    req.on('error', (err) => {
      console.error('Error reading body:', err);
      next();
    });
  } else {
    next();
  }
});

router.use(
  '/board_search/',
  createProxyMiddleware({
    target: config.backend.private_host,
    changeOrigin: true,
    pathRewrite: {
      '^/': '/v1/meilisearch/',
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        console.log(`========= proxy board_search:`);
        console.log(`   Original URL: ${req.originalUrl}`);
        console.log(`   Request Path: ${req.path}`);
        console.log(`   Target: ${config.backend.public_host}`);
        console.log(
          `   Forwarded URL: ${config.backend.public_host}${req.path}`
        );
        console.log(`   Method: ${req.method}`);
        console.log(
          `   Content-Type: ${req.headers['content-type'] || 'NONE'}`
        );
        console.log(
          `   Content-Lenght: ${req.headers['content-length'] || 'NONE'}`
        );
        console.log(`   Body: ${JSON.stringify(req.body)}`);
        console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
        console.log(
          `   User Context: ${JSON.stringify(req.userContext, null, 2)}`
        );

        if (req.userContext?.org_id) {
          proxyReq.setHeader('x-organization-id', req.userContext.org_id);
        }
        if (req.userContext?.user_id) {
          proxyReq.setHeader('x-user-id', req.userContext.user_id);
        }
      },
    },
  })
);

router.use(
  '/triger_channel_workflow',
  createProxyMiddleware({
    target: config.backend.public_host,
    changeOrigin: true,
    pathRewrite: {
      '^/': '/v1/triger_channel_workflow',
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        if (req.userContext?.org_id && req.userContext.user_id) {
          const userId = req.userContext.user_id;

          const sha1 = crypto.createHash('sha1').update(userId).digest('hex');
          const checkValue = crypto
            .createHash('md5')
            .update(sha1)
            .digest('hex');

          proxyReq.setHeader('from-third-party', userId);
          proxyReq.setHeader('check-third-party', checkValue);
        }
      },
    },
  })
);

router.use(
  '/boards',
  orgGuardGateway({
    bodyKeys: ['organization_id', 'org_id'],
    checkBody: true,
    requireOrgInRequest: false,
    verbose: true,
  }),
  createProxyMiddleware({
    target: config.backend.private_host,
    changeOrigin: true,
    pathRewrite: {
      '^/': '/v1/board/',
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        console.log(`========= proxy board - upload:`);
        console.log(`   Original URL: ${req.originalUrl}`);
        console.log(`   Request Path: ${req.path}`);
        console.log(`   Target: ${config.backend.private_host}`);
        console.log(
          `   Forwarded URL: ${config.backend.private_host}${req.path}`
        );
        console.log(`   Method: ${req.method}`);
        console.log(
          `   Content-Type: ${req.headers['content-type'] || 'NONE'}`
        );
        console.log(
          `   Content-Lenght: ${req.headers['content-length'] || 'NONE'}`
        );
        console.log(`   Body: ${JSON.stringify(req.body)}`);
        console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
        console.log(
          `   User Context: ${JSON.stringify(req.userContext, null, 2)}`
        );

        if (req.userContext?.org_id) {
          proxyReq.setHeader('x-organization-id', req.userContext.org_id);
        }
        if (req.userContext?.user_id) {
          proxyReq.setHeader('x-user-id', req.userContext.user_id);
        }
        if (req.body) {
          let bodyData: string;
          
          if (typeof req.body === 'string') {
            bodyData = req.body;
          } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            bodyData = JSON.stringify(req.body);
          } else {
            return; // No body to send
          }

          if (bodyData) {
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        }
      },
    },
  })
);

router.use(
  '/ai-service',
  createProxyMiddleware({
    target: config.ai.python_host,
    changeOrigin: true,
    pathRewrite: {
      '^/': '/api/v1/', // add /v3/ to the basepath
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        console.log(`========= proxy ai-service:`);
        console.log(`   Body: ${JSON.stringify(req.body)}`);
        console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
        console.log(
          `   User Context: ${JSON.stringify(req.userContext, null, 2)}`
        );

        if (req.userContext?.org_id) {
          proxyReq.setHeader('x-organization-id', req.userContext.org_id);
        }
        if (req.userContext?.user_id) {
          proxyReq.setHeader('x-user-id', req.userContext.user_id);
        }
      },
    },
  })
);
router.use(
  '/organization/:org_id/marketplaces',
  orgGuardGateway({
    paramKeys: ['org_id'],
    requireOrgInRequest: true, 
    verbose: true,
  }),
  createProxyMiddleware({
    target: config.backend.private_host,
    changeOrigin: true,
    pathRewrite: (path, req) => {
      // Express strips /organization/:org_id/marketplaces, so we need to add it back
      // / -> /v1/organization/:org_id/marketplaces
      // /?query -> /v1/organization/:org_id/marketplaces?query
      // /email-templates/xxx -> /v1/organization/:org_id/marketplaces/email-templates/xxx
      const orgId = req.params.org_id;
      let newPath;
      
      if (path === '/') {
        newPath = `/v1/organization/${orgId}/marketplaces`;
      } else if (path.startsWith('/?')) {
        newPath = `/v1/organization/${orgId}/marketplaces${path.substring(1)}`;
      } else {
        newPath = `/v1/organization/${orgId}/marketplaces${path}`;
      }
      
      console.log(`   [pathRewrite] ${path} -> ${newPath}`);
      return newPath;
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        console.log(`========= proxy /organization/:org_id/marketplaces:`);
        console.log(`   Original URL: ${req.originalUrl}`);
        console.log(`   Request Path: ${req.path}`);
        console.log(`   Org ID Param: ${req.params.org_id}`);
        console.log(`   Target: ${config.backend.private_host}`);
        console.log(`   Method: ${req.method}`);
        console.log(
          `   Content-Type: ${req.headers['content-type'] || 'NONE'}`
        );
        console.log(
          `   Content-Length: ${req.headers['content-length'] || 'NONE'}`
        );
        console.log(`   Body: ${JSON.stringify(req.body)}`);
        console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
        console.log(
          `   User Context: ${JSON.stringify(req.userContext, null, 2)}`
        );

        if (req.userContext?.org_id) {
          proxyReq.setHeader('x-organization-id', req.userContext.org_id);
        }
        if (req.userContext?.user_id) {
          proxyReq.setHeader('x-user-id', req.userContext.user_id);
        }
        if (req.body) {
          let bodyData: string;
          
          if (typeof req.body === 'string') {
            bodyData = req.body;
          } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            bodyData = JSON.stringify(req.body);
          } else {
            return; // No body to send
          }

          if (bodyData) {
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        }
      },
    },
  })
);

router.use(
  '/organization/:org_id/users/:user_id/schedulers',
  orgGuardGateway({
    paramKeys: ['org_id'],
    requireOrgInRequest: true, 
    verbose: true,
  }),
  createProxyMiddleware({
    target: config.backend.private_host,
    changeOrigin: true,
    pathRewrite: (path, req) => {
      // Express strips /organization/:org_id/users/:user_id/schedulers
      const orgId = req.params.org_id;
      const userId = req.params.user_id;
      let newPath;
      
      if (path === '/') {
        newPath = `/v1/organization/${orgId}/users/${userId}/schedulers`;
      } else if (path.startsWith('/?')) {
        newPath = `/v1/organization/${orgId}/users/${userId}/schedulers${path.substring(1)}`;
      } else {
        newPath = `/v1/organization/${orgId}/users/${userId}/schedulers${path}`;
      }
      
      console.log(`   [pathRewrite] ${path} -> ${newPath}`);
      return newPath;
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        console.log(`========= proxy /organization/:org_id/users/:user_id/schedulers:`);
        console.log(`   Original URL: ${req.originalUrl}`);
        console.log(`   Request Path: ${req.path}`);
        console.log(`   Org ID Param: ${req.params.org_id}`);
        console.log(`   User ID Param: ${req.params.user_id}`);
        console.log(`   Target: ${config.backend.private_host}`);
        console.log(`   Method: ${req.method}`);
        console.log(
          `   Content-Type: ${req.headers['content-type'] || 'NONE'}`
        );
        console.log(
          `   Content-Length: ${req.headers['content-length'] || 'NONE'}`
        );
        console.log(`   Body: ${JSON.stringify(req.body)}`);
        console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
        console.log(
          `   User Context: ${JSON.stringify(req.userContext, null, 2)}`
        );

        if (req.userContext?.org_id) {
          proxyReq.setHeader('x-organization-id', req.userContext.org_id);
        }
        if (req.userContext?.user_id) {
          proxyReq.setHeader('x-user-id', req.userContext.user_id);
        }
        if (req.body) {
          let bodyData: string;
          
          if (typeof req.body === 'string') {
            bodyData = req.body;
          } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            bodyData = JSON.stringify(req.body);
          } else {
            return; // No body to send
          }

          if (bodyData) {
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        }
      },
    },
  })
);

// Proxy for APIs with org_id in the URL path: /organization/:org_id/channels/*
router.use(
  '/organization/:org_id/channels',
  orgGuardGateway({
    paramKeys: ['org_id'],
    requireOrgInRequest: true, // Required because org_id is in the URL
    verbose: true,
  }),
  createProxyMiddleware({
    target: config.backend.private_host,
    changeOrigin: true,
    pathRewrite: (path, req) => {
      // Express strips /organization/:org_id/channels, so we need to add it back
      const orgId = req.params.org_id;
      let newPath;
      
      if (path === '/') {
        newPath = `/v1/organization/${orgId}/channels`;
      } else if (path.startsWith('/?')) {
        newPath = `/v1/organization/${orgId}/channels${path.substring(1)}`;
      } else {
        newPath = `/v1/organization/${orgId}/channels${path}`;
      }
      
      console.log(`   [pathRewrite] ${path} -> ${newPath}`);
      return newPath;
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        console.log(`========= proxy /organization/:org_id/channels:`);
        console.log(`   Original URL: ${req.originalUrl}`);
        console.log(`   Request Path: ${req.path}`);
        console.log(`   Org ID Param: ${req.params.org_id}`);
        console.log(`   Target: ${config.backend.private_host}`);
        console.log(`   Method: ${req.method}`);
        console.log(
          `   Content-Type: ${req.headers['content-type'] || 'NONE'}`
        );
        console.log(
          `   Content-Length: ${req.headers['content-length'] || 'NONE'}`
        );
        console.log(`   Body: ${JSON.stringify(req.body)}`);
        console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
        console.log(
          `   User Context: ${JSON.stringify(req.userContext, null, 2)}`
        );

        if (req.userContext?.org_id) {
          proxyReq.setHeader('x-organization-id', req.userContext.org_id);
        }
        if (req.userContext?.user_id) {
          proxyReq.setHeader('x-user-id', req.userContext.user_id);
        }
        if (req.body) {
          let bodyData: string;
          
          if (typeof req.body === 'string') {
            bodyData = req.body;
          } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            bodyData = JSON.stringify(req.body);
          } else {
            return; // No body to send
          }

          if (bodyData) {
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        }
      },
    },
  })
);

router.use(
  '/conversations',
  orgGuardGateway({
    bodyKeys: ['organization_id', 'org_id'],
    headerKeys: ['organization_id', 'organization-id', 'org_id', 'org-id'],
    queryKeys: ['organization_id', 'org_id'],
    checkBody: true,
    requireOrgInRequest: false,
    verbose: true,
  }),
  createProxyMiddleware({
    target: config.backend.private_host,
    changeOrigin: true,
    pathRewrite: (path, req) => {
      // / -> /v1/conversations
      // /?query -> /v1/conversations?query
      // /conv_123 -> /v1/conversations/conv_123
      let newPath;
      
      if (path === '/') {
        newPath = '/v1/conversations';
      } else if (path.startsWith('/?')) {
        newPath = `/v1/conversations${path.substring(1)}`;
      } else {
        newPath = `/v1/conversations${path}`;
      }
      
      console.log(`   [pathRewrite] ${path} -> ${newPath}`);
      return newPath;
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        console.log(`========= proxy conversations:`);
        console.log(`   Original URL: ${req.originalUrl}`);
        console.log(`   Request Path: ${req.path}`);
        console.log(`   Target: ${config.backend.private_host}`);
        console.log(`   Method: ${req.method}`);
        console.log(
          `   Content-Type: ${req.headers['content-type'] || 'NONE'}`
        );
        console.log(
          `   Content-Length: ${req.headers['content-length'] || 'NONE'}`
        );
        console.log(`   Body: ${JSON.stringify(req.body)}`);
        console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
        console.log(
          `   User Context: ${JSON.stringify(req.userContext, null, 2)}`
        );

        if (req.userContext?.org_id) {
          proxyReq.setHeader('x-organization-id', req.userContext.org_id);
        }
        if (req.userContext?.user_id) {
          proxyReq.setHeader('x-user-id', req.userContext.user_id);
        }
        if (req.body) {
          let bodyData: string;
          
          if (typeof req.body === 'string') {
            bodyData = req.body;
          } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            bodyData = JSON.stringify(req.body);
          } else {
            return; // No body to send
          }

          if (bodyData) {
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        }
      },
    },
  })
);

router.use(
  '/channels',
  orgGuardGateway({
    bodyKeys: ['organization_id', 'org_id'],
    headerKeys: ['organization_id', 'organization-id', 'org_id', 'org-id'],
    checkBody: true,
    requireOrgInRequest: false,
    verbose: true,
  }),
  createProxyMiddleware({
    target: config.backend.private_host,
    changeOrigin: true,
    pathRewrite: {
      '^/': '/v1/channel/',
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        console.log(`========= proxy channel:`);
        console.log(`   Original URL: ${req.originalUrl}`);
        console.log(`   Request Path: ${req.path}`);
        console.log(`   Target: ${config.backend.private_host}`);
        console.log(
          `   Forwarded URL: ${config.backend.private_host}${req.path}`
        );
        console.log(`   Method: ${req.method}`);
        console.log(
          `   Content-Type: ${req.headers['content-type'] || 'NONE'}`
        );
        console.log(
          `   Content-Length: ${req.headers['content-length'] || 'NONE'}`
        );
        console.log(`   Body: ${JSON.stringify(req.body)}`);
        console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
        console.log(
          `   User Context: ${JSON.stringify(req.userContext, null, 2)}`
        );

        if (req.userContext?.org_id) {
          proxyReq.setHeader('x-organization-id', req.userContext.org_id);
        }
        if (req.userContext?.user_id) {
          proxyReq.setHeader('x-user-id', req.userContext.user_id);
        }
        if (req.body) {
          let bodyData: string;
          
          if (typeof req.body === 'string') {
            bodyData = req.body;
          } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            bodyData = JSON.stringify(req.body);
          } else {
            return; // No body to send
          }

          if (bodyData) {
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        }
      },
    },
  })
);

router.use(
  '/categories',
  orgGuardGateway({
    bodyKeys: ['organization_id', 'org_id'],
    headerKeys: ['organization_id', 'organization-id', 'org_id', 'org-id'],
    checkBody: true,
    requireOrgInRequest: false,
    verbose: true,
  }),
  createProxyMiddleware({
    target: config.backend.private_host,
    changeOrigin: true,
    pathRewrite: (path, req) => {
      // Express strips /categories, so path is / or /123 or /?query or /123?query
      // / -> /v1/categories
      // /?query -> /v1/categories?query (no trailing slash)
      // /123 -> /v1/categories/123
      // /123?query -> /v1/categories/123?query
      
      if (path === '/') {
        return '/v1/categories';
      } else if (path.startsWith('/?')) {
        // Remove the / before ?
        return '/v1/categories' + path.substring(1);
      } else {
        return '/v1/categories' + path;
      }
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        console.log(`========= proxy categories:`);
        console.log(`   Original URL: ${req.originalUrl}`);
        console.log(`   Request Path: ${req.path}`);
        console.log(`   Request URL: ${req.url}`);
        console.log(`   Query: ${JSON.stringify(req.query)}`);
        console.log(`   Target: ${config.backend.private_host}`);
        console.log(`   Proxy Request Path: ${proxyReq.path}`);
        console.log(`   Method: ${req.method}`);
        console.log(
          `   Content-Type: ${req.headers['content-type'] || 'NONE'}`
        );
        console.log(
          `   Content-Length: ${req.headers['content-length'] || 'NONE'}`
        );
        console.log(`   Body: ${JSON.stringify(req.body)}`);
        console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
        console.log(
          `   User Context: ${JSON.stringify(req.userContext, null, 2)}`
        );

        if (req.userContext?.org_id) {
          proxyReq.setHeader('x-organization-id', req.userContext.org_id);
        }
        if (req.userContext?.user_id) {
          proxyReq.setHeader('x-user-id', req.userContext.user_id);
        }
        if (req.body) {
          let bodyData: string;
          
          if (typeof req.body === 'string') {
            bodyData = req.body;
          } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            bodyData = JSON.stringify(req.body);
          } else {
            return; // No body to send
          }

          if (bodyData) {
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        }
      },
    },
  })
);

router.use(
  '/boards/upload',
  createProxyMiddleware({
    target: config.backend.private_host,
    changeOrigin: true,
    pathRewrite: {
      '^/': '/v1/board/upload',
    },
    followRedirects: false,
    ws: false,
    preserveHeaderKeyCase: true,
    proxyTimeout: 30000,
    timeout: 30000,
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        console.log(`========= board - upload:`);
        console.log(`   Original URL: ${req.originalUrl}`);
        console.log(`   Request Path: ${req.path}`);
        console.log(`   Target: ${config.backend.private_host}`);
        console.log(`   Forwarded URL: ${config.backend.private_host}${req.path}`);
        console.log(`   Method: ${req.method}`);
        console.log(`   Content-Type: ${req.headers['content-type'] || 'NONE'}`);
        console.log(`   Content-Lenght: ${req.headers['content-length'] || 'NONE'}`);
        console.log(`   Body: ${JSON.stringify(req.body)}`);
        console.log(`   All Headers: ${JSON.stringify(req.headers, null, 2)}`);
        console.log(`   User Context: ${JSON.stringify(req.userContext, null, 2)}`);

        if (req.userContext?.org_id) {
          proxyReq.setHeader('x-organization-id', req.userContext.org_id);
        }
        if (req.userContext?.user_id) {
          proxyReq.setHeader('x-user-id', req.userContext.user_id);
        }
      },
    },
  })
);

export default router;
