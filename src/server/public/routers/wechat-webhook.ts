import logger from '../../logging/logger';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';
import { Request } from 'express';
import { ClientRequest } from 'http';

/**
 * Public (no-auth) WeChat webhook proxy → channel-service.
 *
 * WeChat's Official Account platform calls the server URL as an unauthenticated
 * GET (signature/echostr verification on "Submit") and POST (inbound XML
 * messages). The rest of channel-service is fronted by an auth proxy that
 * requires an access token, so WeChat's calls would 401. This route is mounted
 * BEFORE auth (mirrors `/whatsapp-webhook`) and forwards to channel-service's
 * WeChat webhook, which is keyed by the Official Account's Original ID
 * (`:wcUserName`, e.g. gh_27feef77dea1) carried in the path.
 *
 * Route:      GET|POST /wechat-webhook/:wcUserName
 * Proxied to: channel-service  GET|POST /v1/wechat/webhook/:wcUserName
 */
const channelWechatWebhookProxy = createProxyMiddleware({
    target: config.channelService.host,
    changeOrigin: true,
    // Express strips the '/wechat-webhook' mount prefix, so the proxy sees
    // '/<wcUserName>' (plus any query string). Rewrite the leading slash to the
    // channel-service webhook base so '/gh_x' → '/v1/wechat/webhook/gh_x'. The
    // verification query string (signature, timestamp, nonce, echostr) is
    // preserved by the proxy.
    pathRewrite: {
        '^/': '/v1/wechat/webhook/',
    },
    on: {
        proxyReq: (proxyReq: ClientRequest, req: Request) => {
            logger.info(
                `========= /wechat-webhook -> channel-service: ${req.method} ${req.originalUrl}`,
            );
            // WeChat POSTs text/xml, which the gateway's global
            // express.text({type:'text/*'}) parser has already consumed into
            // req.body — draining the stream so the proxy would forward an empty
            // body and hang. Re-stream the parsed XML to the upstream. (GET
            // verification has no body — req.body is {}, so this is skipped.)
            const body = (req as unknown as { body?: unknown }).body;
            if (typeof body === 'string' && body.length > 0) {
                proxyReq.setHeader(
                    'Content-Type',
                    (req.headers['content-type'] as string) || 'text/xml',
                );
                proxyReq.setHeader('Content-Length', Buffer.byteLength(body));
                proxyReq.write(body);
                proxyReq.end();
            }
        },
        error: (err, req: Request) => {
            logger.error(
                `WeChat webhook proxy error for ${req.method} ${req.originalUrl}:`,
                (err as Error).message,
            );
        },
    },
});

export default channelWechatWebhookProxy;
