import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request, Response, NextFunction } from 'express';
import { ClientRequest } from 'http';
import { apiAuthenticate } from '../../middlewares/apiAuth';
import { authorize, resolveUserIdSoft } from '../../middlewares/auth';

/**
 * Channel-service proxy.
 *
 * Mounted at: app.use('/v1/channel-service', channelServiceAuthProxy)
 *
 * Express strips the mount prefix before the proxy sees the request, so the
 * remaining path already contains the service version:
 *
 *   Frontend     : GET /v1/channel-service/v1/channels/abc123
 *   Proxy sees   : GET /v1/channels/abc123   (mount prefix stripped by Express)
 *   Forwarded to : GET /v1/channels/abc123   ← no rewrite needed
 */
const channelServiceProxy = createProxyMiddleware({
  target: config.channelService.host,
  changeOrigin: true,
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 30000,
  timeout: 30000,
  on: {
    proxyReq: (proxyReq: ClientRequest, req: Request) => {
      logger.info(`========= channel-service proxy:`);
      logger.info(`   Original URL: ${req.originalUrl}`);
      logger.info(`   Method: ${req.method}`);
      logger.info(`   Target: ${config.channelService.host}`);

      if (req.userContext?.org_id) {
        proxyReq.setHeader('x-organization-id', req.userContext.org_id);
      }
      if (req.userContext?.user_id) {
        proxyReq.setHeader('x-user-id', req.userContext.user_public_id || req.userContext.user_id);
      }
      if (req.userContext?.business_unit_id) {
        proxyReq.setHeader('x-business-unit-id', req.userContext.business_unit_id);
      }
      if (req.userContext?.access_token && !req.userContext.access_token.startsWith('api_')) {
        proxyReq.setHeader('x-access-token', req.userContext.access_token);
      }
      if (req.userContext?.api_key) {
        proxyReq.setHeader('x-api-key', req.userContext.api_key);
      }
    },
    proxyRes: (_proxyRes, req: Request) => {
      logger.debug(`Channel-service response: ${req.method} ${req.originalUrl} -> ${_proxyRes.statusCode}`);
    },
    error: (err, req: Request) => {
      logger.error(`Channel-service proxy error for ${req.method} ${req.originalUrl}:`, err.message);
    },
  },
});

/**
 * Chat-widget anonymous bootstrap routes. A public web-widget loads on a
 * customer site with NO user token (only a channel id) and must be able to
 * register a contact and start a conversation before it has any credential.
 * These paths are forwarded WITHOUT requiring a gateway user-token; the
 * client's X-Contact-Token / X-Access-Token (once it has one) is passed
 * through and channel-service's own contactMiddleware authenticates them
 * (POST /contacts is the truly-anonymous bootstrap that mints the token).
 *
 * This branch only fires when NO api-key/Bearer/user x-access-token is
 * present, so authenticated dashboard traffic on these same paths is
 * unaffected — it still goes through `authorize` above.
 *
 * Paths are matched as seen after the mount prefix is stripped (`/v1/...`).
 */
const WIDGET_PUBLIC_ROUTES: Array<{ method: string; test: (p: string) => boolean }> = [
  { method: 'POST', test: (p) => p === '/v1/contacts' },
  { method: 'GET', test: (p) => p === '/v1/conversation' },
  { method: 'GET', test: (p) => p === '/v1/conversation_messages' },
  { method: 'POST', test: (p) => p === '/v1/conversation_messages' },
  { method: 'GET', test: (p) => /^\/v1\/channels\/[^/]+\/widget$/.test(p) },
  { method: 'GET', test: (p) => /^\/v1\/member_infos\/[^/]+$/.test(p) },
  { method: 'POST', test: (p) => p === '/v1/files/_presign_url' },
  { method: 'POST', test: (p) => p === '/v1/conversation_messages/_fileupload' },
];

const isWidgetPublicRoute = (method: string, path: string): boolean =>
  WIDGET_PUBLIC_ROUTES.some((r) => r.method === method && r.test(path));

// Public campaign QR/link tracker: the QR-landing page (qrcode-page.imbrace.co)
// hits GET /v1/touchpoint(s)/:id?from_type=scan|url anonymously to bump the
// scan/click counter. Only allowlist when `from_type` is present (the tracking
// hit) so the authed dashboard read of the same path is unaffected and a bare
// tokenless read of a touchpoint by id is NOT exposed.
const isTouchpointTrackerRoute = (req: Request): boolean =>
  req.method === 'GET' &&
  !!req.query?.from_type &&
  (/^\/v1\/touchpoints\/[^/]+$/.test(req.path) || /^\/v1\/touchpoint\/[^/]+$/.test(req.path));

const authRouter = async (req: Request, res: Response, next: NextFunction) => {
  const hasApiKey = !!req.headers['x-api-key'];
  const hasBearer = req.headers['authorization']?.startsWith('Bearer ');

  // Chat-widget traffic carries no user Bearer JWT and no API key — it is
  // either fully anonymous (bootstrap: POST /contacts, GET /conversation) or
  // authenticated by a channel-service contact token in X-Access-Token /
  // X-Contact-Token. The gateway's `authorize` validates USER tokens and
  // rejects contact tokens (401), so for the widget's own routes we forward
  // straight through and let channel-service's contactMiddleware authenticate.
  // Gated on "no Bearer and no API key" so dashboard traffic (modern Bearer or
  // API key) on these same paths is unaffected.
  if (!hasApiKey && !hasBearer && (isWidgetPublicRoute(req.method, req.path) || isTouchpointTrackerRoute(req))) {
    // These routes are DUAL-USE: the chat-widget hits them with a CONTACT token
    // AND dashboard agents hit them with a USER acc_ token (both in X-Access-Token,
    // neither carries a Bearer) — e.g. POST /v1/conversation_messages is both the
    // widget's send and the agent's manual reply. Blanket-bypassing auth left the
    // agent request with NO user context, so channel-service stored the reply with
    // from="" (unattributed; also broke is_agent_sent + the message-router agent
    // skip). Softly resolve the token: if it's a real user, attach userContext so
    // the proxy forwards x-user-id; if it's a contact token it resolves to '' and
    // we fall through exactly as before (channel-service's contactMiddleware
    // authenticates it). Never reject — preserves the widget.
    const token = (req.headers['x-access-token'] || req.headers['x-contact-token']) as string | undefined;
    if (token) {
      const uid = await resolveUserIdSoft(token);
      if (uid) {
        req.userContext = {
          org_id: req.headers['x-organization-id'] as string,
          user_id: uid,
          access_token: token,
        };
      }
    }
    return next();
  }

  if (hasApiKey) {
    return apiAuthenticate(req, res, next);
  } else if (hasBearer || req.headers['x-access-token']) {
    return authorize(req, res, next);
  } else {
    return res.status(401).json({ message: 'Unauthorized - API key or Access Token required' });
  }
};

export const channelServiceAuthProxy = [authRouter, channelServiceProxy];
export default channelServiceProxy;
