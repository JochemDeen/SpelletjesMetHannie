// logger.js
const path = require('path');
const util = require('util');
const { createLogger, format, transports } = require('winston');

const SPLAT = Symbol.for('splat');

// Calls look like logger.error('Something failed:', err). Winston only folds
// an Error's message into the line; other extra arguments (strings, objects)
// would be dropped, so they are appended here, plus the stack for errors.
const line = format.printf((info) => {
  const extra = (info[SPLAT] || [])
    .filter(arg => !(arg instanceof Error))
    .map(arg => (typeof arg === 'string' ? arg : util.inspect(arg, { depth: 3, breakLength: Infinity })));
  const text = [info.message, ...extra].join(' ');
  const stack = info.stack ? `\n${info.stack}` : '';
  return `${info.timestamp} [${info.level.toUpperCase()}] ${text}${stack}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    line
  ),
  transports: [
    new transports.Console(),
    // Rotates at 5 MB, keeping combined.log plus 4 older files
    new transports.File({
      filename: path.join(__dirname, 'combined.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true
    })
  ]
});

module.exports = logger;
