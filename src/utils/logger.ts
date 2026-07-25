import * as winston from 'winston';
import { config } from '../config';

// On serverless/read-only filesystems (e.g. Vercel) we cannot write log files,
// so fall back to console-only there. VERCEL is set in Vercel environments.
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'smartswap-backend' },
  transports: isServerless
    ? [new winston.transports.Console()]
    : [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
      ],
});

// If we're not in production, log to the console as well
if (config.nodeEnv !== 'production' && !isServerless) {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

export { logger };
