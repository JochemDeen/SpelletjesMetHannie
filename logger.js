// logger.js
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    level: 'info',  // You can set levels like 'debug', 'info', 'warn', 'error'
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}] ${message}`;
        })
    ),
    transports: [
        new transports.Console(),  // Logs to the console
        new transports.File({ filename: 'combined.log' })  // Logs to a file
    ]
});

module.exports = logger;
