/**
 * modelMarketConfig.js
 * 模型市场配置管理模块
 *
 * 负责从远程API获取模型市场数据并缓存到本地，包括：
 * - 异步获取远程模型市场数据
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
const log = new Logger('modelMarketConfig');

/**
 * 模型市场配置管理器类
 *
 * 负责管理模型市场数据的获取、缓存和访问
 * 继承自BaseConfigManager，提供配置文件管理能力
 */
class ModelMarketConfig extends BaseConfigManager {
    /**
     * 创建模型市场配置管理器实例
     */
    constructor() {
        const defaultConfig = {
            models: [],
            lastUpdated: null,
            version: '1.0'
        };

        super('model-market.json', defaultConfig);

        // 远程API地址
        this.apiUrl = 'https://api.mindcomplete.me/v1/market/models';

        // 缓存更新间隔（毫秒）- 4小时
        this.updateInterval = 4 * 60 * 60 * 1000;

        // 内存缓存
        this.marketModels = [];

        // 初始化数据
        this.initialize();
    }

    /**
     * 初始化模型市场数据
     */
    async initialize() {
        try {
            // 加载本地缓存的数据
            if (this.config.models && Array.isArray(this.config.models) && this.config.models.length > 0) {
                this.marketModels = this.config.models;
                log.info('从本地缓存加载模型市场数据，共', this.marketModels.length, '个模型');
            }

            // 异步获取最新数据
            this.fetchMarketData().catch(error => {
                log.error('异步获取模型市场数据失败:', error.message);
            });

            // 设置定期更新
            setInterval(() => {
                this.fetchMarketData().catch(error => {
                    log.error('定期更新模型市场数据失败:', error.message);
                });
            }, this.updateInterval);

        } catch (error) {
            log.error('初始化模型市场数据失败:', error.message);
        }
    }

    /**
     * 从远程API获取模型市场数据
     */
    async fetchMarketData() {
        return new Promise((resolve, reject) => {
            try {
                log.info('开始获取模型市场数据:', this.apiUrl);

                const urlObj = new URL(this.apiUrl);
                const client = urlObj.protocol === 'https:' ? https : http;

                const request = client.get(urlObj, (response) => {
                    let data = '';

                    response.on('data', (chunk) => {
                        data += chunk;
                    });

                    response.on('end', () => {
                        try {
                            const rsp = JSON.parse(data);
                            log.info('获取到模型市场数据:', rsp);

                            if (rsp && rsp.models && Array.isArray(rsp.models)) {
                                // 处理数据格式
                                const processedModels = rsp.models.map(model => ({
                                    id: model.name.replace(/[^a-zA-Z0-9-_]/g, '-'), // 生成安全的ID
                                    name: model.name,
                                    modelType: model.modelType,
                                    provider: model.provider,
                                    description: model.description,
                                    apiUrl: model.apiUrl,
                                    mainUrl: model.mainUrl,
                                    registerUrl: model.registerUrl,
                                    apiKeyUrl: model.apiKeyUrl,
                                    contextWindow: Math.floor(model.windowSize / 1024), // 转换为K单位
                                    features: this.extractFeatures(model.description), // 从描述中提取特性
                                    pricingMode: model.pricingMode,
                                }));

                                // 更新内存缓存
                                this.marketModels = processedModels;

                                // 更新配置文件
                                this.config.models = processedModels;
                                this.config.lastUpdated = new Date().toISOString();
                                this.saveConfig();

                                log.info('模型市场数据获取成功，共', processedModels.length, '个模型');
                                resolve(processedModels);

                                // 通知所有注册的窗口
                                this.notifyRegisteredWindows('model-market-updated', {
                                    models: processedModels,
                                    lastUpdated: this.config.lastUpdated
                                });

                            } else {
                                const error = new Error('API返回的数据格式不正确');
                                log.warn('模型市场数据获取失败：', error.message);
                                reject(error);
                            }
                        } catch (parseError) {
                            log.error('解析模型市场数据失败:', parseError.message);
                            reject(parseError);
                        }
                    });
                });

                request.on('error', (error) => {
                    log.error('请求模型市场数据失败:', error.message);
                    reject(error);
                });

                request.setTimeout(30000, () => {
                    request.destroy();
                    reject(new Error('请求超时'));
                });

            } catch (error) {
                log.error('获取模型市场数据时发生错误:', error.message);
                reject(error);
            }
        });
    }

    /**
     * 从模型描述中提取特性关键词
     */
    extractFeatures(description) {
        const features = [];
        const keywordMap = {
            '推理': '推理',
            '数学': '数学',
            '编程': '编程',
            '代码': '编程',
            '对话': '对话',
            '翻译': '翻译',
            '创意': '创意写作',
            '写作': '创意写作',
            '多语言': '多语言'
        };

        for (const [keyword, feature] of Object.entries(keywordMap)) {
            if (description.includes(keyword) && !features.includes(feature)) {
                features.push(feature);
            }
        }

        // 如果没有找到特性，添加默认特性
        if (features.length === 0) {
            features.push('通用', '文本生成');
        }

        return features;
    }

    /**
     * 获取所有模型市场数据
     */
    getMarketModels() {
        return {
            models: this.marketModels,
            lastUpdated: this.config.lastUpdated,
            count: this.marketModels.length
        };
    }

    /**
     * 根据ID获取指定模型
     */
    getModelById(modelId) {
        return this.marketModels.find(model => model.id === modelId);
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
                models: this.marketModels,
                lastUpdated: this.config.lastUpdated
            };
        } catch (error) {
            log.error('手动刷新模型市场数据失败:', error.message);
            return {
                success: false,
                message: error.message,
                models: this.marketModels,
                lastUpdated: this.config.lastUpdated
            };
        }
    }

    /**
     * 获取缓存状态信息
     */
    getCacheInfo() {
        return {
            modelCount: this.marketModels.length,
            lastUpdated: this.config.lastUpdated,
            cacheFile: this.configPath,
            updateInterval: this.updateInterval / (1000 * 60 * 60) // 转换为小时
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
const modelMarketConfig = new ModelMarketConfig();
module.exports = modelMarketConfig; 