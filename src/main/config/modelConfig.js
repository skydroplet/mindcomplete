const BaseConfigManager = require('./baseConfigManager');
const Logger = require('../logger');
const log = new Logger('modelConfig');
const { OpenAI } = require('openai');

/**
 * 模型配置管理器类
 *
 * 负责管理AI模型配置，提供添加、删除、更新模型的功能
 * 继承自BaseConfigManager，可以发出配置变更事件
 */
class ModelConfig extends BaseConfigManager {
    /**
     * 创建模型配置管理器实例
     */
    constructor() {
        const defaultConfig = {
            models: {},
            currentModel: null
        };
        super('models.json', defaultConfig);
    }

    /**
     * 添加新模型
     * @param {Object} model - 模型配置对象，包含name、type、apiKey等属性
     * @returns {string|null} 成功时返回新创建的模型ID，失败时返回null
     */
    addModel(model) {
        if (!this.config.models) {
            this.config.models = {};
        }

        // 生成唯一ID
        const modelId = this.generateUniqueId('model', this.config.models);

        this.config.models[modelId] = {
            id: modelId,
            name: model.name,
            type: model.type,
            apiKey: model.apiKey,
            apiBaseUrl: model.apiBaseUrl,
            contextWindowSize: model.contextWindowSize || 4096,
            temperature: model.temperature || 0.7
        }

        // 保存配置并返回新创建的模型ID
        const saved = this.saveConfig();
        return saved ? modelId : null;
    }

    /**
     * 更新现有模型
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

    /**
     * 获取指定ID的模型
     * @param {string} modelId - 模型ID
     * @returns {Object} 模型配置对象
     */
    getModelById(modelId) {
        return this.config.models[modelId];
    }

    /**
     * 删除模型
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
     * 选择当前使用的模型
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
     * 创建大模型客户端
     * @param {string} modelId - 模型ID
     * @returns {Object} 创建的OpenAI客户端实例
     * @throws {Error} 当模型配置不存在时抛出错误
     */
    getModelClient(modelId) {
        if (!this.config.models) {
            log.error("no models");
            return null
        }

        const model = this.config.models[modelId];
        if (!model) {
            log.error("model ", modelId, " not found");
            return null
        }

        const modelClient = new OpenAI({
            apiKey: model.apiKey,
            baseURL: model.apiBaseUrl
        });

        return modelClient;
    }
}

// 创建并导出单例实例
const modelConfig = new ModelConfig();
module.exports = modelConfig;