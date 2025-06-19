/**
 * renderer.js
 * 渲染进程主模块
 *
 * 该模块是Electron应用程序的渲染进程入口点，负责：
 * - 初始化用户界面
 * - 处理用户交互
 * - 管理应用程序状态
 * - 与主进程通信
 * - 协调聊天服务和会话服务
 *
 * 聊天功能和会话管理已分离到独立模块中，提高了代码的模块化和可维护性
 */

const { ipcRenderer } = require('electron');
const Logger = require('../../main/logger');
const log = new Logger('renderer');
const i18n = require('../../locales/i18n');
const hljs = require('highlight.js');

// 导入服务模块
const sidebarSession = require('../sidebarSession');
const sidebarService = require('../sidebarService');
const agentService = require('../agentService');
const modelService = require('../modelService');
const promptService = require('../promptService');
const mcpServerService = require('../mcpServerService');
const themeService = require('../themeService');
const aboutService = require('../aboutService');
const updateService = require('../updateService');
const tabManager = require('../tabManager');

// 导入 UI 初始化模块
const uiInit = require('../ui-init');
const ChatSessionService = require('../chatSession');

const messageInput = document.getElementById('message-input');
const statusElement = document.getElementById('status');
const languageSelect = document.getElementById('language-select');


/**
 * 初始化用户界面
 *
 * 根据当前语言设置，初始化界面上的文本内容，包括：
 * - 输入框占位符
 * - 状态栏文本
 */
function initUI() {
    // 获取当前语言，默认为中文
    const currentLang = i18n.getLocale() || 'zh-CN';
    log.info(i18n.t('logs.currentLanguage'), currentLang);

    // 设置界面元素的文本内容
    messageInput.placeholder = i18n.t('ui.inputPlaceholder');
    statusElement.textContent = i18n.t('ui.status.ready');
}

/**
 * 应用程序初始化函数
 *
 * 该函数是应用程序启动时的主要入口点，负责初始化所有组件和加载必要的数据
 * 初始化过程按照特定顺序执行，以确保用户界面快速响应并提供良好的用户体验
 */
async function init() {
    // 首先初始化主题切换 - 提前到其他初始化前，以避免主题闪烁
    themeService.initThemeToggle();

    // 设置当前语言
    if (languageSelect) {
        languageSelect.value = i18n.getLocale();
    }

    // 初始化界面文本
    initUI();

    // 初始化侧边栏状态 - 提前到模型加载前，使界面更快可用
    sidebarService.loadSidebarState();

    // 初始化侧边栏调整功能
    sidebarService.setupSidebarResizing();

    // 初始化侧边栏上下区域拖动
    sidebarService.initSidebarVerticalResize();

    // 确保下拉选择框样式一致性
    ensureConsistentDropdownStyles();

    // 并行加载数据以提高性能
    const loadPromise = Promise.all([
        // 加载模型列表
        (async () => {
            await modelService.loadModels();
        })(),

        // 加载提示词列表
        (async () => {
            await promptService.loadPrompts(statusElement);
        })(),

        // 初始化标签管理和会话
        (async () => {
            // 设置rename会话回调
            sidebarSession.setRenameSessionCallback((sessionId, newName) => {
                // 通知标签管理器更新标签名称
                tabManager.updateSessionName(sessionId, newName);
            });

            // 设置删除会话回调
            sidebarSession.setDeleteSessionCallback((sessionId) => {
                // 通知标签管理器处理会话删除
                tabManager.handleSessionDeleted(sessionId);
            });

            // 设置加载会话的回调函数
            sidebarSession.setLoadSessionCallback((sessionId) => {
                log.info(i18n.t('logs.loadSession', { sessionId }));
                // 在标签中打开会话
                tabManager.openSessionInTab(sessionId);
            });

            // 获取会话列表
            const sessions = await sidebarSession.loadSessions();

            // 初始化标签管理器
            let tabManagerInitialized = false;
            let initialSession = null;

            // 尝试恢复标签页状态
            if (sessions.length > 0) {
                // 先创建一个临时的初始会话实例用于初始化标签管理器
                initialSession = new ChatSessionService(sessions[0].id);
                await initialSession.loadSession();

                // 初始化标签管理器
                await tabManager.initTabManager(initialSession);

                // 尝试恢复标签页状态
                const restored = await tabManager.restoreTabState();

                if (restored) {
                    log.info('成功恢复标签页状态');
                    tabManagerInitialized = true;
                } else {
                    log.info('没有找到保存的标签页状态，使用默认初始化');
                    // 如果恢复失败，清除临时标签并重新初始化
                    tabManager.clearAllTabs();
                    tabManagerInitialized = false;
                }
            }

            // 如果没有恢复成功，使用默认初始化
            if (!tabManagerInitialized) {
                if (sessions.length > 0) {
                    // 创建初始会话实例
                    if (!initialSession) {
                        initialSession = new ChatSessionService(sessions[0].id);
                        await initialSession.loadSession();
                    }
                } else {
                    // 如果没有会话，创建一个新的
                    initialSession = new ChatSessionService();
                    await initialSession.createNewSession();
                }

                // 初始化标签管理器
                await tabManager.initTabManager(initialSession);
            }

            // 移除引用，让标签管理器全权管理会话
            initialSession = null;
        })()
    ]);

    // 等待所有并行任务完成
    await loadPromise;

    // 设置事件监听器
    setupEventListeners();

    // 更新状态栏，表示应用程序已准备就绪
    statusElement.textContent = i18n.t('ui.status.ready');

    // 设置主题相关监听器
    themeService.setupThemeListeners();
}

// 打开带有特定标签页的设置窗口
function openSettingsWindowWithTab(tabName) {
    try {
        ipcRenderer.invoke('open-config-window-with-tab', tabName);
    } catch (error) {
        log.error('打开设置窗口失败:', error.message);
        statusElement.textContent = i18n.t('errors.openSettingsWindowFailed', { error: error.message });
    }
}

// 设置所有事件监听器
function setupEventListeners() {
    // 打印调试信息
    log.info('Setting up event listeners');

    // 为模型和提示词下拉列表添加相关功能
    function enhanceSelectElement(selectElement) {
        if (!selectElement) return;

        // 为select添加属性，使其向上展开
        selectElement.setAttribute('size', '1'); // 确保初始状态只显示一行

        // 为select元素添加点击事件，在展开时计算最大高度
        selectElement.addEventListener('mousedown', (event) => {
            // 计算选项数量
            const optionsCount = selectElement.options.length;
            // 如果选项数量超过10个，则限制为10个
            if (optionsCount > 10) {
                // 强制设置下拉菜单的位置和最大高度
                // 创建样式元素
                const styleId = `${selectElement.id}-style`;
                let styleEl = document.getElementById(styleId);

                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = styleId;
                    document.head.appendChild(styleEl);
                }

                // 添加自定义样式，使下拉菜单向上展开且最多显示10个选项
                // 并添加统一的滚动条样式
                styleEl.textContent = `
                    #${selectElement.id} option {
                        padding: 8px 12px;
                    }
                    #${selectElement.id}:focus option {
                        max-height: calc(10 * 36px);
                        overflow-y: auto;
                    }
                    #${selectElement.id}:focus::-webkit-scrollbar {
                        width: 6px;
                        height: 6px;
                    }
                    #${selectElement.id}:focus::-webkit-scrollbar-track {
                        background: var(--scrollbar-track, transparent);
                    }
                    #${selectElement.id}:focus::-webkit-scrollbar-thumb {
                        background: var(--scrollbar-thumb, rgba(128, 128, 128, 0.5));
                        border-radius: 3px;
                    }
                    #${selectElement.id}:focus::-webkit-scrollbar-thumb:hover {
                        background: var(--scrollbar-thumb-hover, rgba(128, 128, 128, 0.7));
                    }
                    #${selectElement.id}:focus::-webkit-scrollbar-corner {
                        background: var(--scrollbar-track, transparent);
                    }
                `;
            }
        });

        // 添加滚轮事件支持
        selectElement.addEventListener('wheel', (event) => {
            // 只在下拉菜单打开时处理滚轮事件
            if (selectElement.multiple || selectElement.size > 1) {
                event.preventDefault();

                // 根据滚轮方向改变选中项
                const delta = event.deltaY > 0 ? 1 : -1;
                const currentIndex = selectElement.selectedIndex;
                const newIndex = Math.max(0, Math.min(currentIndex + delta, selectElement.options.length - 1));

                if (newIndex !== currentIndex) {
                    selectElement.selectedIndex = newIndex;
                    // 触发change事件以保持一致性
                    const changeEvent = new Event('change');
                    selectElement.dispatchEvent(changeEvent);
                }
            }
        });
    }

    // 增强模型和提示词下拉列表
    enhanceSelectElement(modelService.getModelSelect());
    enhanceSelectElement(promptService.getPromptSelect());

    sidebarService.setupEventListeners();

    // 添加上下文菜单功能
    // 为整个应用程序添加自定义上下文菜单
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // 阻止默认的上下文菜单

        // 创建自定义菜单元素
        const contextMenu = document.createElement('div');
        contextMenu.className = 'context-menu';

        // 获取选中的文本
        const selectedText = window.getSelection().toString();
        const isInputFocused = document.activeElement === messageInput;

        // 设置菜单位置
        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.style.left = `${e.clientX}px`;

        // 创建全选按钮
        const selectAllItem = document.createElement('div');
        selectAllItem.className = 'context-menu-item';
        selectAllItem.textContent = '全选';
        selectAllItem.addEventListener('click', () => {
            if (isInputFocused) {
                messageInput.select();
            } else if (e.target.textContent) {
                // 为其他元素创建全选功能
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(e.target);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            document.body.removeChild(contextMenu);
        });

        // 创建复制按钮
        const copyItem = document.createElement('div');
        copyItem.className = 'context-menu-item';
        copyItem.textContent = '复制';
        copyItem.style.display = selectedText ? 'block' : 'none'; // 只有选择文本时才显示
        copyItem.addEventListener('click', () => {
            if (selectedText) {
                navigator.clipboard.writeText(selectedText)
                    .then(() => {
                        log.info('Text copied to clipboard');
                    })
                    .catch(err => {
                        log.error('Error copying text: ', err.message);
                    });
            }
            document.body.removeChild(contextMenu);
        });

        // 创建剪切按钮（仅在输入框中显示）
        const cutItem = document.createElement('div');
        cutItem.className = 'context-menu-item';
        cutItem.textContent = '剪切';
        cutItem.style.display = isInputFocused && selectedText ? 'block' : 'none';
        cutItem.addEventListener('click', () => {
            if (isInputFocused && selectedText) {
                navigator.clipboard.writeText(selectedText)
                    .then(() => {
                        // 获取选择的开始和结束位置
                        const start = messageInput.selectionStart;
                        const end = messageInput.selectionEnd;

                        // 删除选中的文本
                        messageInput.value = messageInput.value.substring(0, start) +
                            messageInput.value.substring(end);

                        // 将光标位置设置到剪切点
                        messageInput.selectionStart = start;
                        messageInput.selectionEnd = start;
                        messageInput.focus();

                        log.info('Text cut to clipboard');
                    })
                    .catch(err => {
                        log.error('Error cutting text: ', err.message);
                    });
            }
            document.body.removeChild(contextMenu);
        });

        // 创建粘贴按钮
        const pasteItem = document.createElement('div');
        pasteItem.className = 'context-menu-item';
        pasteItem.textContent = '粘贴';
        pasteItem.style.display = isInputFocused ? 'block' : 'none'; // 只在输入框中显示
        pasteItem.addEventListener('click', () => {
            if (isInputFocused) {
                navigator.clipboard.readText()
                    .then(text => {
                        // 获取当前光标位置
                        const start = messageInput.selectionStart;
                        const end = messageInput.selectionEnd;

                        // 在光标位置插入文本，如果有选中文本则替换它
                        messageInput.value = messageInput.value.substring(0, start) +
                            text +
                            messageInput.value.substring(end);

                        // 将光标位置设置到插入文本的末尾
                        const newCursorPos = start + text.length;
                        messageInput.selectionStart = newCursorPos;
                        messageInput.selectionEnd = newCursorPos;
                        messageInput.focus();

                        log.info('Text pasted from clipboard');
                    })
                    .catch(err => {
                        log.error('Error pasting text: ', err.message);
                    });
            }
            document.body.removeChild(contextMenu);
        });

        // 将按钮添加到菜单
        contextMenu.appendChild(selectAllItem);
        contextMenu.appendChild(copyItem);
        contextMenu.appendChild(cutItem);
        contextMenu.appendChild(pasteItem);

        // 添加菜单到页面
        document.body.appendChild(contextMenu);

        // 点击其他地方关闭菜单
        document.addEventListener('click', function closeMenu() {
            if (document.body.contains(contextMenu)) {
                document.body.removeChild(contextMenu);
            }
            document.removeEventListener('click', closeMenu);
        });
    });

    // 设置模型选择监听器
    modelService.setupModelSelectListeners(openSettingsWindowWithTab);

    // 设置提示词选择监听器
    promptService.setupPromptSelectListeners(statusElement, openSettingsWindowWithTab);

    // MCP下拉菜单现在由tabManager管理，无需单独设置监听器

    // 重命名对话框事件监听
    const renameCancelBtn = document.getElementById('rename-cancel-btn');
    const renameConfirmBtn = document.getElementById('rename-confirm-btn');
    const newNameInput = document.getElementById('new-name-input');

    renameCancelBtn.addEventListener('click', () => sidebarSession.closeRenameDialog());
    renameConfirmBtn.addEventListener('click', () => sidebarSession.confirmRenameSession());

    // 在输入框按下回车键也可以确认
    newNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sidebarSession.confirmRenameSession();
        }
    });

    // 初始化侧边栏拖动功能
    sidebarService.initSidebarResize();

    // 添加语言切换事件处理
    if (languageSelect) {
        languageSelect.addEventListener('change', async (e) => {
            const locale = e.target.value;
            try {
                const result = await ipcRenderer.invoke('set-locale', locale);
                if (result) {
                    // 更新界面文本
                    initUI();
                    statusElement.textContent = i18n.t('ui.status.ready');
                }
            } catch (error) {
                log.error('切换语言失败:', error.message);
                statusElement.textContent = i18n.t('errors.languageChangeFailed', { error: error.message });
            }
        });
    }

    // 设置默认标签的对话模式切换
    const conversationModeBtn = document.getElementById('conversation-mode-btn');

    if (conversationModeBtn) {
        // 设置点击事件监听器
        conversationModeBtn.addEventListener('click', async () => {
            // 获取当前按钮文本以确定当前模式
            const currentMode = conversationModeBtn.textContent === '单次对话' ? 'single-turn' : 'multi-turn';
            // 切换到另一个模式
            const newMode = currentMode === 'single-turn' ? 'multi-turn' : 'single-turn';

            // 更新UI状态
            conversationModeBtn.textContent = newMode === 'single-turn' ? '单次对话' : '多轮对话';

            // 获取当前会话
            const activeSession = tabManager.getActiveSession();
            if (activeSession && activeSession.data && activeSession.data.id) {
                // 保存设置到后端
                await ipcRenderer.invoke('select-session-conversation-mode', activeSession.data.id, newMode);
                log.info(`设置会话 ${activeSession.data.id} 的对话模式为: ${newMode}`);
            }
        });
    }
}

// 打开设置窗口
function openSettingsWindow() {
    log.info('Opening settings window');
    statusElement.textContent = i18n.t('errors.openingSettingsWindow');

    // 调用后端方法打开设置窗口
    ipcRenderer.invoke('open-config-window')
        .then(() => {
            statusElement.textContent = i18n.t('ui.status.ready');
        })
        .catch(error => {
            log.error('打开设置窗口失败:', error.message);
            statusElement.textContent = i18n.t('errors.openSettingsWindowFailed', { error: error.message });
        });
}

// 在document ready时执行初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 在初始化UI之前先获取语言设置
    try {
        const language = await ipcRenderer.invoke('get-language');
        if (language) {
            // 设置语言选择器的值
            if (languageSelect) {
                languageSelect.value = language;
            }

            // 设置 i18n 模块的当前语言
            i18n.loadFromConfig(language);
            log.info('从配置加载语言设置:', language);
        }
    } catch (error) {
        log.error('获取语言设置失败:', error.message);
    }

    // 执行初始化，init函数中已经包含了setupEventListeners的调用
    await init();

    // 初始化会话列表高度
    sidebarService.initSessionsContainerHeight();

    // 初始化关于窗口服务
    aboutService.initAboutService();
});


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

// 监听语言更新事件
ipcRenderer.on('locale-updated', async () => {
    // 重新初始化UI
    initUI();

    // 重新加载会话列表
    sidebarSession.loadSessions();

    // 重新加载当前活动会话的内容
    const activeSession = tabManager.getActiveSession();
    if (activeSession) {
        await activeSession.loadSession();
    }
});

// 监听配置更新事件
ipcRenderer.on('config-updated', (event, data) => {
    log.info('收到配置更新:');
    if (data.models) {
        modelService.loadModels();
    }

    // MCP配置现在由tabManager管理，无需单独处理

    if (data.generalConfig) {
        // 更新语言选择
        if (languageSelect && data.generalConfig.language) {
            languageSelect.value = data.generalConfig.language;
        }

        // 更新主题设置
        if (data.generalConfig.theme) {
            localStorage.setItem('theme', data.generalConfig.theme);
            themeService.applyTheme(data.generalConfig.theme);
        }
    }

    // 确保样式一致性
    setTimeout(ensureConsistentDropdownStyles, 50);
});

// 监听MCP服务更新事件
ipcRenderer.on('mcp-server-updated', async (event, mcpConfig) => {
    log.info('收到MCP服务更新:', mcpConfig);
    // MCP服务现在由tabManager管理，无需单独处理

    // 确保样式一致性
    setTimeout(ensureConsistentDropdownStyles, 50);
});

// 监听提示词配置更新事件
ipcRenderer.on('prompts-updated', async () => {
    log.info('收到提示词配置更新事件');
    await promptService.loadPrompts(statusElement);

    // 确保样式一致性
    setTimeout(ensureConsistentDropdownStyles, 50);
});

// 监听模型选择变更事件
ipcRenderer.on('model-selection-changed', (event, modelId) => {
    log.info('收到模型选择变更事件:', modelId);
    if (modelId && modelService) {
        modelService.setModelSelection(modelId);
    }
});

// 监听提示词选择变更事件
ipcRenderer.on('prompt-selection-changed', (event, promptId) => {
    log.info('收到提示词选择变更事件:', promptId);
    if (promptId && promptService) {
        promptService.setPromptSelection(promptId);
    }
});

// 监听MCP服务选择变更事件
ipcRenderer.on('mcp-selection-changed', (event, mcpServerIds) => {
    log.info('收到MCP服务选择变更事件:', mcpServerIds);
    // MCP服务选择现在由tabManager管理，无需单独处理
});

// 发送消息函数
async function sendMessage() {
    // 获取当前活动的标签会话
    const activeSession = tabManager.getActiveSession();
    if (!activeSession) return;

    // 获取当前活动标签的输入元素
    const activeTabId = tabManager.activeTabId;
    const messageInputId = `message-input-${activeTabId}`;
    const activeInput = document.getElementById(messageInputId) || messageInput;

    // 获取并清理用户输入的消息
    const message = activeInput.value.trim();
    if (!message) return; // 如果消息为空，不执行任何操作

    try {
        // 使用聊天服务发送消息
        await activeSession.sendMessage(
            message,                           // 消息内容
            openSettingsWindow                 // 打开设置窗口的函数引用
        );
    } catch (error) {
        // 记录错误信息
        log.error('发送消息失败:', error.message);
    }
}

// 确保下拉选择框样式一致性
function ensureConsistentDropdownStyles() {
    log.info('确保下拉选择框样式一致性');

    // 确保model-selector容器正确使用CSS样式
    const modelSelector = document.querySelector('.model-selector');
    if (modelSelector) {
        // 确保使用正确的显示方式
        modelSelector.style.display = 'flex';
        modelSelector.style.width = '100%';
    }

    // 移除所有下拉元素的固定宽度，使用CSS控制
    const dropdowns = modelSelector?.querySelectorAll('select, .mcp-dropdown-btn');
    if (dropdowns) {
        dropdowns.forEach(dropdown => {
            dropdown.style.removeProperty('width');
        });
    }
}

// 将openSettingsWindow函数暴露到全局，以便在HTML中调用
window.openSettingsWindow = openSettingsWindow;
window.openSettingsWindowWithTab = openSettingsWindowWithTab;

// 将checkForUpdates函数暴露到全局，以便在HTML中调用
window.checkForUpdates = updateService.checkForUpdates;

/**
 * 处理标签点击事件
 * 当用户在不同标签之间切换时，需要更新底层配置和UI显示
 */
function handleTabClick(sessionId) {
    try {
        // 加载对应会话的详细配置
        ipcRenderer.invoke('load-session', sessionId).then(session => {
            log.info("加载会话配置：", session.modelId, session.promptId);

            // 更新UI显示以匹配会话配置
            if (session.modelId) {
                // 在所有的模型选择器中选中该会话的模型
                updateAllSelectElements('model-select', session.modelId);
            }

            if (session.promptId) {
                // 在所有的提示词选择器中选中该会话的提示词
                updateAllSelectElements('prompt-select', session.promptId);
            }

            // 更新MCP服务选择状态
            updateAllMcpServers(session.mcpServers || []);

            // 更新对话模式切换按钮状态
            updateConversationModeButtons(session.conversationMode || 'single-turn');
        });
    } catch (error) {
        log.error("标签点击事件处理错误：", error.message);
    }
}

/**
 * 更新所有对话模式切换按钮状态
 * @param {string} mode 对话模式 'single-turn' 或 'multi-turn'
 */
function updateConversationModeButtons(mode) {
    const isSingleTurn = mode === 'single-turn';

    // 更新默认标签的对话模式切换按钮状态
    const defaultBtn = document.getElementById('conversation-mode-btn');
    if (defaultBtn) {
        defaultBtn.textContent = isSingleTurn ? '单次对话' : '多轮对话';
    }

    // 更新活动标签的对话模式切换按钮状态
    const activeTabId = tabManager.activeTabId;
    if (activeTabId) {
        const activeBtn = document.getElementById(`conversation-mode-btn-${activeTabId}`);
        if (activeBtn) {
            activeBtn.textContent = isSingleTurn ? '单次对话' : '多轮对话';
        }
    }
}

/**
 * 更新所有具有特定基础ID的选择元素
 * @param {string} baseId 基础ID (如 'model-select')
 * @param {string} value 要设置的值
 */
function updateAllSelectElements(baseId, value) {
    try {
        // 获取默认元素
        const defaultElement = document.getElementById(baseId);
        if (defaultElement) {
            defaultElement.value = value;
        }

        // 获取活动标签的元素
        const activeTabId = tabManager.activeTabId;
        if (activeTabId) {
            const activeElement = document.getElementById(`${baseId}-${activeTabId}`);
            if (activeElement) {
                activeElement.value = value;
            }
        }
    } catch (error) {
        log.error(`更新选择元素 ${baseId} 时出错:`, error.message);
    }
}

/**
 * 更新所有MCP服务器选择状态
 * @param {Array} servers 激活的MCP服务器ID数组
 */
function updateAllMcpServers(servers) {
    try {
        // 更新默认MCP下拉列表
        const defaultDropdown = document.getElementById('mcp-dropdown-content');
        if (defaultDropdown) {
            const checkboxes = defaultDropdown.querySelectorAll('.mcp-server-checkbox');
            checkboxes.forEach(checkbox => {
                const serverId = checkbox.getAttribute('data-server-id');
                checkbox.checked = servers.includes(serverId);
            });

            // 更新按钮显示
            const button = document.getElementById('mcp-dropdown-btn');
            if (button) {
                if (servers.length === 0) {
                    button.classList.add('no-server');
                    button.innerHTML = '<span class="dropdown-text">' + i18n.t('mcp.noServer') + '</span>';
                } else {
                    button.classList.remove('no-server');
                    button.innerHTML = '<span class="dropdown-text">' + i18n.t('mcp.selectedServers', { count: servers.length }) + '</span>';
                }
            }
        }

        // 更新活动标签的MCP下拉列表
        const activeTabId = tabManager.activeTabId;
        if (activeTabId) {
            const activeDropdown = document.getElementById(`mcp-dropdown-content-${activeTabId}`);
            if (activeDropdown) {
                const checkboxes = activeDropdown.querySelectorAll('.mcp-server-checkbox');
                checkboxes.forEach(checkbox => {
                    const serverId = checkbox.getAttribute('data-server-id');
                    checkbox.checked = servers.includes(serverId);
                });

                // 更新按钮显示
                const button = document.getElementById(`mcp-dropdown-btn-${activeTabId}`);
                if (button) {
                    if (servers.length === 0) {
                        button.classList.add('no-server');
                        button.innerHTML = '<span class="dropdown-text">' + i18n.t('mcp.noServer') + '</span>';
                    } else {
                        button.classList.remove('no-server');
                        button.innerHTML = '<span class="dropdown-text">' + i18n.t('mcp.selectedServers', { count: servers.length }) + '</span>';
                    }
                }
            }
        }
    } catch (error) {
        log.error('更新MCP服务器选择状态时出错:', error.message);
    }
}

// 将sendMessage暴露到全局，供inputManager.js使用
window.sendMessage = sendMessage;

// 导出工具函数到全局，以便从其他模块中调用
// 确保导出 handleTabClick 函数
window.handleTabClick = handleTabClick;
window.tabManager = tabManager;
window.modelService = modelService;
window.promptService = promptService;
window.mcpServer = mcpServerService;
window.openSettingsWindowWithTab = openSettingsWindowWithTab;