const { Buffer } = require('buffer');

class Logger {
    constructor(moduleName) {
        this.moduleName = moduleName;
        this.info = this.info.bind(this);
        this.warn = this.warn.bind(this);
        this.error = this.error.bind(this);
    }

    info(...args) {
        const message = this.formatMessage(args);
        console.log(this.encodeMessage(`[${this.getTimestamp()}] [${this.moduleName}] INFO: ${message}`));
    }

    warn(...args) {
        const message = this.formatMessage(args);
        console.warn(this.encodeMessage(`[${this.getTimestamp()}] [${this.moduleName}] WARN: ${message}`));
    }

    error(...args) {
        const message = this.formatMessage(args);
        console.error(this.encodeMessage(`[${this.getTimestamp()}] [${this.moduleName}] ERROR: ${message}`));
    }

    formatMessage(args) {
        return args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
        ).join(' ');
    }

    encodeMessage(message) {
        return Buffer.from(message, 'utf8').toString();
    }

    getTimestamp() {
        const now = new Date();
        return now.toLocaleString();
    }
}

module.exports = Logger;