import { Request, Response, NextFunction } from 'express';
import LicenseService from '../../services/licenseService';

// Global license service instance
let licenseService: LicenseService;

// Initialize license service with secret
export const initializeLicenseAuth = (secret?: string) => {
  licenseService = new LicenseService(secret);
};

// License authentication middleware
const licenseAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip license check for license management endpoints
    const excludeSegments = ['license', 'login', 'organizations', 'access', 'account'];

    // Build a single regex like /(license|login|organizations|access|account)/
    const excludeRegex = new RegExp(`(${excludeSegments.join('|')})`);
    if (excludeRegex.test(req.url)) {
        return next(); // skip
    }

    // Skip license check for health check endpoint
    if (req.path === '/') {
      return next();
    }

    if (!licenseService) {
      return res.status(500).json({
        error: 'License service not initialized',
        message: 'Server configuration error'
      });
    }

    const isValid = await licenseService.isLicenseValid();

    if (!isValid) {
      // Get license info for additional context (if available)
      let licenseInfo = null;
      try {
        licenseInfo = await licenseService.getLicenseInfo();
      } catch (e) {
        // Ignore errors when getting license info for context
      }
      const endDate = new Date(licenseInfo?.endDate || "")
      const today = new Date(new Date().toISOString().split("T")[0]);
      console.log('dd', endDate < today, endDate, today);

    if(endDate < today) {
      return res.status(403).json({
        error: 'License required',
        message: 'This license was expired',
        code: 'LICENSE_INVALID',
        ...(licenseInfo && {
          licenseInfo: {
            licensee: licenseInfo.licensee,
            startDate: licenseInfo.startDate,
            endDate: licenseInfo.endDate,
            isValid: licenseInfo.isValid,
            daysRemaining: licenseInfo.daysRemaining
          }
        })
      });
    }
      
      // Always return LICENSE_INVALID for any license failure
      return res.status(403).json({
        error: 'License required',
        message: 'This application requires a valid license to operate. Please install a valid license.',
        code: 'LICENSE_INVALID',
        ...(licenseInfo && {
          licenseInfo: {
            licensee: licenseInfo.licensee,
            endDate: licenseInfo.endDate,
            isValid: licenseInfo.isValid,
            daysRemaining: licenseInfo.daysRemaining
          }
        })
      });
    }

    // License is valid, proceed to next middleware
    next();

  } catch (error) {
    console.error('License validation error:', error);
    
    // Even validation errors return LICENSE_INVALID for frontend consistency
    res.status(403).json({
      error: 'License required',
      message: 'Unable to validate license. Please install a valid license.',
      code: 'LICENSE_INVALID'
    });
  }
};

export default licenseAuth;
