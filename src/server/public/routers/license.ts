// licenseRoute.ts
import express from 'express';
import LicenseService from '../../../services/licenseService';

const INVALID_LICENSE = 'Invalid license';

// Factory: pass config into the route
export default function createLicenseRouter(appConfig?: {
  licenseRequired: boolean;
  secret?: string;
}) {
  const router = express.Router();

  // Create a LicenseService with provided secret (fallback to env)
  const licenseService = new LicenseService(appConfig?.secret || '');

  /**
   * POST /license/generate
   */
  router.post('/generate', express.json(), async (req, res) => {
    try {
      if (!appConfig?.licenseRequired) {
        return res.status(400).json({
          message: 'No License is required',
        });
      }
      const startDate = (req.body?.startDate || req.query?.startDate) as
        | string
        | undefined;
      const endDate = (req.body?.endDate || req.query?.endDate) as
        | string
        | undefined;

      if (!startDate || !endDate) {
        return res.status(400).json({
          error: INVALID_LICENSE,
          message: 'Provide startDate and endDate',
        });
      }

      const token = licenseService.generateLicenseToken(startDate, endDate);
      return res.status(201).json({ token, startDate, endDate });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      const status =
        msg.toLowerCase().includes('secret') ||
        msg.toLowerCase().includes('start date')
          ? 400
          : 500;
      return res.status(status).json({
        error: status === 400 ? 'Bad Request' : 'Internal server error',
        message: msg,
      });
    }
  });

  /**
   * POST /license
   */
  router.post('/', express.json(), async (req, res) => {
    try {
      if (!appConfig?.licenseRequired) {
        return res.status(400).json({
          message: 'No License is required',
        });
      }
      const { license } = req.body;
      if (!license || typeof license !== 'string') {
        return res.status(400).json({
          error: INVALID_LICENSE,
          message: 'Please provide an encrypted license string',
        });
      }

      const licenseResult = await licenseService.checkReceivedLicense(license);
      if (!licenseResult.isValid) {
        return res.status(400).json({
          error: INVALID_LICENSE,
          message: licenseResult.error,
          startDate: licenseResult.startDate,
          endDate: licenseResult.endDate,
        });
      }

      await licenseService.saveEncryptedLicense(license);
      const licenseInfo = await licenseService.getLicenseInfo();

      res.status(201).json({
        message: 'License installed successfully',
        license: licenseInfo,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      if (
        errorMessage.includes('decrypt') ||
        errorMessage.includes('Invalid license')
      ) {
        return res.status(400).json({
          error: 'Invalid license',
          message: errorMessage,
        });
      }
      res.status(500).json({
        error: 'Internal server error',
        message: errorMessage,
      });
    }
  });

  /**
   * GET /license
   */
  router.get('/', async (req, res) => {
    try {
      console.log('appConfig', appConfig);
      let licenseInfo = {};
      if (appConfig?.licenseRequired) {
        licenseInfo = await licenseService.getLicenseInfo();
      }
      return res.status(200).json(licenseInfo);
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /license/status
   */
  router.get('/status', async (req, res) => {
    try {
      const isValid = await licenseService.isLicenseValid();
      res.json({
        isValid,
        message: isValid ? 'License is valid' : 'License is invalid or expired',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
