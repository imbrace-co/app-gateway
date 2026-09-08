import logger from './server/logging/logger';
// import privateServer from "./server/private";
import publicServer from "./server/public";

const startServer = async () => {
    try {
        logger.info('Starting server');

        // privateServer.startPrivateServer();
        publicServer.startPublicServer();
    } catch (error) {
        logger.error('Error starting service: ', error);
    }
}

startServer();
