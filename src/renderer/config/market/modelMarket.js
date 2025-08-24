/**
 * modelMarket.js
 * 模型市场模块
 * 
 * 负责模型市场相关的所有功能，包括：
 * - 数据获取和刷新
 * - 列表渲染和交互
 * - 详情显示
 * - 添加到本地配置
 */

const { ipcRenderer } = require('electron');
const Logger = require('../../../main/logger');
const i18n = require('../../../locales/i18n');

const log = new Logger('modelMarket');

/**
 * 模型市场管理器类
 */
class ModelMarketManager {
    constructor() {
        // 模型市场数据存储
        this.marketModels = [];

        // DOM元素引用
        this.elements = {};

        // 初始化DOM元素引用
        this.initElements();
    }

    /**
     * 初始化DOM元素引用
     */
    initElements() {
        this.elements = {
            modelMenuItems: document.querySelectorAll('.model-menu-item'),
            modelConfigSection: document.getElementById('model-config-section'),
            modelMarketSection: document.querySelector('.model-market-section'),
            modelConfigDetail: document.getElementById('model-config-detail'),
            modelMarketDetail: document.querySelector('.model-market-detail'),
            refreshButton: document.getElementById('refresh-market-btn'),
            marketLoading: document.getElementById('market-loading'),
            marketError: document.getElementById('market-error'),
            marketModelsContainer: document.getElementById('market-models-container'),
            marketDetailTemplate: document.getElementById('market-detail-template'),
            marketEmptyState: document.getElementById('market-empty-state')
        };
    }

    /**
     * 初始化模型市场功能
     */
    init() {
        this.initMenuSwitching();
        this.initRefreshButton();
        this.initMarketDataListener();
        this.initDefaultDisplay();
    }

    /**
     * 初始化菜单切换功能
     */
    initMenuSwitching() {
        this.elements.modelMenuItems.forEach(item => {
            item.addEventListener('click', async (event) => {
                await this.handleMenuSwitch(event);
            });
        });
    }

    /**
     * 处理菜单切换
     */
    async handleMenuSwitch(event) {
        this.elements.modelMenuItems.forEach(i => i.classList.remove('active'));
        event.target.classList.add('active');
        const menu = event.target.getAttribute('data-menu');

        if (menu === 'config') {
            await this.showConfigPanel();
        } else if (menu === 'market') {
            await this.showMarketPanel();
        }
    }

    /**
     * 显示模型配置面板
     */
    async showConfigPanel() {
        this.elements.modelConfigSection.style.display = 'flex';
        this.elements.modelMarketSection.style.display = 'none';
        this.elements.modelConfigDetail.style.display = 'flex';
        this.elements.modelMarketDetail.style.display = 'none';

        // 确保模型配置页面有数据显示
        const modelService = require('../../modelService');
        if (!modelService.selectedModelId || !window.currentModelId) {
            // 如果没有选中的模型，选择第一个可用的模型
            const models = modelService.models || window.models || {};
            const modelIds = Object.keys(models);
            if (modelIds.length > 0) {
                const firstModelId = modelIds[0];
                log.info('切换到模型配置页面，自动选择第一个模型:', firstModelId);
                modelService.selectModel(firstModelId);
            } else {
                // 如果没有模型，重置表单显示
                log.info('切换到模型配置页面，但没有可用模型');
                modelService.resetModelForm();
            }
        } else {
            // 如果已经有选中的模型，确保详情正确显示
            log.info('切换到模型配置页面，当前选中模型:', modelService.selectedModelId || window.currentModelId);
            const currentId = modelService.selectedModelId || window.currentModelId;
            modelService.selectModel(currentId);
        }
    }

    /**
     * 显示模型市场面板
     */
    async showMarketPanel() {
        this.elements.modelConfigSection.style.display = 'none';
        this.elements.modelMarketSection.style.display = 'flex';
        this.elements.modelConfigDetail.style.display = 'none';
        this.elements.modelMarketDetail.style.display = 'flex';

        // 如果还没有加载过模型数据，则获取
        if (this.marketModels.length === 0) {
            this.showLoadingState();
            const success = await this.fetchMarketModels();
            if (success) {
                this.renderMarketModelList();
            } else {
                this.showErrorState();
            }
        } else {
            // 如果已经有数据，确保第一个模型被选中并显示详情
            this.selectFirstModel();
        }
    }

    /**
     * 从主进程获取模型市场数据
     */
    async fetchMarketModels() {
        try {
            log.info('从主进程获取模型市场数据');
            const response = await ipcRenderer.invoke('get-market-models');
            log.info('获取到模型市场数据:', response);

            if (response && response.models && Array.isArray(response.models)) {
                this.marketModels = response.models;
                log.info(i18n.t('settings.modelMarket.messages.logFetchSuccess', { count: this.marketModels.length }));
                return true;
            } else {
                log.warn(i18n.t('settings.modelMarket.messages.logFetchFailed'));
                return false;
            }
        } catch (error) {
            log.error(i18n.t('settings.modelMarket.messages.logFetchFailedWithError', { error: error.message }));
            return false;
        }
    }

    /**
     * 手动刷新模型市场数据
     */
    async refreshMarketModels() {
        try {
            log.info('手动刷新模型市场数据');
            const response = await ipcRenderer.invoke('refresh-market-models');
            log.info('刷新模型市场数据结果:', response);

            if (response && response.success && response.models && Array.isArray(response.models)) {
                this.marketModels = response.models;
                log.info(i18n.t('settings.modelMarket.messages.logFetchSuccess', { count: this.marketModels.length }));
                return true;
            } else {
                log.warn('刷新模型市场数据失败:', response ? response.message : '未知错误');
                return false;
            }
        } catch (error) {
            log.error('刷新模型市场数据时出错:', error.message);
            return false;
        }
    }

    /**
     * 获取收费模式的样式类名和文本
     */
    getPricingInfo(pricingMode) {
        // 如果没有收费模式信息，返回null表示不显示
        if (!pricingMode) {
            return null;
        }

        // 直接使用API返回的收费模式值作为显示文本
        // 根据常见的收费模式设置样式类
        let className = 'pricing-unknown';
        if (pricingMode.toLowerCase().includes('free')) {
            className = 'pricing-free';
        } else if (pricingMode.toLowerCase().includes('paid') || pricingMode.toLowerCase().includes('premium')) {
            className = 'pricing-paid';
        } else if (pricingMode.toLowerCase().includes('trial') || pricingMode.toLowerCase().includes('limited')) {
            className = 'pricing-limited-free';
        }

        return {
            class: className,
            text: pricingMode
        };
    }

    /**
     * 渲染模型市场列表
     */
    renderMarketModelList() {
        if (!this.elements.marketModelsContainer) return;

        // 隐藏加载和错误状态
        this.hideLoadingState();
        this.hideErrorState();

        if (this.marketModels.length === 0) {
            this.showErrorState(i18n.t('settings.modelMarket.messages.noModelData'));
            return;
        }

        this.elements.marketModelsContainer.innerHTML = this.marketModels.map((model, index) => {
            const pricingInfo = this.getPricingInfo(model.pricingMode);
            const pricingTag = pricingInfo ? `<span class="market-pricing-tag ${pricingInfo.class}">${pricingInfo.text}</span>` : '';
            return `
                <div class="market-model-item ${index === 0 ? 'active' : ''}" data-model="${model.id}">
                    <div class="market-model-name">${model.name}</div>
                    <div class="market-model-meta">
                        <span class="market-model-type">${model.provider}</span>
                        ${pricingTag}
                    </div>
                </div>
            `;
        }).join('');

        // 重新绑定点击事件
        this.initMarketModelItems();

        // 默认显示第一个模型的详情
        if (this.marketModels.length > 0) {
            this.showMarketModelDetail(this.marketModels[0].id);
        }
    }

    /**
     * 初始化模型市场项目点击事件
     */
    initMarketModelItems() {
        const marketModelItems = document.querySelectorAll('#market-models-container .market-model-item');
        marketModelItems.forEach(item => {
            item.addEventListener('click', (event) => {
                marketModelItems.forEach(i => i.classList.remove('active'));
                event.target.closest('.market-model-item').classList.add('active');
                const modelId = event.target.closest('.market-model-item').getAttribute('data-model');
                this.showMarketModelDetail(modelId);
            });
        });
    }

    /**
     * 显示模型市场详情
     */
    showMarketModelDetail(modelId) {
        if (!modelId) {
            // 隐藏所有状态
            this.elements.marketDetailTemplate.style.display = 'none';
            this.elements.marketEmptyState.style.display = 'none';
            return;
        }

        const model = this.marketModels.find(m => m.id === modelId);
        if (!model) {
            // 显示空状态
            this.elements.marketDetailTemplate.style.display = 'none';
            this.elements.marketEmptyState.style.display = 'block';
            return;
        }

        // 隐藏空状态，显示详情
        this.elements.marketEmptyState.style.display = 'none';
        this.elements.marketDetailTemplate.style.display = 'block';

        // 填充模型信息
        document.getElementById('market-model-name').textContent = model.name;

        // 填充模型描述
        document.getElementById('market-model-provider').textContent = model.provider;
        document.getElementById('market-model-description').textContent = model.description;
        document.getElementById('market-context-window').textContent = model.contextWindow + 'K';
        document.getElementById('market-model-type').textContent = model.modelType;
        document.getElementById('market-api-url').textContent = model.apiUrl;

        // 设置收费模式显示
        const pricingModeElement = document.getElementById('market-pricing-mode');
        if (pricingModeElement) {
            const pricingInfo = this.getPricingInfo(model.pricingMode);
            if (pricingInfo) {
                pricingModeElement.textContent = pricingInfo.text;
                pricingModeElement.className = `market-spec-value market-pricing-display ${pricingInfo.class}`;
                pricingModeElement.style.display = '';
            } else {
                // 如果没有收费信息，隐藏该元素
                pricingModeElement.style.display = 'none';
            }
        }

        // 填充特性标签
        const featuresContainer = document.getElementById('market-model-features');
        if (featuresContainer) {
            featuresContainer.innerHTML = model.features.map(feature =>
                `<span class="market-feature-tag">${feature}</span>`
            ).join('');
        }

        // 设置常用链接
        this.setLink('market-main-url', model.mainUrl);
        this.setLink('market-invite-url', model.registerUrl);
        this.setLink('market-apikey-url', model.apiKeyUrl);

        // 设置添加按钮
        this.setupAddButton(model);
    }

    /**
     * 设置链接元素
     */
    setLink(elementId, url) {
        const element = document.getElementById(elementId);
        if (element) {
            if (url) {
                element.innerHTML = `<a href="${url}" target="_blank" class="market-link">${url}</a>`;
            } else {
                element.textContent = i18n.t('settings.modelMarket.messages.noData');
            }
        }
    }

    /**
     * 设置添加按钮
     */
    setupAddButton(model) {
        const addButton = document.getElementById('add-market-model-btn');
        if (addButton) {
            addButton.setAttribute('data-model-id', model.id);

            // 移除旧的事件监听器并添加新的
            const newButton = addButton.cloneNode(true);
            addButton.parentNode.replaceChild(newButton, addButton);

            newButton.addEventListener('click', () => {
                this.addMarketModelToConfig(model.id);
            });
        }
    }

    /**
 * 添加市场模型到配置
 */
    async addMarketModelToConfig(modelId) {
        const model = this.marketModels.find(m => m.id === modelId);
        if (!model) {
            log.error('无法找到模型ID:', modelId);
            return;
        }

        log.info('添加市场模型到配置:', model.name);

        // 检查市场模型ID是否已存在
        try {
            const exists = await ipcRenderer.invoke('check-model-exists', model.id);
            if (exists) {
                log.warn('市场模型ID已存在:', model.id);
                const message = i18n.t('settings.modelMarket.messages.duplicateModel', { name: model.name });
                alert(message);
                return;
            }
        } catch (error) {
            log.error('检查市场模型是否存在时出错:', error);
            alert('检查模型是否存在时出错，请重试');
            return;
        }

        // 直接调用后端API添加模型，使用市场模型的ID作为key
        const modelData = {
            name: model.name,
            type: model.modelType,
            apiUrl: model.apiUrl,
            apiKey: '', // 需要用户自己填写
            contextWindowSize: model.contextWindow
        };

        try {
            const savedModelId = await ipcRenderer.invoke('add-model', modelData, model.id);
            const success = !!savedModelId;
            log.info('添加模型结果:', success);

            if (success) {
                log.info('模型配置已自动保存成功:', model.name);

                // 刷新模型列表
                const latestModels = await ipcRenderer.invoke('get-models');
                if (latestModels) {
                    window.models = latestModels;
                    const modelService = require('../../modelService');
                    modelService.models = latestModels;
                    modelService.updateModelList(latestModels);
                    log.info('模型配置数据已同步更新');
                }

                // 构建提示信息
                let message = i18n.t('settings.modelMarket.messages.addSuccess', { name: model.name }) + '\n\n';
                message += i18n.t('settings.modelMarket.messages.setupInstructions') + '\n\n';

                alert(message);
                ipcRenderer.invoke('reset-window-focus');
            } else {
                log.error('模型配置保存失败:', model.name);
                alert(i18n.t('settings.modelMarket.messages.addFailed', { name: model.name }));
            }
        } catch (error) {
            log.error('保存模型配置时出错:', error.message);
            alert(i18n.t('settings.modelMarket.messages.saveError', { name: model.name, error: error.message || error }));
        }
    }

    /**
     * 初始化刷新按钮
     */
    initRefreshButton() {
        if (this.elements.refreshButton) {
            this.elements.refreshButton.addEventListener('click', async () => {
                log.info('用户点击刷新模型市场数据按钮');

                this.showLoadingState();
                const success = await this.refreshMarketModels();

                if (success) {
                    this.renderMarketModelList();
                    log.info('模型市场数据刷新成功');

                    // 刷新模型市场数据成功后，同时更新模型配置数据
                    // 确保模型配置页面的数据也是最新的
                    try {
                        const latestModels = await ipcRenderer.invoke('get-models');
                        if (latestModels) {
                            window.models = latestModels;
                            const modelService = require('../../modelService');
                            modelService.models = latestModels;
                            modelService.updateModelList(latestModels);
                            log.info('模型配置数据已同步更新');
                        }
                    } catch (error) {
                        log.error('同步更新模型配置数据失败:', error.message);
                    }
                } else {
                    this.showErrorState();
                    log.error('模型市场数据刷新失败');
                }
            });
        }
    }

    /**
     * 初始化市场数据更新监听器
     */
    initMarketDataListener() {
        ipcRenderer.on('model-market-updated', async (event, data) => {
            log.info('收到模型市场数据更新通知:', data);
            if (data && data.models && Array.isArray(data.models)) {
                this.marketModels = data.models;
                // 如果当前正在显示模型市场页面，更新界面
                const isMarketActive = document.querySelector('.model-menu-item[data-menu="market"]').classList.contains('active');
                if (isMarketActive) {
                    this.renderMarketModelList();
                    log.info('模型市场界面已自动更新');
                }

                // 同时更新模型配置数据，确保数据同步
                try {
                    const latestModels = await ipcRenderer.invoke('get-models');
                    if (latestModels) {
                        window.models = latestModels;
                        const modelService = require('../../modelService');
                        modelService.models = latestModels;
                        modelService.updateModelList(latestModels);
                        log.info('收到模型市场更新通知后，模型配置数据已同步更新');
                    }
                } catch (error) {
                    log.error('同步更新模型配置数据失败:', error.message);
                }
            }
        });
    }

    /**
     * 初始化默认显示
     */
    initDefaultDisplay() {
        const { modelConfigSection, modelMarketSection, modelConfigDetail, modelMarketDetail } = this.elements;
        if (modelConfigSection && modelMarketSection && modelConfigDetail && modelMarketDetail) {
            modelConfigSection.style.display = 'flex';
            modelMarketSection.style.display = 'none';
            modelConfigDetail.style.display = 'flex';
            modelMarketDetail.style.display = 'none';
        }
    }

    /**
     * 显示加载状态
     */
    showLoadingState() {
        if (this.elements.marketLoading) {
            this.elements.marketLoading.style.display = 'block';
        }
        this.hideErrorState();
    }

    /**
     * 隐藏加载状态
     */
    hideLoadingState() {
        if (this.elements.marketLoading) {
            this.elements.marketLoading.style.display = 'none';
        }
    }

    /**
     * 显示错误状态
     */
    showErrorState(message) {
        if (this.elements.marketError) {
            this.elements.marketError.style.display = 'block';
            const errorMessageEl = document.getElementById('market-error-message');
            if (errorMessageEl) {
                errorMessageEl.textContent = message || i18n.t('settings.modelMarket.messages.loadFailed');
            }
        }
        this.hideLoadingState();
    }

    /**
     * 隐藏错误状态
     */
    hideErrorState() {
        if (this.elements.marketError) {
            this.elements.marketError.style.display = 'none';
        }
    }

    /**
     * 选择第一个模型
     */
    selectFirstModel() {
        const firstModelItem = document.querySelector('#market-models-container .market-model-item');
        if (firstModelItem && this.marketModels.length > 0) {
            // 重置所有项的active状态
            document.querySelectorAll('#market-models-container .market-model-item').forEach(item => item.classList.remove('active'));
            // 激活第一个项
            firstModelItem.classList.add('active');
            // 显示第一个模型的详情
            this.showMarketModelDetail(this.marketModels[0].id);
        }
    }
}

module.exports = ModelMarketManager;
