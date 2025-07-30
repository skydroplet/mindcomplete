/**
 * promptMarketConfig.js
 * 提示词市场配置管理模块
 *
 * 负责从远程API获取提示词市场数据并缓存到本地，包括：
 * - 异步获取远程提示词市场数据
 * - 缓存数据到内存和本地文件
 * - 提供数据访问接口
 * - 定期更新数据
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const BaseConfigManager = require('./baseConfigManager');
const Logger = require('../logger');
const log = new Logger('promptMarketConfig');

/**
 * 提示词市场配置管理器类
 *
 * 负责管理提示词市场数据的获取、缓存和访问
 * 继承自BaseConfigManager，提供配置文件管理能力
 */
class PromptMarketConfig extends BaseConfigManager {
    /**
     * 创建提示词市场配置管理器实例
     */
    constructor() {
        const defaultConfig = {
            prompts: [],
            lastUpdated: null,
            version: '1.0'
        };

        super('prompt-market.json', defaultConfig);

        // 获取appConfig实例来读取API URL
        const appConfig = require('./appConfig');

        // 从配置文件获取远程API地址
        this.apiUrl = appConfig.getPromptMarketApiUrl();

        // 缓存更新间隔（毫秒）- 4小时
        this.updateInterval = 4 * 60 * 60 * 1000;

        // 内存缓存
        this.marketPrompts = [];

        // 初始化数据
        this.initialize();
    }

    /**
     * 初始化提示词市场数据
     */
    async initialize() {
        try {
            // 加载本地缓存的数据
            if (this.config.prompts && Array.isArray(this.config.prompts) && this.config.prompts.length > 0) {
                this.marketPrompts = this.config.prompts;
                log.info('从本地缓存加载提示词市场数据，共', this.marketPrompts.length, '个提示词');
            }

            // 异步获取最新数据
            this.fetchMarketData().catch(error => {
                log.error('异步获取提示词市场数据失败:', error.message);
            });

            // 设置定期更新
            setInterval(() => {
                this.fetchMarketData().catch(error => {
                    log.error('定期更新提示词市场数据失败:', error.message);
                });
            }, this.updateInterval);

        } catch (error) {
            log.error('初始化提示词市场数据失败:', error.message);
        }
    }

    /**
     * 从远程API获取提示词市场数据
     */
    async fetchMarketData() {
        return new Promise((resolve, reject) => {
            try {
                log.info('开始获取提示词市场数据:', this.apiUrl);

                const urlObj = new URL(this.apiUrl);
                const client = urlObj.protocol === 'https:' ? https : http;

                const request = client.get(urlObj, (response) => {
                    // 使用Buffer数组收集原始数据，避免编码问题
                    const chunks = [];

                    response.on('data', (chunk) => {
                        // 将每个chunk存储在数组中，保持原始Buffer格式
                        chunks.push(chunk);
                    });

                    response.on('end', () => {
                        try {
                            // 将所有Buffer合并后统一解码为UTF-8字符串
                            const buffer = Buffer.concat(chunks);
                            const data = buffer.toString('utf8');

                            const rsp = JSON.parse(data);
                            log.info('获取到提示词市场数据:', rsp);

                            if (rsp && rsp.prompts && Array.isArray(rsp.prompts)) {
                                // 处理数据格式
                                const processedPrompts = rsp.prompts.map(prompt => ({
                                    id: this.generatePromptId(prompt.name), // 生成安全的ID
                                    name: prompt.name,
                                    content: prompt.content,
                                    type: 'system',
                                    source: 'market',
                                    version: rsp.version || '1.0'
                                }));

                                // 更新内存缓存
                                this.marketPrompts = processedPrompts;

                                // 更新配置文件
                                this.config.prompts = processedPrompts;
                                this.config.lastUpdated = new Date().toISOString();
                                this.config.version = rsp.version || '1.0';
                                this.saveConfig();

                                log.info('提示词市场数据获取成功，共', processedPrompts.length, '个提示词');
                                resolve(processedPrompts);

                                // 通知所有注册的窗口
                                this.notifyRegisteredWindows('prompt-market-updated', {
                                    prompts: processedPrompts,
                                    lastUpdated: this.config.lastUpdated
                                });

                            } else {
                                const error = new Error('API返回的数据格式不正确');
                                log.warn('提示词市场数据获取失败：', error.message);
                                reject(error);
                            }
                        } catch (parseError) {
                            log.error('解析提示词市场数据失败:', parseError.message);
                            reject(parseError);
                        }
                    });
                });

                request.on('error', (error) => {
                    log.error('请求提示词市场数据失败:', error.message);
                    reject(error);
                });

                request.setTimeout(30000, () => {
                    request.destroy();
                    reject(new Error('请求超时'));
                });

            } catch (error) {
                log.error('获取提示词市场数据时发生错误:', error.message);
                reject(error);
            }
        });
    }

    /**
     * 生成提示词ID
     */
    generatePromptId(name) {
        return name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-').toLowerCase();
    }

    /**
     * 获取所有提示词市场数据
     */
    getMarketPrompts() {
        return {
            prompts: this.marketPrompts,
            lastUpdated: this.config.lastUpdated,
            count: this.marketPrompts.length,
            version: this.config.version
        };
    }

    /**
     * 根据ID获取指定提示词
     */
    getPromptById(promptId) {
        return this.marketPrompts.find(prompt => prompt.id === promptId);
    }

    /**
     * 手动刷新数据
     */
    async refreshData() {
        try {
            await this.fetchMarketData();
            return {
                success: true,
                message: '数据刷新成功',
                prompts: this.marketPrompts,
                lastUpdated: this.config.lastUpdated
            };
        } catch (error) {
            log.error('手动刷新提示词市场数据失败:', error.message);
            return {
                success: false,
                message: error.message,
                prompts: this.marketPrompts,
                lastUpdated: this.config.lastUpdated
            };
        }
    }

    /**
     * 获取缓存状态信息
     */
    getCacheInfo() {
        return {
            promptCount: this.marketPrompts.length,
            lastUpdated: this.config.lastUpdated,
            cacheFile: this.configPath,
            updateInterval: this.updateInterval / (1000 * 60 * 60), // 转换为小时
            version: this.config.version
        };
    }

    /**
     * 通知所有注册的窗口
     * @param {string} eventName - 事件名称
     * @param {Object} data - 要发送的数据
     */
    notifyRegisteredWindows(eventName, data) {
        for (const webContents of this.registeredWindows) {
            if (!webContents.isDestroyed()) {
                webContents.send(eventName, data);
            }
        }
    }
}

// 创建并导出单例实例
const promptMarketConfig = new PromptMarketConfig();
module.exports = promptMarketConfig; 