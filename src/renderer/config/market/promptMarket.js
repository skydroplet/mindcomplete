/**
 * promptMarket.js
 * 提示词市场模块
 * 
 * 负责提示词市场相关的所有功能，包括：
 * - 数据获取和刷新
 * - 列表渲染和交互
 * - 详情显示
 * - 添加到本地配置
 */

const { ipcRenderer } = require('electron');
const Logger = require('../../../main/logger');
const i18n = require('../../../locales/i18n');

const log = new Logger('promptMarket');

/**
 * 提示词市场管理器类
 */
class PromptMarketManager {
    constructor() {
        // 提示词市场数据存储
        this.marketPrompts = [];

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
            promptMenuItems: document.querySelectorAll('#prompts .model-menu-item'),
            promptConfigSection: document.getElementById('prompt-config-section'),
            promptMarketSection: document.querySelector('.prompt-market-section'),
            promptConfigDetail: document.getElementById('prompt-config-detail'),
            promptMarketDetail: document.querySelector('.prompt-market-detail'),
            refreshButton: document.getElementById('refresh-prompt-market-btn'),
            promptMarketLoading: document.getElementById('prompt-market-loading'),
            promptMarketError: document.getElementById('prompt-market-error'),
            marketPromptsContainer: document.getElementById('market-prompts-container')
        };
    }

    /**
     * 初始化提示词市场功能
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
        this.elements.promptMenuItems.forEach(item => {
            item.addEventListener('click', async (event) => {
                await this.handleMenuSwitch(event);
            });
        });
    }

    /**
     * 处理菜单切换
     */
    async handleMenuSwitch(event) {
        this.elements.promptMenuItems.forEach(i => i.classList.remove('active'));
        event.target.classList.add('active');
        const menu = event.target.getAttribute('data-menu');

        if (menu === 'config') {
            this.showConfigPanel();
        } else if (menu === 'market') {
            await this.showMarketPanel();
        }
    }

    /**
     * 显示提示词配置面板
     */
    showConfigPanel() {
        this.elements.promptConfigSection.style.display = 'flex';
        this.elements.promptMarketSection.style.display = 'none';
        this.elements.promptConfigDetail.style.display = 'flex';
        this.elements.promptMarketDetail.style.display = 'none';

        // 这里可以添加配置面板的初始化逻辑
        log.info('Switched to prompt config panel');
    }

    /**
     * 显示提示词市场面板
     */
    async showMarketPanel() {
        this.elements.promptConfigSection.style.display = 'none';
        this.elements.promptMarketSection.style.display = 'flex';
        this.elements.promptConfigDetail.style.display = 'none';
        this.elements.promptMarketDetail.style.display = 'flex';

        // 如果还没有加载过提示词数据，则获取
        if (this.marketPrompts.length === 0) {
            this.showLoadingState();
            const success = await this.fetchMarketPrompts();
            if (success) {
                this.renderMarketPromptList();
            } else {
                this.showErrorState();
            }
        } else {
            // 如果已经有数据，确保第一个提示词被选中并显示详情
            this.selectFirstPrompt();
        }
    }

    /**
     * 从主进程获取提示词市场数据
     */
    async fetchMarketPrompts() {
        try {
            log.info('Fetching prompt market data from main process');
            const response = await ipcRenderer.invoke('get-market-prompts');
            log.info('Received prompt market data:', response);

            if (response && response.prompts && Array.isArray(response.prompts)) {
                this.marketPrompts = response.prompts;
                log.info('Successfully fetched prompt market data:', this.marketPrompts.length, 'prompts');
                return true;
            } else {
                log.warn('Failed to fetch prompt market data');
                return false;
            }
        } catch (error) {
            log.error('Error fetching prompt market data:', error.message);
            return false;
        }
    }

    /**
     * 手动刷新提示词市场数据
     */
    async refreshMarketPrompts() {
        try {
            log.info('Manually refreshing prompt market data');
            const response = await ipcRenderer.invoke('refresh-market-prompts');
            log.info('Refresh prompt market data result:', response);

            if (response && response.success && response.prompts && Array.isArray(response.prompts)) {
                this.marketPrompts = response.prompts;
                log.info('Successfully refreshed prompt market data:', this.marketPrompts.length, 'prompts');
                return true;
            } else {
                log.warn('Failed to refresh prompt market data:', response ? response.message : 'Unknown error');
                return false;
            }
        } catch (error) {
            log.error('Error refreshing prompt market data:', error.message);
            return false;
        }
    }

    /**
     * 渲染提示词市场列表
     */
    renderMarketPromptList() {
        if (!this.elements.marketPromptsContainer) return;

        // 隐藏加载和错误状态
        this.hideLoadingState();
        this.hideErrorState();

        if (this.marketPrompts.length === 0) {
            this.showErrorState(i18n.t('settings.promptMarket.messages.noPromptData'));
            return;
        }

        this.elements.marketPromptsContainer.innerHTML = this.marketPrompts.map((prompt, index) => {
            return `
                <div class="market-model-item ${index === 0 ? 'active' : ''}" data-prompt="${prompt.id}">
                    <div class="market-model-name">${prompt.name}</div>
                </div>
            `;
        }).join('');

        // 重新绑定点击事件
        this.initMarketPromptItems();

        // 默认显示第一个提示词的详情
        if (this.marketPrompts.length > 0) {
            this.showMarketPromptDetail(this.marketPrompts[0].id);
        }
    }

    /**
     * 初始化提示词市场项目点击事件
     */
    initMarketPromptItems() {
        const marketPromptItems = document.querySelectorAll('#market-prompts-container .market-model-item');
        marketPromptItems.forEach(item => {
            item.addEventListener('click', (event) => {
                marketPromptItems.forEach(i => i.classList.remove('active'));
                event.target.closest('.market-model-item').classList.add('active');
                const promptId = event.target.closest('.market-model-item').getAttribute('data-prompt');
                this.showMarketPromptDetail(promptId);
            });
        });
    }

    /**
     * 显示提示词市场详情
     */
    showMarketPromptDetail(promptId) {
        const promptDetailTemplate = document.getElementById('prompt-detail-template');
        const promptMarketEmptyState = document.getElementById('prompt-market-empty-state');

        if (!promptId) {
            // 隐藏所有状态
            promptDetailTemplate.style.display = 'none';
            promptMarketEmptyState.style.display = 'none';
            return;
        }

        const prompt = this.marketPrompts.find(p => p.id === promptId);
        if (!prompt) {
            // 显示空状态
            promptDetailTemplate.style.display = 'none';
            promptMarketEmptyState.style.display = 'block';
            return;
        }

        // 隐藏空状态，显示详情
        promptMarketEmptyState.style.display = 'none';
        promptDetailTemplate.style.display = 'block';

        // 填充提示词信息
        document.getElementById('market-prompt-name').textContent = prompt.name;

        // 填充提示词内容
        const contentContainer = document.getElementById('market-prompt-content');
        contentContainer.innerHTML = `<pre class="prompt-content-text">${prompt.content}</pre>`;

        // 设置添加按钮的数据属性
        this.setupAddButton(prompt);
    }

    /**
     * 设置添加按钮
     */
    setupAddButton(prompt) {
        const addButton = document.getElementById('add-market-prompt-btn');
        if (addButton) {
            addButton.setAttribute('data-prompt-id', prompt.id);

            // 移除旧的事件监听器并添加新的
            const newButton = addButton.cloneNode(true);
            addButton.parentNode.replaceChild(newButton, addButton);

            newButton.addEventListener('click', () => {
                this.addMarketPromptToConfig(prompt.id);
            });
        }
    }

    /**
     * 添加市场提示词到配置
     */
    async addMarketPromptToConfig(promptId) {
        const prompt = this.marketPrompts.find(p => p.id === promptId);
        if (!prompt) {
            log.error('Cannot find prompt with id:', promptId);
            return;
        }

        log.info('Adding market prompt to config:', prompt.name);

        // 检查市场提示词ID是否已存在
        try {
            const exists = await ipcRenderer.invoke('check-prompt-exists', prompt.id);
            if (exists) {
                log.warn('Market prompt with same ID already exists:', prompt.id);
                const message = i18n.t('settings.promptMarket.messages.duplicatePrompt', { name: prompt.name });
                alert(message);
                return;
            }
        } catch (error) {
            log.error('Error checking market prompt existence:', error);
            alert('检查提示词是否存在时出错，请重试');
            return;
        }

        // 直接调用后端API添加提示词，使用市场提示词的ID作为key
        const promptData = {
            name: prompt.name,
            content: prompt.content,
            type: prompt.type || 'system'
        };

        try {
            const promptId = await ipcRenderer.invoke('add-prompt', promptData, prompt.id);
            const success = !!promptId;
            log.info('Add prompt result:', success);

            if (success) {
                log.info('Prompt configuration saved successfully:', prompt.name);
                // 刷新提示词列表
                const prompts = await ipcRenderer.invoke('get-all-prompts');
                window.prompts = prompts;
                const promptService = require('../../promptService');
                promptService.updatePromptList(prompts);

                const message = i18n.t('settings.promptMarket.messages.addSuccess', { name: prompt.name });
                alert(message);
                ipcRenderer.invoke('reset-window-focus');
            } else {
                log.error('Failed to save prompt configuration:', prompt.name);
                alert(i18n.t('settings.promptMarket.messages.addFailed', { name: prompt.name }));
            }
        } catch (error) {
            log.error('Error saving prompt configuration:', error);
            alert(i18n.t('settings.promptMarket.messages.saveError', { name: prompt.name, error: error.message || error }));
        }
    }

    /**
     * 初始化刷新按钮
     */
    initRefreshButton() {
        if (this.elements.refreshButton) {
            this.elements.refreshButton.addEventListener('click', async () => {
                log.info('User clicked refresh prompt market data button');

                this.showLoadingState();
                const success = await this.refreshMarketPrompts();

                if (success) {
                    this.renderMarketPromptList();
                    log.info('Prompt market data refreshed successfully');
                } else {
                    this.showErrorState();
                    log.error('Failed to refresh prompt market data');
                }
            });
        }
    }

    /**
     * 初始化市场数据更新监听器
     */
    initMarketDataListener() {
        ipcRenderer.on('prompt-market-updated', (event, data) => {
            log.info('Received prompt market data update notification:', data);
            if (data && data.prompts && Array.isArray(data.prompts)) {
                this.marketPrompts = data.prompts;
                // 如果当前正在显示提示词市场页面，更新界面
                const isPromptMarketActive = document.querySelector('#prompts .model-menu-item[data-menu="market"]').classList.contains('active');
                if (isPromptMarketActive) {
                    this.renderMarketPromptList();
                    log.info('Prompt market interface updated automatically');
                }
            }
        });
    }

    /**
     * 初始化默认显示
     */
    initDefaultDisplay() {
        const { promptConfigSection, promptMarketSection, promptConfigDetail, promptMarketDetail } = this.elements;
        if (promptConfigSection && promptMarketSection && promptConfigDetail && promptMarketDetail) {
            promptConfigSection.style.display = 'flex';
            promptMarketSection.style.display = 'none';
            promptConfigDetail.style.display = 'flex';
            promptMarketDetail.style.display = 'none';
        }
    }

    /**
     * 显示加载状态
     */
    showLoadingState() {
        if (this.elements.promptMarketLoading) {
            this.elements.promptMarketLoading.style.display = 'block';
        }
        this.hideErrorState();
    }

    /**
     * 隐藏加载状态
     */
    hideLoadingState() {
        if (this.elements.promptMarketLoading) {
            this.elements.promptMarketLoading.style.display = 'none';
        }
    }

    /**
     * 显示错误状态
     */
    showErrorState(message) {
        if (this.elements.promptMarketError) {
            this.elements.promptMarketError.style.display = 'block';
            const errorMessageEl = document.getElementById('prompt-market-error-message');
            if (errorMessageEl) {
                errorMessageEl.textContent = message || i18n.t('settings.promptMarket.messages.loadFailed');
            }
        }
        this.hideLoadingState();
    }

    /**
     * 隐藏错误状态
     */
    hideErrorState() {
        if (this.elements.promptMarketError) {
            this.elements.promptMarketError.style.display = 'none';
        }
    }

    /**
     * 选择第一个提示词
     */
    selectFirstPrompt() {
        const firstPromptItem = document.querySelector('#market-prompts-container .market-model-item');
        if (firstPromptItem && this.marketPrompts.length > 0) {
            // 重置所有项的active状态
            document.querySelectorAll('#market-prompts-container .market-model-item').forEach(item => item.classList.remove('active'));
            // 激活第一个项
            firstPromptItem.classList.add('active');
            // 显示第一个提示词的详情
            this.showMarketPromptDetail(this.marketPrompts[0].id);
        }
    }
}

module.exports = PromptMarketManager; 