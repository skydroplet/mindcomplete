/**
 * logger.js
 * 日志记录模块
 *
 * 提供简洁的日志记录功能，支持不同级别的日志（info、warn、error），
 * 自动记录调用位置（文件名和行号），便于调试和问题追踪。
 * 支持格式化对象类型的日志内容，提高日志可读性。
 * 主进程日志会同时输出到控制台和文件，渲染进程只输出到控制台。
 */

const { Buffer } = require('buffer');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const isRenderer = process.type === 'renderer';

/**
 * 日志记录器类
 * 支持记录不同级别的日志信息，并自动包含文件名和行号
 */
class Logger {
    /**
     * 创建日志记录器实例
     * @param {string} moduleName - 模块名称，将显示在日志中
     */
    constructor(moduleName) {
        this.moduleName = moduleName;
        // 绑定方法到实例，确保在其他上下文中调用时this指向正确
        this.info = this.info.bind(this);
        this.warn = this.warn.bind(this);
        this.error = this.error.bind(this);

        // 只在主进程中初始化文件日志
        if (!isRenderer) {
            this.initFileLogger();
        }
    }

    /**
     * 初始化文件日志
     */
    initFileLogger() {
        const userDataPath = app.getPath('userData');
        const logDir = path.join(userDataPath, 'user-data', 'logs');

        // 确保日志目录存在
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        this.logFilePath = path.join(logDir, `mindcomplete.log`);
        try {
            fs.writeFileSync(this.logFilePath, '', 'utf8');
        } catch (error) {
            console.error('Failed to initialize log file:', error);
        }
    }

    /**
     * 写入日志到文件
     * @param {string} message - 要写入的日志消息
     */
    writeToFile(message) {
        if (isRenderer) {
            return;
        }

        try {
            // 使用追加模式写入日志
            fs.appendFileSync(this.logFilePath, message + '\n', 'utf8');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    /**
     * 记录信息级别的日志
     * @param {...any} args - 要记录的消息参数，可以是多个参数
     */
    info(...args) {
        const { file, line } = this.getCallerInfo();
        const message = this.formatMessage(args);
        const logMessage = this.encodeMessage(`[${this.getTimestamp()}] [${this.moduleName}] [${file}:${line}] INFO: ${message}`);
        console.log(logMessage);
        this.writeToFile(logMessage);
    }

    /**
     * 记录警告级别的日志
     * @param {...any} args - 要记录的消息参数，可以是多个参数
     */
    warn(...args) {
        const { file, line } = this.getCallerInfo();
        const message = this.formatMessage(args);
        const logMessage = this.encodeMessage(`[${this.getTimestamp()}] [${this.moduleName}] [${file}:${line}] WARN: ${message}`);
        console.warn(logMessage);
        this.writeToFile(logMessage);
    }

    /**
     * 记录错误级别的日志
     * @param {...any} args - 要记录的消息参数，可以是多个参数
     */
    error(...args) {
        const { file, line } = this.getCallerInfo();
        const message = this.formatMessage(args);
        const logMessage = this.encodeMessage(`[${this.getTimestamp()}] [${this.moduleName}] [${file}:${line}] ERROR: ${message}`);
        console.error(logMessage);
        this.writeToFile(logMessage);
    }

    /**
     * 获取调用者的文件名和行号
     * @returns {Object} 包含文件名和行号的对象
     */
    getCallerInfo() {
        // 创建一个Error对象以获取调用堆栈
        const err = new Error();
        const stack = err.stack.split('\n');

        // 第一行是错误消息，第二行是当前函数，
        // 第三行是日志方法（info/warn/error），第四行才是实际调用者
        const callerLine = stack[3] || '';

        // 从调用行提取文件路径和行号
        // 格式通常为: "    at functionName (filePath:lineNumber:columnNumber)"
        const match = callerLine.match(/\s+at\s+(?:.*\s+\()?(?:(.+?):(\d+)(?::\d+)?)\)?$/);

        if (match) {
            const [, filePath, lineNum] = match;
            // 从路径中提取文件名
            const fileName = path.basename(filePath);
            return { file: fileName, line: lineNum };
        }

        // 如果无法获取调用信息，返回默认值
        return { file: 'unknown', line: '?' };
    }

    /**
     * 格式化日志消息
     * @param {Array} args - 要格式化的消息参数数组
     * @returns {string} 格式化后的消息字符串
     */
    formatMessage(args) {
        return args.map(arg =>
            // 对象类型转为JSON字符串，其他类型直接使用
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
        ).join(' ');
    }

    /**
     * 编码消息，确保正确处理各种字符
     * @param {string} message - 要编码的消息
     * @returns {string} 编码后的消息
     */
    encodeMessage(message) {
        return Buffer.from(message, 'utf8').toString();
    }

    /**
     * 获取当前时间戳
     * @returns {string} 格式化的时间字符串
     */
    getTimestamp() {
        const now = new Date();
        return now.toLocaleString();
    }
}

module.exports = Logger;