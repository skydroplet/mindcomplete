/**
 * 提示词管理模块
 * 负责提示词的添加、删除、更新和设置当前提示词
 */

const BaseConfigManager = require('./baseConfigManager');
const Logger = require('../logger');
const log = new Logger('promptManager');

class PromptConfig extends BaseConfigManager {
    /**
     * 创建提示词配置管理器实例
     */
    constructor() {
        const defaultConfig = {
            prompts: {
                'default-prompt-1': {
                    name: 'MCP工具优先',
                    content: '当你不确定的答案时候，请优先使用Tools获取信息。',
                    type: 'system'
                },
                'default-prompt-2': {
                    name: '不添加提示词',
                    content: '',
                    type: 'system'
                },
            },
            currentPrompt: 'default-prompt-1',
        };

        super('prompts.json', defaultConfig);
    }

    /**
     * 获取所有提示词
     * @returns {Object} 提示词对象
     */
    getPrompts() {
        return this.config.prompts;
    }
    /**
     * 根据类型获取提示词
     * @param {string} type 提示词类型，可选值为'system'或'user'
     * @returns {Object} 指定类型的提示词对象集合
     */
    getPromptsByType(type) {
        if (!type || !['system', 'user'].includes(type)) {
            log.warn(`无效的提示词类型: ${type}，支持的类型为 'system' 或 'user'`);
            return {};
        }

        const filteredPrompts = {};
        Object.keys(this.config.prompts).forEach(promptId => {
            if (this.config.prompts[promptId].type === type) {
                filteredPrompts[promptId] = this.config.prompts[promptId];
            }
        });

        return filteredPrompts;
    }

    /**
     * 获取当前选中的提示词
     * @returns {Object|null} 当前提示词对象或null
     */
    getCurrentPrompt() {
        if (this.config.currentPrompt && this.config.prompts[this.config.currentPrompt]) {
            return {
                id: this.config.currentPrompt,
                ...this.config.prompts[this.config.currentPrompt]
            };
        }
        return null;
    }

    /**
     * 获取指定ID的提示词
     * @param {string} promptId - 提示词ID
     * @returns {Object} 提示词对象
     */
    getPromptById(promptId) {
        return this.config.prompts[promptId];
    }

    /**
     * 设置当前提示词
     * @param {string|null} promptId 提示词ID，null表示不使用提示词
     * @returns {boolean} 设置成功返回true
     */
    setCurrentPrompt(promptId) {
        if (promptId === null || this.config.prompts[promptId]) {
            this.config.currentPrompt = promptId;
            return this.saveConfig();
        }
        return false;
    }

    /**
     * 添加新提示词
     * @param {Object} prompt 提示词对象，包含name和content属性 
     * @returns {string} 新创建的提示词ID
     */
    addPrompt(prompt) {
        try {
            const promptId = this.generateUniqueId('prompt', this.config.prompts);
            this.config.prompts[promptId] = prompt;
            this.saveConfig();
            return promptId;
        } catch (error) {
            log.error('添加提示词失败:', error.message);
            throw error;
        }
    }

    /**
     * 更新提示词
     * @param {string} promptId 提示词ID
     * @param {Object} prompt 更新后的提示词对象 
     * @returns {boolean} 更新成功返回true
     */
    updatePrompt(promptId, prompt) {
        try {
            if (this.config.prompts[promptId]) {
                this.config.prompts[promptId] = prompt;
                return this.saveConfig();
            }
            return false;
        } catch (error) {
            log.error('更新提示词失败:', error.message);
            throw error;
        }
    }

    /**
     * 删除提示词
     * @param {string} promptId 提示词ID
     * @returns {boolean} 删除成功返回true
     */
    deletePrompt(promptId) {
        try {
            if (this.config.prompts[promptId]) {
                delete this.config.prompts[promptId];

                // 如果删除的是当前选中的提示词，清除当前选中状态
                if (this.config.currentPrompt === promptId) {
                    this.config.currentPrompt = null;
                }

                return this.saveConfig();
            }
            return false;
        } catch (error) {
            log.error('删除提示词失败:', error.message);
            throw error;
        }
    }
}

// 创建单例
const promptConfig = new PromptConfig();
module.exports = promptConfig; 