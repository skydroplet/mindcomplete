const Logger = require('../logger');
const log = new Logger('modelConfig');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');
const { app } = require('electron');
const { OpenAI } = require('openai');

/**
 * 模型配置管理器类
 *
 * 负责管理AI模型配置，提供添加、删除、更新模型的功能
 * 继承自EventEmitter，可以发出配置变更事件
 */
class ModelConfig extends EventEmitter {
    /**
     * 创建模型配置管理器实例
     *
     * 初始化配置文件路径，加载现有配置
     * 设置窗口注册系统，用于通知配置变更
     */
    constructor() {
        super();
        const userDataPath = app.getPath('userData');
        // 创建 user-data/config 目录结构
        const configDir = path.join(userDataPath, 'user-data', 'config');
        fs.mkdirSync(configDir, { recursive: true });

        this.configPath = path.join(configDir, 'models.json');
        this.config = this.loadConfig();
        this.client = null;

        // 存储所有窗口的WebContents以便更新
        this.registeredWindows = new Set();
    }

    /**
     * 生成不重复的随机模型ID
     *
     * 使用加密随机数生成唯一标识符，确保在现有模型中不重复
     *
     * @returns {string} 生成的唯一模型ID
     */
    generateModelId() {
        const randomId = 'model-' + crypto.randomBytes(5).toString('hex');
        // 确保ID不重复
        if (this.config.models && this.config.models[randomId]) {
            return this.generateModelId(); // 递归重新生成
        }
        return randomId;
    }

    /**
     * 加载模型配置
     *
     * 从配置文件中读取模型配置，如果文件不存在或读取失败，返回默认配置
     *
     * @returns {Object} 模型配置对象
     */
    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                return { models: {}, currentModel: null };
            }
            const data = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            log.error('加载模型配置失败:', error.message);
            return { models: {}, currentModel: null };
        }
    }

    /**
     * 保存模型配置
     *
     * 将当前模型配置保存到配置文件，并通知所有注册的窗口配置已更新
     *
     * @returns {boolean} 保存是否成功
     */
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
            log.error('保存模型配置失败:', error.message);
            return false;
        }
    }

    /**
     * 添加新模型
     *
     * 创建新的模型配置并保存，自动生成唯一ID
     *
     * @param {Object} model - 模型配置对象，包含name、type、apiKey等属性
     * @returns {boolean} 添加是否成功
     */
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

    /**
     * 更新现有模型
     *
     * 更新指定ID的模型配置并保存
     *
     * @param {string} modelId - 要更新的模型ID
     * @param {Object} model - 新的模型配置对象
     * @returns {boolean} 更新是否成功
     */
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

    getModelById(modelId) {
        return this.config.models[modelId];
    }

    /**
     * 删除模型
     *
     * 删除指定ID的模型配置，如果删除的是当前选中的模型，则清除当前模型设置
     *
     * @param {string} modelId - 要删除的模型ID
     * @returns {boolean} 删除是否成功
     */
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

    /**
     * 获取模型配置
     *
     * 返回当前的模型配置对象，包含所有模型和当前选中的模型
     *
     * @returns {Object} 模型配置对象
     */
    getModelConfig() {
        return this.config;
    }

    getCurrentModelId() {
        return this.config.currentModel;
    }

    /**
     * 选择当前使用的模型
     *
     * 设置指定ID的模型为当前使用的模型
     *
     * @param {string} modelId - 要选择的模型ID
     * @returns {boolean} 选择是否成功
     */
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

    /**
     * 注册窗口以接收配置更新
     *
     * 将窗口的WebContents添加到注册列表，以便在配置变更时通知
     *
     * @param {Electron.WebContents} webContents - 要注册的窗口WebContents
     */
    registerWindow(webContents) {
        if (webContents && !webContents.isDestroyed()) {
            this.registeredWindows.add(webContents);

            // 当窗口关闭时，移除它
            webContents.on('destroyed', () => {
                this.unregisterWindow(webContents);
            });
        }
    }

    /**
     * 取消注册窗口
     *
     * 从注册列表中移除窗口的WebContents
     *
     * @param {Electron.WebContents} webContents - 要取消注册的窗口WebContents
     */
    unregisterWindow(webContents) {
        this.registeredWindows.delete(webContents);
    }

    /**
     * 通知所有注册的窗口配置已更新
     *
     * 向所有注册的窗口发送配置更新事件
     */
    notifyAllWindows() {
        for (const webContents of this.registeredWindows) {
            if (!webContents.isDestroyed()) {
                webContents.send('model-config-updated', this.config);
            }
        }
    }

    /**
     * 创建大模型客户端
     *
     * 根据当前选择的模型配置创建OpenAI API客户端实例
     *
     * @returns {Object} 创建的OpenAI客户端实例
     * @throws {Error} 当没有选择模型或模型配置不存在时抛出错误
     */
    getModelClient(modelId) {
        try {
            if (!this.config.models) {
                throw new Error("模型配置不存在");
            }

            const model = this.config.models[modelId];
            if (!model) {
                throw new Error("模型", modelId, "不存在");
            }

            const modelClient = new OpenAI({
                apiKey: model.apiKey,
                baseURL: model.apiBaseUrl
            });

            return modelClient;
        } catch (err) {
            log.error("获取modelClient失败", err.message)
            throw err;
        }
    }
}

// 创建并导出单例实例
const modelConfigManager = new ModelConfig();
module.exports = modelConfigManager;