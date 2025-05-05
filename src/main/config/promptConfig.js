/**
 * 提示词管理模块
 * 负责提示词的添加、删除、更新和设置当前提示词
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const Logger = require('../logger');
const log = new Logger('promptManager');
const crypto = require('crypto');

class PromptConfigManager extends EventEmitter {
    constructor() {
        super();
        this.config = {
            prompts: {},
            currentPrompt: null
        };
        this.configPath = '';
        this.windows = [];

        this.init();
    }

    /**
     * 初始化提示词配置
     */
    init() {
        try {
            // 使用app.getPath('userData')目录
            const userDataPath = app.getPath('userData');
            const configDir = path.join(userDataPath, 'user-data', 'config');

            // 确保配置目录存在
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
                log.info(`已创建配置目录: ${configDir}`);
            }

            this.configPath = path.join(configDir, 'prompts.json');
            log.info(`提示词配置文件路径: ${this.configPath}`);

            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                this.config = JSON.parse(data);

                log.info('已加载提示词配置');
            } else {
                // 初始化默认配置
                this.config = {
                    prompts: {},
                    currentPrompt: null
                };
                this.save();
                log.info('已创建默认提示词配置');
            }

            this.initialized = true;
        } catch (error) {
            log.error('初始化提示词配置出错:', error.message);
        }
    }

    /**
     * 保存提示词配置到文件
     */
    save() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            log.info(`已保存提示词配置到: ${this.configPath}`);
            this.emit('prompts-updated', this.config);
            this.notifyWindows();
        } catch (error) {
            log.error('保存提示词配置出错:', error.message);
            throw error;
        }
    }

    /**
     * 注册窗口，以便发送配置更新通知
     * @param {Object} window 浏览器窗口的webContents对象
     */
    registerWindow(window) {
        if (!this.windows.includes(window)) {
            this.windows.push(window);
            log.info('已注册窗口以接收提示词配置更新');
        }
    }

    /**
     * 通知所有已注册的窗口提示词配置已更新
     */
    notifyWindows() {
        // 过滤掉已销毁的窗口
        this.windows = this.windows.filter(window => !window.isDestroyed());

        // 向所有窗口发送配置更新消息
        for (const window of this.windows) {
            try {
                window.send('prompts-updated', this.config);
                log.info('已向窗口发送提示词配置更新通知');
            } catch (error) {
                log.error('向窗口发送提示词配置更新通知失败:', error.message);
            }
        }
    }

    /**
     * 获取所有提示词
     * @returns {Object} 提示词对象
     */
    getPrompts() {
        return this.config.prompts;
    }

    getCurrentPromptId() {
        return this.config.currentPrompt;
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

    getPromptById(promptId) {
        return this.config.prompts[promptId];
    }

    /**
     * 获取当前选中的提示词ID
     * @returns {string|null} 当前提示词ID或null
     */
    getCurrentPromptId() {
        return this.config.currentPrompt;
    }

    /**
     * 设置当前提示词
     * @param {string|null} promptId 提示词ID，null表示不使用提示词
     * @returns {boolean} 设置成功返回true
     */
    setCurrentPrompt(promptId) {
        if (promptId === null || this.config.prompts[promptId]) {
            this.config.currentPrompt = promptId;
            this.save();
            return true;
        }
        return false;
    }

    /**
     * 生成不重复的随机提示词ID
     * @returns {string} 随机生成的提示词ID
     */
    generatePromptId() {
        const randomId = 'prompt-' + crypto.randomBytes(5).toString('hex');
        // 确保ID不重复
        if (this.config.prompts && this.config.prompts[randomId]) {
            return this.generatePromptId(); // 递归重新生成
        }
        return randomId;
    }

    /**
     * 添加新提示词
     * @param {Object} prompt 提示词对象，包含name和content属性 
     * @returns {string} 新创建的提示词ID
     */
    addPrompt(prompt) {
        try {
            const promptId = this.generatePromptId();
            this.config.prompts[promptId] = prompt;
            this.save();
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
                this.save();
                return true;
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

                this.save();
                return true;
            }
            return false;
        } catch (error) {
            log.error('删除提示词失败:', error.message);
            throw error;
        }
    }
}

// 创建单例
const promptConfigManager = new PromptConfigManager();

module.exports = promptConfigManager; 