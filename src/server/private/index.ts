import log from '../logging/logger';
import express from 'express';
import config from '../../config';
import rateLimiter from '../middlewares/rate-limiter';
import requestContext from '../middlewares/requestContext';
import logger from '../middlewares/logger';
import aiService from './routers/ai';
import aiServiceV2 from './routers/ai_v2';
import ipsService from './routers/ips';
import activePiecesEngineService from './routers/activepieces-engine';

const startPrivateServer = async () => {
    try {
        const app = express();

        // multipart/form-data parser
        app.use(express.text({ type: '/' }));

        // URL Encoded parser
        app.use(express.urlencoded({ extended: false }));

        // GLOBAL MIDDLEWARES — requestContext first (correlation + propagation)
        app.use(requestContext);
        app.use(logger);
        app.use(rateLimiter);

        app.get('/', (_, res) => {
            res.json({
                name: 'App Gateway Private Server',
                version: config.version,
                env: config.environment,
            });
        });

        // ROUTES

        // AI Service
        app.use('/v1/organization/:org_id/ai', aiService);
        app.use('/v2/organization/:org_id/ai', aiServiceV2);

        // IPS Service
        app.use('/v1/organization/:org_id/ips/users/:user_id', ipsService);
        app.use('/v1/organization/:org_id/ips', ipsService);

        // Workflow Engine Service
        app.use('/v1/activepieces-engine', activePiecesEngineService);


        // START SERVER
        const port = Number(config.privateServer.port ?? 9989);
        app.listen(port, '0.0.0.0', () => {
            log.info(`Private Server running at http://localhost:${port}`);
        });

    } catch (error) {
        log.error('Error starting private server: ', error);
        log.error('Exiting process');
    }
};

const privateServer = {
    startPrivateServer,
}

export default privateServer;