/**
 * Structured Logger for Monitoring Integration
 * Outputs JSON logs compatible with Datadog, CloudWatch, etc.
 */

const LOG_LEVEL = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevel = LOG_LEVEL[process.env.LOG_LEVEL || 'info'];

function formatLog(level, message, data = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data
  });
}

export const logger = {
  debug: (message, data) => {
    if (LOG_LEVEL.debug >= currentLevel) {
      console.log(formatLog('debug', message, data));
    }
  },

  info: (message, data) => {
    if (LOG_LEVEL.info >= currentLevel) {
      console.log(formatLog('info', message, data));
    }
  },

  warn: (message, data) => {
    if (LOG_LEVEL.warn >= currentLevel) {
      console.warn(formatLog('warn', message, data));
    }
  },

  error: (message, data) => {
    if (LOG_LEVEL.error >= currentLevel) {
      console.error(formatLog('error', message, data));
    }
  }
};

export default logger;
