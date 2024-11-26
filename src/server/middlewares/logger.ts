import morgan from 'morgan';
import config from '../../config';
import { Request, Response } from 'express';

const logLevel = config.logLevel;
const environment = config.environment;


morgan.token('req-id', (req: Request) => {
    const url = req.url.replace(/\//g, '-');
    return url === '-' ? `req-index` : `req${url}`;
});

morgan.token('timestamp', () => {
    return new Date().toISOString();
});

const logger = morgan('[:timestamp] - :method - [:req-id] - :status - :res[content-length] bytes - :response-time ms', {
    skip: (_, res: Response) => {
        if (environment === 'production' && (res.statusCode < 400 || logLevel === 'debug')) {
            return true;
        }
        return false;
    },
    stream: process.stdout
});

export default logger;