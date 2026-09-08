import logger from '../logging/logger';
import { NextFunction, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import config from '../../config';
import { v4 as uuidv4 } from 'uuid';
import { ApiPermissions } from '../../core/models/user_context';

const API_PATHS = [
  '/conversation_message',
  '/board',
  '/channels',
  '/touchpoints',
  '/campaign'
];

// Function to validate API token and get permissions
const validateApiToken = async (apiKey: string): Promise<{
  user_id: string;
  org_id: string;
  permissions: Record<string, ApiPermissions>;
}> => {
  const url = `${config.platform.host}/v1/internal/api_key_token/${apiKey}`;
  try {
    const response = await axios.get(url);
    
    // Validate response data structure
    const data = response.data;
    if(data === null) {
      throw new Error('Unauthorized');
    }
    // Ensure permissions is an object, even if empty
    if (!data.permissions || typeof data.permissions !== 'object') {
      logger.warn('No permissions found in token response');
      data.permissions = {};
    }
    
    return {
      user_id: data.user_id,
      org_id: data.org_id ?? data.organization_id,
      permissions: data.permissions
    };
  } catch (error) {
    const axiosError = error as AxiosError;
    logger.error('API Token Validation Error:', axiosError);
    if (axiosError.response && axiosError.response.status === 401) {
      throw new Error('Unauthorized');
    }
    throw axiosError;
  }
};

// Helper function to determine if the request is a write operation
const isWriteOperation = (method: string): boolean => {
  // Only GET is considered a read operation, all others are write
  return method.toUpperCase() !== 'GET';
};

// Extract API path from request
const getApiPath = (path: string): string => {
  // Extract the base API path from the request URL
  // Remove the leading base path if present (e.g., /v1/backend)
  const normalizedPath = path.replace(/^\/v\d+\/backend/, '');
  
  for (const apiPath of API_PATHS) {
    if (normalizedPath.startsWith(apiPath)) {
      return apiPath;
    }
  }
  
  // If we can't match a specific path, throw error
  logger.debug(`No specific API path match for: ${normalizedPath}`);
  return ''
};

// Main authentication middleware
export const apiAuthenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get API key from header
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'API key is required', 
        request_id: uuidv4() 
      });
    }
    
    // Validate token and get permissions
    const { user_id, org_id, permissions } = await validateApiToken(apiKey);

    req.userContext = {
      user_id,
      org_id,
      // Both fields point to the same string. `access_token` is kept for
      // back-compat with proxies that still read it; `api_key` is the
      // semantically correct field name and lets `if (req.userContext?.api_key)`
      // branches in proxies fire and forward `x-api-key` upstream.
      access_token: apiKey,
      api_key: apiKey,
      api_permissions: permissions ?? {},
    };

    // null permissions = full-access key (e.g. third-party tokens) — skip path/permission checks
    if (!permissions || Object.keys(permissions).length === 0) {
      return next();
    }

    // Scoped key: enforce path + permission checks
    const isWrite = isWriteOperation(req.method);
    const apiPath = getApiPath(req.path);

    if (apiPath === '') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Invalid API path: ${req.path}, the path should be one of the following: ${API_PATHS.join(', ')}`,
        request_id: uuidv4(),
      });
    }

    const apiPermission = permissions[apiPath];
    if (!apiPermission || typeof apiPermission !== 'object') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `No permission for ${apiPath}`,
        request_id: uuidv4(),
      });
    }

    if (isWrite && apiPermission.write !== true) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Write permission required for ${apiPath}`,
        request_id: uuidv4(),
      });
    }

    if (!isWrite && apiPermission.read !== true) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Read permission required for ${apiPath}`,
        request_id: uuidv4(),
      });
    }
    
    // Log access for debugging (should be removed in production or use proper logging)
    logger.debug(`API access: ${req.method} ${apiPath} by user ${user_id} from org ${org_id}`);
    
    next();
  } catch (error) {
    logger.error('API Authentication Error:', error);
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid API key', 
        request_id: uuidv4() 
      });
    }
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'An error occurred during authentication', 
      request_id: uuidv4() 
    });
  }
}; 