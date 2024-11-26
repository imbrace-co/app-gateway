import rateLimit from 'express-rate-limit';
import config from '../../config';


const rateLimiter = rateLimit({
    windowMs: config.rateLimit.window,
    max: config.rateLimit.max,
    message: 'Too many requests. Please try again later.',
    headers: false,
    ipv6Subnet: 60,
});

export default rateLimiter;