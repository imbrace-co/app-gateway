import { createProxyMiddleware } from 'http-proxy-middleware';
import config from '../../../config';

const filesPublicProxy = createProxyMiddleware({
  target: config.fileService.host,
  changeOrigin: true,
  pathRewrite: {
    '^/': '/api/files/download/',
  },
  followRedirects: false,
  ws: false,
  preserveHeaderKeyCase: true,
  proxyTimeout: 30000,
  timeout: 30000,
});

const filesPublicService = [filesPublicProxy];

export default filesPublicService;
