import { Request, Response, NextFunction } from 'express';
import { apiAuthenticate } from './apiAuth';
import { authorize } from './auth';

const authRouter = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers['x-api-key']) {
    return apiAuthenticate(req, res, next);
  } else if (req.headers['authorization']?.startsWith('Bearer ') || req.headers['x-access-token']) {
    return authorize(req, res, next);
  } else {
    return res.status(401).json({ message: 'Unauthorized - API key or Access Token required' });
  }
};

export default authRouter;
