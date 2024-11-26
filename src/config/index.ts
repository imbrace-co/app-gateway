import dotenv from 'dotenv';
dotenv.config();

const config = {
  publicServer: {
    port: parseInt(process.env.PUBLIC_SERVER_PORT as string, 10) || 9000,
  },
  privateServer: {
    port: parseInt(process.env.PRIVATE_SERVER_PORT as string, 10) || 9989,
  },
  logLevel: process.env.LOG_LEVEL || 'debug',
  version: process.env.VERSION,
  environment: process.env.ENV || 'development',
  workflow: {
    host: process.env.WORKFLOW_HOST || 'localhost:5678',
  },
  backend: {
    public_host: process.env.BACKEND_PUBLIC_HOST || 'localhost:9981',
    private_host: process.env.BACKEND_PRIVATE_HOST || 'localhost:9989',
  },
  ai: {
    host: process.env.AI_SERVICE || 'http://localhost:7100',
    python_host: process.env.AI_SERVICE_PYTHON || 'http://localhost:7101',
    ai_chat_websocket:
      process.env.AI_CHAT_WEBSOCKET || 'http://localhost:7100',
  },
  ips: {
    host: process.env.IPS_SERVICE || 'localhost:6006',
  },
  channelService: {
    host: process.env.CHANNEL_SERVICE_HOST || 'http://localhost:4100',
    enabled: process.env.CHANNEL_SERVICE_ENABLED !== 'false',
  },
  marketplace: {
    host: process.env.MARKETPLACE_SERVICE || 'localhost:6006',
  },
  fraudDetection: {
    host:
      process.env.SERVICE_FRAUD_DETECT ||
      'http://localhost:8500',
  },
  platform: {
    host: process.env.PLATFORM_SERVICE_HOST || 'http://localhost:6040',
  },
  fileService: {
    host: process.env.FILE_SERVICE_HOST || 'http://localhost:8080',
  },
  dataBoard: {
    host: process.env.DATA_BOARD_HOST || 'http://localhost:8081',
    proxyToken: process.env.DATA_BOARD_PROXY_TOKEN || '',
  },
  messageSuggestion: {
    host:
      process.env.MESSAGE_SUGGESTION_HOST ||
      'http://localhost:8082',
  },
  authService: {
    url: process.env.AUTH_SERVICE_URL || 'http://localhost:3000',
  },
  activepieces: {
    backend_host:
      process.env.ACTIVEPIECES_BACKEND_HOST || 'http://localhost:3000',
    engine_host:
      process.env.ACTIVEPIECES_ENGINE_HOST || 'http://localhost:3001',
    web_socket:
      process.env.ACTIVEPIECES_WS_HOST || 'http://localhost:3000',
    trusted_sources: process.env.ACTIVEPIECES_TRUSTED_SOURCES
      ? process.env.ACTIVEPIECES_TRUSTED_SOURCES.split(',').map((s) => s.trim())
      : [
          'localhost',
          '127.0.0.1',
        ],
  },
  rateLimit: {
    window:
      parseInt(process.env.RATELIMIT_WINDOW as string, 10) || 30 * 60 * 1000, // in milliseconds
    max:
      parseInt(process.env.RATELIMIT_MAX_REQUEST_PER_WINDOW as string, 10) ||
      100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  },
};

console.debug({ config });

export default config;
