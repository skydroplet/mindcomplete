/**
 * 模型配置管理模块
 * 负责模型的添加、删除、更新和设置当前模型
 */

const Logger = require('../logger');
const log = new Logger('modelManager');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');
const { app } = require('electron');

class ModelConfigManager extends EventEmitter {
    constructor() {
        super();
        const userDataPath = app.getPath('userData');
        // 创建 user-data/config 目录结构
        const configDir = path.join(userDataPath, 'user-data', 'config');
        fs.mkdirSync(configDir, { recursive: true });

        this.configPath = path.join(configDir, 'models.json');
        log.info('初始化ModelManager，模型配置文件:', this.configPath);
        this.config = this.loadConfig();

        // 存储所有窗口的WebContents以便更新
        this.registeredWindows = new Set();
    }

    // 生成不重复的随机模型ID
    generateModelId() {
        const randomId = 'model-' + crypto.randomBytes(5).toString('hex');
        // 确保ID不重复
        if (this.config.models && this.config.models[randomId]) {
            return this.generateModelId(); // 递归重新生成
        }
        return randomId;
    }

    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                return { models: {}, currentModel: null };
            }
            const data = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            log.error('加载模型配置失败:', error);
            return { models: {}, currentModel: null };
        }
    }

    saveConfig() {
        try {
            log.info("保存模型配置：", this.config)
            const configDir = path.dirname(this.configPath);
            fs.mkdirSync(configDir, { recursive: true });
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            this.notifyAllWindows();
            this.emit('model-config-updated', this.config);
            return true;
        } catch (error) {
            log.error('保存模型配置失败:', error);
            return false;
        }
    }

    addModel(model) {
        if (!this.config.models) {
            this.config.models = {};
        }

        // 生成唯一ID
        const modelId = this.generateModelId();

        this.config.models[modelId] = {
            id: modelId,
            name: model.name,
            type: model.type,
            apiKey: model.apiKey,
            apiBaseUrl: model.apiBaseUrl,
            contextWindowSize: model.contextWindowSize || 4096,
            temperature: model.temperature || 0.7
        }
        return this.saveConfig();
    }

    updateModel(modelId, model) {
        if (!this.config.models) {
            this.config.models = {};
            return false;
        }

        if (this.config.models[modelId]) {
            this.config.models[modelId] = {
                id: modelId,
                name: model.name,
                type: model.type,
                apiKey: model.apiKey,
                apiBaseUrl: model.apiBaseUrl,
                contextWindowSize: model.contextWindowSize || 4096,
                temperature: model.temperature || 0.7
            };
            return this.saveConfig();
        }
        return false;
    }

    deleteModel(modelId) {
        if (!this.config.models) {
            return false;
        }

        if (this.config.models[modelId]) {
            delete this.config.models[modelId];
            // 如果删除的是当前选中的模型，清除当前模型
            if (this.config.currentModel === modelId) {
                this.config.currentModel = null;
            }
            return this.saveConfig();
        }
        return false;
    }

    getModelConfig() {
        return this.config;
    }

    selectModel(modelId) {
        if (!this.config.models) {
            return false;
        }

        if (this.config.models[modelId]) {
            this.config.currentModel = modelId;
            return this.saveConfig();
        }
        return false;
    }

    // 窗口注册系统，确保所有窗口保持配置一致
    registerWindow(webContents) {
        if (webContents && !webContents.isDestroyed()) {
            this.registeredWindows.add(webContents);

            // 当窗口关闭时，移除它
            webContents.on('destroyed', () => {
                this.unregisterWindow(webContents);
            });
        }
    }

    unregisterWindow(webContents) {
        this.registeredWindows.delete(webContents);
    }

    notifyAllWindows() {
        for (const webContents of this.registeredWindows) {
            if (!webContents.isDestroyed()) {
                webContents.send('model-config-updated', this.config);
            }
        }
    }
}

// 创建并导出单例实例
const modelConfigManager = new ModelConfigManager();
module.exports = modelConfigManager;