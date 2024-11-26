import express from 'express';
import cors from 'cors';
import config from '../../config';
import logger from '../middlewares/logger';
import aiService from './routers/ai';
import aiServiceV3 from './routers/ai_v3';
import aiServiceChat from './routers/ai_chat';
import ipsService from './routers/ips';
import ipsV2Service from './routers/ips_v2';
import marketplaceService, { marketplaceNoAuthService } from './routers/marketplace';
import marketplaceTemplateService from './routers/marketplaceTemplate';
import apiBackendService from './routers/api-backend';
import apiBackendServiceV2 from './routers/api-backend_v2';
import apiBackendServiceV3 from './routers/api-backend_v3';
import apiBackendServicePrivate from './routers/api-backend_private';
import apiBackendJourneyService from './routers/api-backend_journey';
import apiPlatformService from './routers/api-platform';
import apiPlatformServiceV2 from './routers/api-platform_v2';
import apiPlatformServiceV3 from './routers/api-platform_v3';
import apiPredictService from './routers/api-predict';
import activePiecesBackendService from './routers/activepieces-backend';
import fileService from './routers/files';
import fileServiceV1 from './routers/files-v1';
import filesPublicService from './routers/files-public';
import { channelServiceAuthProxy } from './routers/channel-service';
import { dataBoardBackendAuthProxy } from './routers/data-board-backend';
import { createProxyMiddleware } from 'http-proxy-middleware';
import thirdpartyRouter from './routers/thirdparty';
import { thirdPartyAuth } from '../middlewares/thirdPartyAuth';
import licenseAuth, { initializeLicenseAuth } from '../middlewares/licenseAuth';
import authRouter from '../middlewares/authRouter';
import createLicenseRouter from './routers/license';
import externalWebhookProxy from './routers/external-webhook';
import messageSuggestionService from './routers/message-suggestion';

const startPublicServer = async (appConfig?: {
  licenseRequired: boolean;
  secret?: string;
}) => {
  try {
    const app = express();
    // GLOBAL MIDDLEWARES (order matters)
    // 1. CORS (needs to run early so OPTIONS preflight is handled before other work)
    const corsOptions = {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-api-key',
        'x-access-token',
        'x-temp-token',
        'user-agent',
        // ActivePieces specific headers
        'organization-id',
        'x-organization-id',
        'user-email',
        'user-id',
        'x-user-id',
        'x-user-email',
      ],
    };
    app.use(cors(corsOptions));

    app.use(express.text({ type: 'text/*' }));
    // URL Encoded parser
    app.use(express.urlencoded({ extended: false }));

    app.use(logger);
    // app.use(rateLimiter);

    // Initialize license service with secret
    if (appConfig?.secret) {
      console.log(
        'Initializing license service with secret',
        appConfig?.secret,
      );
      initializeLicenseAuth(appConfig.secret);
      // setLicenseSecret(appConfig.secret);
    }

    // External Webhook — mounted BEFORE auth so Google push notifications pass through
    app.use('/external-webhook', externalWebhookProxy);

    // Global middleware
    // Adds the header "X-License-Required" to indicate whether license is required
    app.use((req, res, next) => {
      const required = !!appConfig?.licenseRequired;
      res.setHeader('X-License-Required', String(required));

      if (required) {
        return licenseAuth(req, res, next); // delegate to licenseAuth when required
      }

      next();
    });

    app.get('/', (_, res) => {
      console.log('appConfig', appConfig);

      res.json({
        name: 'App Gateway Public Server',
        version: config.version,
        env: config.environment,
        licenseRequired: appConfig?.licenseRequired || false,
        secretConfigured: !!appConfig?.secret,
      });
    });

    // ROUTES

    // License Management (always accessible)
    app.use('/license', createLicenseRouter(appConfig));

    // AI Service
    // app.use('/v1/ai', aiService);
    app.use('/v2/ai', aiService);
    app.use('/ai/v2', aiService);
    app.use('/v3/ai', aiServiceV3);
    app.use('/ai/v3', aiServiceV3);
    app.use('/chat/ai/ws/socket.io', createProxyMiddleware({
      changeOrigin: true,
      target: config.ai.ai_chat_websocket,
      ws: true,
      pathRewrite: {
        '^/': '/ws/socket.io/',
      },
    }));
    app.use('/chat/ai', aiServiceChat);

    // File Service — public download (no auth, for presigned URLs)
    app.use('/files/download', filesPublicService);

    // File Service (legacy)
    app.use('/files', fileService);

    // File Service v1 — must be before /v1/backend
    app.use('/v1/files', fileServiceV1);
    app.use('/files/v1', fileServiceV1);

    // Data Board Service
    app.use('/data-board', dataBoardBackendAuthProxy);      // canonical
    // app.use('/data-board', dataBoardService);            // removed — old proxy with /auth/* exemption (unused)

    // IPS Service
    app.use('/v1/ips', ipsService);
    app.use('/ips/v1', ipsService);
    app.use('/v2/ips', ipsV2Service);
    app.use('/ips/v2', ipsV2Service);

    // Marketplace Service — single proxy, marketplace owns its own versioning
    app.use('/v1/marketplaces/download', marketplaceNoAuthService);
    app.use('/v1/marketplaces', marketplaceService);
    app.use('/marketplaces/v1', marketplaceService);
    app.use('/v2/marketplaces', marketplaceService);
    app.use('/marketplaces/v2', marketplaceService);
    app.use('/v3/marketplaces', marketplaceService);
    app.use('/marketplaces/v3', marketplaceService);
    app.use('/v2/templates', marketplaceTemplateService);
    app.use('/templates/v2', marketplaceTemplateService);

    // ── Microservice routes (registered BEFORE backend catch-all) ──────────────
    // Each path listed here is served by the target microservice.
    // Any path NOT listed falls through to the backend proxy below.

    if (config.channelService.enabled) {
      // Channel-service — v1 paths
      const channelV1Router = express.Router();
      for (const p of [
        '/channels',
        '/conversations',
        '/team_conversations',
        '/conversation_messages',
        '/campaign',
        '/touchpoints',
        '/touchpoint',
        '/contacts',
        '/contact',
        '/notifications',
        '/message_templates',
        '/categories',
        '/whatsapp_templates',
        '/outbounds',
        '/assign',
        '/conversations_activities',
      ]) {
        channelV1Router.use(p, channelServiceAuthProxy);
      }
      app.use('/v1/backend', channelV1Router);
      app.use('/backend/v1', channelV1Router);

      // Channel-service — v2 paths
      const channelV2Router = express.Router();
      for (const p of [
        '/channels',
        '/conversations',
        '/team_conversations',
        '/message_templates',
        '/whatsapp_templates',
      ]) {
        channelV2Router.use(p, channelServiceAuthProxy);
      }
      app.use('/v2/backend', channelV2Router);
      app.use('/backend/v2', channelV2Router);

      // Channel-service — v3 paths
      const channelV3Router = express.Router();
      channelV3Router.use('/channels', channelServiceAuthProxy);
      app.use('/v3/backend', channelV3Router);
      app.use('/backend/v3', channelV3Router);
    }

    // ── Dedicated microservice routes (new canonical paths) ───────────────────
    // Frontend migrates to these; the /v1/backend/* mounts above remain as
    // backward-compat aliases until the frontend team completes the switch.
    app.use('/channel-service', channelServiceAuthProxy);      // canonical — service owns its own version (/v1, /v2, /v3)
    app.use('/v1/channel-service', channelServiceAuthProxy);   // deprecated alias — kept for compat
    app.use('/v1/data-board', dataBoardBackendAuthProxy);   // deprecated alias — kept for compat
    app.use('/v1/file-service', fileServiceV1);
    // ────────────────────────────────────────────────────────────────────────────

    // Backend API routes — public sub-paths (no authRouter required)
    const backendV1PublicSubPaths = [
      '/login',
      '/sso',
      '/sign_up/aws',
      '/aws_marketplace',
      '/temp_token',
      '/webhook',
      '/success',
      '/cancel',
      '/aws_callback',
      '/subscriptionPlans',
      '/external/token',
      '/form-files',
      '/license',
      // loginAccessMid
      '/access',
      '/organizations',
      // public chat file download (served as {url} after upload, no auth required)
      '/files/chat',
    ];
    const backendV1ConditionalAuth = (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
      const isPublic = backendV1PublicSubPaths.some(
        (subPath) => req.path === subPath || req.path.startsWith(subPath + '/')
      );
      if (isPublic) return next();
      return authRouter(req, res, next);
    };
    app.use('/v1/backend', backendV1ConditionalAuth, apiBackendService);
    app.use('/backend/v1', backendV1ConditionalAuth, apiBackendService);
    const backendV2PublicSubPaths = ['/organizations'];
    const backendV2ConditionalAuth = (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
      const isPublic = backendV2PublicSubPaths.some(
        (subPath) => req.path === subPath || req.path.startsWith(subPath + '/')
      );
      if (isPublic) return next();
      return authRouter(req, res, next);
    };
    app.use('/v2/backend', backendV2ConditionalAuth, apiBackendServiceV2);
    app.use('/backend/v2', backendV2ConditionalAuth, apiBackendServiceV2);
    app.use('/v3/backend', authRouter, apiBackendServiceV3);
    app.use('/backend/v3', authRouter, apiBackendServiceV3);
    app.use('/private/backend', authRouter, apiBackendServicePrivate);
    app.use('/journeys', apiBackendJourneyService);

    // Platform API routes — public sub-paths (no authRouter required)
    const platformV1PublicSubPaths = [
      '/login',
      '/sso',
      '/sign_up/aws',
      // loginAccessMid
      '/access',
      '/organizations',
    ];
    const platformV1ConditionalAuth = (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
      const isPublic = platformV1PublicSubPaths.some(
        (subPath) => req.path === subPath || req.path.startsWith(subPath + '/')
      );
      if (isPublic) return next();
      return authRouter(req, res, next);
    };
    app.use('/v1/platform', platformV1ConditionalAuth, apiPlatformService);
    app.use('/platform/v1', platformV1ConditionalAuth, apiPlatformService);
    const platformV2PublicSubPaths = ['/organizations'];
    const platformV2ConditionalAuth = (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
      const isPublic = platformV2PublicSubPaths.some(
        (subPath) => req.path === subPath || req.path.startsWith(subPath + '/')
      );
      if (isPublic) return next();
      return authRouter(req, res, next);
    };
    app.use('/v2/platform', platformV2ConditionalAuth, apiPlatformServiceV2);
    app.use('/platform/v2', platformV2ConditionalAuth, apiPlatformServiceV2);
    app.use('/v3/platform', authRouter, apiPlatformServiceV3);
    app.use('/platform/v3', authRouter, apiPlatformServiceV3);

    // Predict API route - register at root level to avoid path stripping
    app.use('/predict', apiPredictService);

    app.use('/3rd', thirdPartyAuth, thirdpartyRouter);

    // Message Suggestion Service
    app.use('/v1/ai-agent', messageSuggestionService);
    app.use('/ai-agent', messageSuggestionService);

    // ActivePieces API proxy - backend only
    app.use(
      '/activepieces/api/socket.io',
      createProxyMiddleware({
        changeOrigin: true,
        target: config.activepieces.web_socket,
        ws: true,
        pathRewrite: {
          '^/': '/api/socket.io/',
        },
      }),
    );
    app.use('/activepieces', activePiecesBackendService);

    // START SERVER
    const port = Number(config.publicServer.port ?? 9000);
    app.listen(port, '0.0.0.0', () => {
      console.log(`Public Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.log('Error starting public server: ', error);
    console.log('Exiting process');
  }
};

const publicServer = {
  startPublicServer,
};

export default publicServer;
