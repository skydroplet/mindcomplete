/**
 * 配置管理器基类
 * 提供配置管理的基础功能，包括：
 * - 配置文件的加载和保存
 * - 窗口注册和通知
 * - 事件发射
 * - ID生成
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');
const Logger = require('../logger');
const log = new Logger('BaseConfigManager');

class BaseConfigManager extends EventEmitter {
    /**
     * 创建配置管理器实例
     * @param {string} configFileName - 配置文件名
     * @param {Object} defaultConfig - 默认配置对象
     */
    constructor(configFileName, defaultConfig) {
        super();
        this.defaultConfig = defaultConfig;

        // 初始化配置路径
        const userDataPath = app.getPath('userData');
        const configDir = path.join(userDataPath, 'user-data', 'config');
        fs.mkdirSync(configDir, { recursive: true });
        this.configPath = path.join(configDir, configFileName);

        // 加载配置
        this.config = this.loadConfig();

        // 存储所有窗口的WebContents以便更新
        this.registeredWindows = new Set();
    }

    /**
     * 加载配置
     * @returns {Object} 配置对象
     */
    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                return { ...this.defaultConfig };
            }
            const data = fs.readFileSync(this.configPath, 'utf8');
            log.info('加载配置成功:', data);
            return JSON.parse(data);
        } catch (error) {
            log.error('加载配置失败:', error.message);
            return { ...this.defaultConfig };
        }
    }

    /**
     * 保存配置
     * @returns {boolean} 保存是否成功
     */
    saveConfig() {
        try {
            log.info('保存配置:', this.config);
            const configDir = path.dirname(this.configPath);
            fs.mkdirSync(configDir, { recursive: true });
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            this.notifyAllWindows();
            this.emit('config-updated', this.config);
            return true;
        } catch (error) {
            log.error('保存配置失败:', error.message);
            return false;
        }
    }

    /**
     * 生成不重复的随机ID
     * @param {string} prefix - ID前缀
     * @param {Object} existingItems - 现有项目对象
     * @returns {string} 生成的唯一ID
     */
    generateUniqueId(prefix, existingItems) {
        const randomId = prefix + '-' + crypto.randomBytes(5).toString('hex');
        if (existingItems && existingItems[randomId]) {
            return this.generateUniqueId(prefix, existingItems);
        }
        return randomId;
    }

    /**
     * 注册窗口以接收配置更新
     * @param {Electron.WebContents} webContents - 要注册的窗口WebContents
     */
    registerWindow(webContents) {
        if (webContents && !webContents.isDestroyed()) {
            this.registeredWindows.add(webContents);
            webContents.on('destroyed', () => {
                this.unregisterWindow(webContents);
            });
        }
    }

    /**
     * 取消注册窗口
     * @param {Electron.WebContents} webContents - 要取消注册的窗口WebContents
     */
    unregisterWindow(webContents) {
        this.registeredWindows.delete(webContents);
    }

    /**
     * 通知所有注册的窗口配置已更新
     */
    notifyAllWindows() {
        for (const webContents of this.registeredWindows) {
            if (!webContents.isDestroyed()) {
                webContents.send('config-updated', this.config);
            }
        }
    }

    /**
     * 获取当前配置
     * @returns {Object} 当前配置对象
     */
    getConfig() {
        return this.config;
    }
}

module.exports = BaseConfigManager; 