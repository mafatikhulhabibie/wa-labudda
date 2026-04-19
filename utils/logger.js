import pino from 'pino';

const level = process.env.LOG_LEVEL || 'info';

/** Structured JSON logs (PM2 / log aggregators friendly). */
export const logger = pino({ level });
