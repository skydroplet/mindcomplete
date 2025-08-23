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
const PromptMarketManager = require('../config/market/promptMarket');
const ModelMarketManager = require('../config/market/modelMarket');

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

        // 初始化提示词相关事件监听器
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

        // 初始化提示词市场管理器
        const promptMarketManager = new PromptMarketManager();
        promptMarketManager.init();

        // 初始化模型市场管理器
        const modelMarketManager = new ModelMarketManager();
        modelMarketManager.init();

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



















        // 监听主进程发送的提示词市场数据更新事件
        ipcRenderer.on('prompt-market-updated', async (event, data) => {
            log.info('Received prompt market data update notification:', data);
            if (data && data.prompts && Array.isArray(data.prompts)) {
                // This event is for prompts, not models.
                // If you need to update the model market list, you'd need to re-fetch it.
                // For now, we'll just log the update.
                log.info('Prompt market data updated:', data.prompts.length, 'prompts');
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