// import privateServer from "./server/private";
import publicServer from "./server/public";

// Parse command line arguments and environment variables
const parseArgs = () => {
    const args = process.argv.slice(2);
    console.log('Command line arguments:', args);
    
    const config = {
        licenseRequired: false, // default value
        secret: undefined as string | undefined
    };

    // First, check environment variables (Docker mode)
    // if (process.env.LICENSE_REQUIRED === 'true') {
    //     config.licenseRequired = true;
    // }
    // if (process.env.LICENSE_SECRET) {
    //     config.secret = process.env.LICENSE_SECRET;
    // }

    // Then, override with command line arguments if provided (CLI mode)
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--license-required') {
            config.licenseRequired = true;
        } else if (args[i] === '--secret' && i + 1 < args.length) {
            config.secret = args[i + 1];
            i++; // skip next argument as it's the secret value
        }
    }

    return config;
};

const startServer = async () => {
    try {
        const config = parseArgs();
        console.log('Starting server with config:', config);
        
        // privateServer.startPrivateServer();
        publicServer.startPublicServer({
            licenseRequired: config.licenseRequired,
            secret: config.secret
        });
    } catch (error) {
        console.error('Error starting service: ', error);
    }
}

startServer();