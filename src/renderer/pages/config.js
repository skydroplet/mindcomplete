// 检查ipcRenderer是否已在全局作用域中定义
let ipcRenderer;
if (typeof window.ipcRenderer === 'undefined') {
    const electron = require('electron');
    ipcRenderer = electron.ipcRenderer;
    window.ipcRenderer = ipcRenderer;
} else {
    ipcRenderer = window.ipcRenderer;
}

const Logger = require('../../main/logger');
const log = new Logger('config');
const i18n = require('../../locales/i18n');
const themeService = require('../themeService');
const modelService = require('../modelService');
const promptService = require('../promptService');
const mcpServerService = require('../mcpServerService');
const exportService = require('../exportService');
const ImportService = require('../importService');
const mcpRuntimeService = require('../mcpRuntimeService');
const agentService = require('../agentService');

// 创建导入服务实例
const importService = new ImportService();

// 初始化UI文本的函数
function initUIText() {
    // 设置页面标题
    document.title = i18n.t('settings.title');

    // 设置标签栏文本
    document.querySelectorAll('.tab-link').forEach(tab => {
        const tabId = tab.getAttribute('data-tab');
        if (tabId) {
            tab.textContent = i18n.t(`settings.tabs.${tabId}`);
        }
    });

    // 处理所有带有data-i18n属性的元素
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = i18n.t(key);
            // 如果是按钮，也更新title属性
            if (el.tagName === 'BUTTON' && el.title) {
                el.title = i18n.t(key);
            }
        }
    });

    // 设置模型配置相关文本
    document.querySelectorAll('label[for]').forEach(label => {
        const forId = label.getAttribute('for');
        // 如果已经通过data-i18n处理过，则跳过
        if (forId && !label.hasAttribute('data-i18n')) {
            const key = `settings.labels.${forId}`;
            label.textContent = i18n.t(key);
        }
    });

    // 设置按钮文本
    document.querySelectorAll('button').forEach(button => {
        const id = button.id;
        // 如果已经通过data-i18n处理过，则跳过
        if (id && !button.hasAttribute('data-i18n')) {
            const key = `settings.buttons.${id}`;
            // 只有当翻译存在时才设置文本
            if (i18n.locales[i18n.currentLocale] && i18n.t(key) !== key) {
                button.textContent = i18n.t(key);
            }
        } else if (button.classList.contains('add-env-btn') && !button.hasAttribute('data-i18n')) {
            button.textContent = i18n.t('settings.buttons.add-env-btn');
        } else if (button.classList.contains('add-arg-btn') && !button.hasAttribute('data-i18n')) {
            button.textContent = i18n.t('settings.buttons.add-arg-btn');
        }
    });

    // 设置选项提示和占位符
    document.querySelectorAll('input[placeholder]').forEach(input => {
        const id = input.id;
        if (id) {
            const key = `settings.placeholders.${id}`;
            // 只有当翻译存在时才设置占位符
            if (i18n.locales[i18n.currentLocale] && i18n.t(key) !== key) {
                input.placeholder = i18n.t(key);
            }
        }
    });

    // 设置添加按钮的文本
    const addModelBtn = document.querySelector('#modelList option[value="add_new"]');
    if (addModelBtn) {
        addModelBtn.textContent = i18n.t('settings.buttons.addModelOption');
    }

    // 设置特定按钮文本
    const buttonMappings = {
        '#addModelBtn': 'settings.buttons.addModel',
        '#saveBtn': 'settings.buttons.saveBtn',
        '#cancelBtn': 'settings.buttons.cancelBtn',
        '#deleteModelBtn': 'settings.buttons.deleteModelBtn',
        '#addPromptBtn': 'settings.buttons.addPromptBtn',
        '#savePromptBtn': 'settings.buttons.savePromptBtn',
        '#cancelPromptBtn': 'settings.buttons.cancelPromptBtn',
        '#deletePromptBtn': 'settings.buttons.deletePromptBtn',
        '#addMcpServerBtn': 'settings.buttons.addMcpServerBtn',
        '#saveMcpBtn': 'settings.buttons.saveMcpBtn',
        '#cancelMcpBtn': 'settings.buttons.cancelMcpBtn',
        '#deleteMcpServerBtn': 'settings.buttons.deleteMcpServerBtn',
        '#connect-mcp-button': 'settings.buttons.connect-mcp-button',
        '#add-env-btn': 'settings.buttons.add-env-btn',
        '#add-arg-btn': 'settings.buttons.add-arg-btn'
    };

    for (const [selector, i18nKey] of Object.entries(buttonMappings)) {
        const button = document.querySelector(selector);
        if (button) {
            button.textContent = i18n.t(i18nKey);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        log.info('配置页面初始化...');
        window.models = {};
        window.mcpConfig = {};
        window.prompts = {};
        window.agents = {};

        // 获取当前语言设置并应用
        try {
            const language = await ipcRenderer.invoke('get-language');
            if (language) {
                i18n.loadFromConfig(language);
                log.info('从配置加载语言设置:', language);
            }
        } catch (error) {
            log.error('获取语言设置失败:', error.message);
        }

        // 初始化UI文本
        initUIText();

        // 选项卡切换功能
        document.querySelectorAll('.tab-link').forEach(link => {
            link.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
                e.target.classList.add('active');
                const target = e.target.dataset.target;

                // 隐藏工具列表，除非正在切换到MCP服务选项卡并且已经有工具数据
                if (target !== 'mcp-servers') {
                    mcpServerService.hideToolsList();
                }

                // 切换内容区域显示
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.style.display = content.id === target ? 'flex' : 'none';
                });
            });
        });

        // 获取模型列表并初始化
        const models = await ipcRenderer.invoke('get-models');
        window.models = models;
        modelService.models = models;  // 确保modelService实例也获取到models
        modelService.updateModelList(models);
        modelService.updateDeleteButton();

        // 初始化模型相关事件监听器 - 现在是异步的
        await modelService.initModelEventListeners();

        // 初始化全局变量
        window.currentModelId = null;
        window.currentPromptId = null;
        window.currentAgentId = null;

        // 初始化MCP设置
        await mcpServerService.initMcpSettings();

        // 同步MCP全局变量与服务
        window.mcpConfig = mcpServerService.getMcpConfig();

        // 初始化提示词相关事件
        promptService.initPromptEventListeners();

        // 加载提示词列表
        try {
            const prompts = await ipcRenderer.invoke('get-all-prompts');
            log.info('提示词列表:', prompts);
            window.prompts = prompts;
            promptService.updatePromptList(prompts);
        } catch (error) {
            log.error('加载提示词列表失败:', error.message);
        }

        // 初始化Agent配置相关事件
        await agentService.initAgentEventListeners();

        // 加载Agent列表
        try {
            const agents = await ipcRenderer.invoke('get-agents');
            log.info('Agent列表:', agents);
            window.agents = agents;
            agentService.updateAgentList(agents);

            // 更新Agent服务中的选项数据
            agentService.updateModelOptions(models);
            agentService.updatePromptOptions(prompts);

            // 获取MCP服务列表并更新Agent服务选项
            const mcpServers = mcpServerService.mcpServers || {};
            agentService.updateMcpOptions(mcpServers);
        } catch (error) {
            log.error('加载Agent列表失败:', error.message);
        }

        // 初始化主题切换 - 使用themeService
        themeService.initThemeToggle();
        // 初始化主题监听器
        themeService.setupThemeListeners();

        // 初始化导出配置功能
        exportService.initExportConfig();

        // 初始化导入配置功能
        importService.initImportConfig();

        // 添加链接点击事件委托，使链接在外部浏览器中打开
        document.body.addEventListener('click', (event) => {
            // 检查点击的是否是链接
            if (event.target.tagName === 'A' && event.target.href) {
                // 阻止默认行为（在当前窗口打开链接）
                event.preventDefault();

                // 使用主进程的open-external-url方法在外部浏览器中打开链接
                ipcRenderer.invoke('open-external-url', event.target.href)
                    .catch(error => {
                        console.error('打开外部链接失败:', error.message);
                    });
            }
        });

        // ========== MCP服务标签页三栏切换逻辑 ========== 
        const mcpMenuItems = document.querySelectorAll('.mcp-menu-item');
        const mcpListPanel = document.querySelector('.mcp-list-panel');
        const mcpDetailSection = document.getElementById('mcp-detail-section');
        const mcpEnvsSection = document.querySelector('.mcp-envs-section');
        const runtimeInfoLoading = document.getElementById('runtime-info-loading');
        const runtimeInfoList = document.getElementById('runtime-info-list');
        // 移除原有的loadRuntimeInfo函数，直接调用mcpRuntimeService.loadRuntimeInfo
        mcpMenuItems.forEach(item => {
            item.addEventListener('click', function () {
                mcpMenuItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                const menu = this.getAttribute('data-menu');
                if (menu === 'servers') {
                    mcpListPanel.style.display = '';
                    mcpDetailSection.style.display = '';
                    mcpEnvsSection.style.display = 'none';
                } else if (menu === 'envs') {
                    mcpListPanel.style.display = 'none';
                    mcpDetailSection.style.display = 'none';
                    mcpEnvsSection.style.display = 'flex';
                    mcpRuntimeService.loadRuntimeInfo(runtimeInfoLoading, runtimeInfoList);
                }
            });
        });
        // 默认显示MCP服务
        if (mcpListPanel && mcpDetailSection && mcpEnvsSection) {
            mcpListPanel.style.display = '';
            mcpDetailSection.style.display = '';
            mcpEnvsSection.style.display = 'none';
        }

        // ========== 模型标签页三栏切换逻辑 ========== 
        const modelMenuItems = document.querySelectorAll('.model-menu-item');
        const modelConfigSection = document.getElementById('model-config-section');
        const modelMarketSection = document.querySelector('.model-market-section');
        const modelConfigDetail = document.getElementById('model-config-detail');
        const modelMarketDetail = document.querySelector('.model-market-detail');

        // 模型市场数据存储
        let marketModels = [];

        // 从主进程获取模型市场数据
        async function fetchMarketModels() {
            try {
                log.info('从主进程获取模型市场数据');
                const response = await ipcRenderer.invoke('get-market-models');
                log.info('获取到模型市场数据:', response);

                if (response && response.models && Array.isArray(response.models)) {
                    marketModels = response.models;
                    log.info(i18n.t('settings.modelMarket.messages.logFetchSuccess', { count: marketModels.length }));
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

        // 手动刷新模型市场数据
        async function refreshMarketModels() {
            try {
                log.info('手动刷新模型市场数据');
                const response = await ipcRenderer.invoke('refresh-market-models');
                log.info('刷新模型市场数据结果:', response);

                if (response && response.success && response.models && Array.isArray(response.models)) {
                    marketModels = response.models;
                    log.info(i18n.t('settings.modelMarket.messages.logFetchSuccess', { count: marketModels.length }));
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

        // 获取收费模式的样式类名和文本
        function getPricingInfo(pricingMode) {
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

        // 渲染模型市场列表
        function renderMarketModelList() {
            const marketModelsContainer = document.getElementById('market-models-container');
            const marketLoading = document.getElementById('market-loading');
            const marketError = document.getElementById('market-error');

            if (!marketModelsContainer) return;

            // 隐藏加载和错误状态
            marketLoading.style.display = 'none';
            marketError.style.display = 'none';

            if (marketModels.length === 0) {
                marketError.style.display = 'block';
                document.getElementById('market-error-message').textContent = i18n.t('settings.modelMarket.messages.noModelData');
                return;
            }

            marketModelsContainer.innerHTML = marketModels.map((model, index) => {
                const pricingInfo = getPricingInfo(model.pricingMode);
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
            initMarketModelItems();

            // 默认显示第一个模型的详情
            if (marketModels.length > 0) {
                showMarketModelDetail(marketModels[0].id);
            }
        }

        modelMenuItems.forEach(item => {
            item.addEventListener('click', async function () {
                modelMenuItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                const menu = this.getAttribute('data-menu');

                if (menu === 'config') {
                    // 显示模型配置
                    modelConfigSection.style.display = 'flex';
                    modelMarketSection.style.display = 'none';
                    modelConfigDetail.style.display = 'flex';
                    modelMarketDetail.style.display = 'none';

                    // 确保模型配置页面有数据显示
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
                } else if (menu === 'market') {
                    // 显示模型市场
                    modelConfigSection.style.display = 'none';
                    modelMarketSection.style.display = 'flex';
                    modelConfigDetail.style.display = 'none';
                    modelMarketDetail.style.display = 'flex';

                    // 如果还没有加载过模型数据，则获取
                    if (marketModels.length === 0) {
                        const marketLoading = document.getElementById('market-loading');
                        const marketError = document.getElementById('market-error');

                        // 显示加载状态
                        if (marketLoading) {
                            marketLoading.style.display = 'block';
                        }
                        if (marketError) {
                            marketError.style.display = 'none';
                        }

                        const success = await fetchMarketModels();
                        if (success) {
                            renderMarketModelList();
                        } else {
                            if (marketLoading) {
                                marketLoading.style.display = 'none';
                            }
                            if (marketError) {
                                marketError.style.display = 'block';
                                document.getElementById('market-error-message').textContent = i18n.t('settings.modelMarket.messages.loadFailed');
                            }
                        }
                    } else {
                        // 如果已经有数据，确保第一个模型被选中并显示详情
                        const firstModelItem = document.querySelector('.market-model-item');
                        if (firstModelItem && marketModels.length > 0) {
                            // 重置所有项的active状态
                            document.querySelectorAll('.market-model-item').forEach(item => item.classList.remove('active'));
                            // 激活第一个项
                            firstModelItem.classList.add('active');
                            // 显示第一个模型的详情
                            showMarketModelDetail(marketModels[0].id);
                        }
                    }
                }
            });
        });

        // 模型市场项点击事件
        function initMarketModelItems() {
            const marketModelItems = document.querySelectorAll('.market-model-item');
            marketModelItems.forEach(item => {
                item.addEventListener('click', function () {
                    marketModelItems.forEach(i => i.classList.remove('active'));
                    this.classList.add('active');
                    const modelId = this.getAttribute('data-model');
                    showMarketModelDetail(modelId);
                });
            });
        }

        // 显示模型市场详情
        function showMarketModelDetail(modelId) {
            const marketDetailTemplate = document.getElementById('market-detail-template');
            const marketEmptyState = document.getElementById('market-empty-state');

            if (!modelId) {
                // 隐藏所有状态
                marketDetailTemplate.style.display = 'none';
                marketEmptyState.style.display = 'none';
                return;
            }

            const model = marketModels.find(m => m.id === modelId);
            if (!model) {
                // 显示空状态
                marketDetailTemplate.style.display = 'none';
                marketEmptyState.style.display = 'block';
                return;
            }

            // 隐藏空状态，显示详情
            marketEmptyState.style.display = 'none';
            marketDetailTemplate.style.display = 'block';

            // 填充模型信息
            document.getElementById('market-model-name').textContent = model.name;
            document.getElementById('market-model-provider').textContent = model.provider;
            document.getElementById('market-model-description').textContent = model.description;
            document.getElementById('market-context-window').textContent = model.contextWindow + 'K';
            document.getElementById('market-model-type').textContent = model.modelType;
            document.getElementById('market-api-url').textContent = model.apiUrl;

            // 设置收费模式显示
            const pricingModeElement = document.getElementById('market-pricing-mode');
            if (pricingModeElement) {
                const pricingInfo = getPricingInfo(model.pricingMode);
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
            featuresContainer.innerHTML = model.features.map(feature =>
                `<span class="market-feature-tag">${feature}</span>`
            ).join('');

            // 设置常用链接
            const mainUrlElement = document.getElementById('market-main-url');
            if (model.mainUrl) {
                mainUrlElement.innerHTML = `<a href="${model.mainUrl}" target="_blank" class="market-link">${model.mainUrl}</a>`;
            } else {
                mainUrlElement.textContent = i18n.t('settings.modelMarket.messages.noData');
            }

            const inviteUrlElement = document.getElementById('market-invite-url');
            if (model.registerUrl) {
                inviteUrlElement.innerHTML = `<a href="${model.registerUrl}" target="_blank" class="market-link">${model.registerUrl}</a>`;
            } else {
                inviteUrlElement.textContent = i18n.t('settings.modelMarket.messages.noData');
            }

            const apikeyUrlElement = document.getElementById('market-apikey-url');
            if (model.apiKeyUrl) {
                apikeyUrlElement.innerHTML = `<a href="${model.apiKeyUrl}" target="_blank" class="market-link">${model.apiKeyUrl}</a>`;
            } else {
                apikeyUrlElement.textContent = i18n.t('settings.modelMarket.messages.noData');
            }

            // 设置添加按钮的数据属性
            const addButton = document.getElementById('add-market-model-btn');
            if (addButton) {
                addButton.setAttribute('data-model-id', model.id);

                // 移除旧的事件监听器并添加新的
                const newButton = addButton.cloneNode(true);
                addButton.parentNode.replaceChild(newButton, addButton);

                newButton.addEventListener('click', function () {
                    addMarketModelToConfig(model.id);
                });
            }
        }

        // 添加市场模型到配置
        function addMarketModelToConfig(modelId) {
            const model = marketModels.find(m => m.id === modelId);
            if (!model) {
                return;
            }

            // 不再切换到模型配置视图，保持在模型市场页面
            // 填充表单数据到后台（不显示在UI上）
            document.getElementById('modelName').value = model.name;
            document.getElementById('modelType').value = model.modelType;
            document.getElementById('apiUrl').value = model.apiUrl;
            document.getElementById('apiKey').value = ''; // 需要用户自己填写
            document.getElementById('contextWindowSize').value = model.contextWindow;

            // 更新按钮状态
            modelService.updateDeleteButton();

            // 自动触发保存操作
            modelService.saveCurrentModel().then(success => {
                if (success) {
                    log.info('模型配置已自动保存成功:', model.name);

                    // 构建提示信息
                    let message = i18n.t('settings.modelMarket.messages.addSuccess', { name: model.name }) + '\n\n';
                    message += i18n.t('settings.modelMarket.messages.setupInstructions') + '\n\n';

                    if (model.registerUrl) {
                        message += i18n.t('settings.modelMarket.messages.registerLink', { url: model.registerUrl }) + '\n';
                    }
                    if (model.apiKeyUrl) {
                        message += i18n.t('settings.modelMarket.messages.apiKeyLink', { url: model.apiKeyUrl });
                    }

                    alert(message);
                    ipcRenderer.invoke('reset-window-focus');
                } else {
                    log.error('模型配置保存失败:', model.name);
                    alert(i18n.t('settings.modelMarket.messages.addFailed', { name: model.name }));
                }
            }).catch(error => {
                log.error('保存模型配置时出错:', error.message);
                alert(i18n.t('settings.modelMarket.messages.saveError', { name: model.name, error: error.message }));
            });
        }

        // 默认显示模型配置
        if (modelConfigSection && modelMarketSection && modelConfigDetail && modelMarketDetail) {
            modelConfigSection.style.display = 'flex';
            modelMarketSection.style.display = 'none';
            modelConfigDetail.style.display = 'flex';
            modelMarketDetail.style.display = 'none';
        }

        // 添加刷新按钮事件监听器
        const refreshMarketBtn = document.getElementById('refresh-market-btn');
        if (refreshMarketBtn) {
            refreshMarketBtn.addEventListener('click', async () => {
                log.info('用户点击刷新模型市场数据按钮');
                const marketLoading = document.getElementById('market-loading');
                const marketError = document.getElementById('market-error');

                // 显示加载状态
                if (marketLoading) {
                    marketLoading.style.display = 'block';
                }
                if (marketError) {
                    marketError.style.display = 'none';
                }

                // 刷新数据
                const success = await refreshMarketModels();

                // 隐藏加载状态
                if (marketLoading) {
                    marketLoading.style.display = 'none';
                }

                if (success) {
                    renderMarketModelList();
                    log.info('模型市场数据刷新成功');

                    // 刷新模型市场数据成功后，同时更新模型配置数据
                    // 确保模型配置页面的数据也是最新的
                    try {
                        const latestModels = await ipcRenderer.invoke('get-models');
                        if (latestModels) {
                            window.models = latestModels;
                            modelService.models = latestModels;
                            modelService.updateModelList(latestModels);
                            log.info('模型配置数据已同步更新');
                        }
                    } catch (error) {
                        log.error('同步更新模型配置数据失败:', error.message);
                    }
                } else {
                    if (marketError) {
                        marketError.style.display = 'block';
                        document.getElementById('market-error-message').textContent = i18n.t('settings.modelMarket.messages.loadFailed');
                    }
                    log.error('模型市场数据刷新失败');
                }
            });
        }

        // 监听主进程发送的模型市场数据更新事件
        ipcRenderer.on('model-market-updated', async (event, data) => {
            log.info('收到模型市场数据更新通知:', data);
            if (data && data.models && Array.isArray(data.models)) {
                marketModels = data.models;
                // 如果当前正在显示模型市场页面，更新界面
                const isMarketActive = document.querySelector('.model-menu-item[data-menu="market"]').classList.contains('active');
                if (isMarketActive) {
                    renderMarketModelList();
                    log.info('模型市场界面已自动更新');
                }

                // 同时更新模型配置数据，确保数据同步
                try {
                    const latestModels = await ipcRenderer.invoke('get-models');
                    if (latestModels) {
                        window.models = latestModels;
                        modelService.models = latestModels;
                        modelService.updateModelList(latestModels);
                        log.info('收到模型市场更新通知后，模型配置数据已同步更新');
                    }
                } catch (error) {
                    log.error('同步更新模型配置数据失败:', error.message);
                }
            }
        });
    } catch (error) {
        log.error('配置页面初始化失败:', error.message);
        alert(`初始化配置页面失败: ${error.message}`);
    }
});

// 监听配置更新事件
ipcRenderer.on('config-updated', (event, data) => {
    log.info('收到配置更新:', data);
    if (data.models) {
        window.models = data.models;
        modelService.updateModelList(data.models.models || {});
    }
    if (data.mcpConfig) {
        mcpServerService.setMcpConfig(data.mcpConfig);
        mcpServerService.updateMcpServerList();
        window.mcpConfig = mcpServerService.getMcpConfig();
    } else if (data.mcpServers) {
        // 兼容旧版数据格式
        const mcpConfig = {
            servers: data.mcpServers,
            activeMcps: []
        };
        mcpServerService.setMcpConfig(mcpConfig);
        mcpServerService.updateMcpServerList();
        window.mcpConfig = mcpServerService.getMcpConfig();
    }
});

// 监听标签页切换事件
ipcRenderer.on('switch-tab', (event, tabName) => {
    log.info('收到切换标签页请求:', tabName);

    // 查找并点击对应的标签页按钮
    const tabLinks = document.querySelectorAll('.tab-link');
    for (const link of tabLinks) {
        if (link.dataset.target === tabName) {
            link.click();
            break;
        }
    }
});

// 监听语言更新事件
ipcRenderer.on('locale-updated', async () => {
    // 获取最新的语言设置并同步到渲染进程的i18n实例
    try {
        const language = await ipcRenderer.invoke('get-language');
        if (language) {
            i18n.setLocale(language);
            log.info('配置窗口语言切换到:', language);
        }
    } catch (error) {
        log.error('获取语言设置失败:', error.message);
    }

    log.info('收到语言更新事件，重新初始化UI文本');
    initUIText();
});