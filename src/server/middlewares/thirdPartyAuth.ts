import { Request, Response, NextFunction } from 'express';
import axios, { AxiosError } from 'axios';
import config from '../../config';

type ThirdPartyToken = {
  organization_id?: string;
  user_id?: string;
  _id?: string;
  expired_at?: string;
  created_at?: string;
  updated_at?: string;
};

export const getThirdPartyToken = async (
  req: Request
): Promise<ThirdPartyToken | undefined> => {
  const thirdPartyToken = req.headers['x-access-token'] as string;
  console.log(`===== thirdPartyToken: `, thirdPartyToken);

  try {
    const url = `${config.backend.private_host}/v1/third_party_token/${thirdPartyToken}`;
    const response = await axios.get(url);
    return response.data as ThirdPartyToken;
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error('getThirdPartyTokenError:', axiosError);
    if (axiosError.response) {
      if (axiosError.response.status === 401) {
        throw new Error('Unauthorized');
      }
      if (axiosError.response.status === 404) {
        return undefined;
      }
      if (axiosError.response.status === 400) {
        return undefined;
      }
    }
    throw axiosError;
  }
};

export const thirdPartyAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.get('x-access-token')) {
    try {
      const token = await getThirdPartyToken(req);

      if (token && typeof token === 'object' && 'organization_id' in token) {
        req.userContext = {
          org_id: token.organization_id,
          user_id: token.user_id,
        };
      } else {
        req.userContext = {
          org_id: undefined,
          user_id: undefined,
        };
      }

      if (!token) {
        return res
          .status(401)
          .json({ message: 'Unauthorized - Invalid third party token' });
      }
      return next();
    } catch (error) {
      return res
        .status(401)
        .json({ message: 'Unauthorized - Invalid third party token' });
    }
  } else {
    return res
      .status(401)
      .json({ message: 'Unauthorized - missing x-access-token' });
  }
};
