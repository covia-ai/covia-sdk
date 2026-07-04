/**
 * Simple logger for the Covia SDK.
 *
 * By default logging is disabled (level = 'none'). Enable debug output with:
 *   import { logger } from '@covia/covia-sdk';
 *   logger.level = 'debug';
 *
 * Or provide a custom log function:
 *   logger.handler = (level, msg) => myLogger.log(level, msg);
 */

export type LogLevel = 'debug' | 'none';
export type LogHandler = (level: string, message: string) => void;

const defaultHandler: LogHandler = (_level, message) => {
  console.debug(`[covia] ${message}`);
};

export const logger = {
  level: 'none' as LogLevel,
  handler: defaultHandler,

  debug(message: string): void {
    if (this.level === 'debug') {
      this.handler('debug', message);
    }
  },
};
