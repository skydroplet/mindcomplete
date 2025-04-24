const { ipcRenderer } = require('electron');
const Logger = require('../main/logger');
const log = new Logger('renderer');
const i18n = require('../locales/i18n');
const marked = require('marked');
const hljs = require('highlight.js');

// 配置 marked 使用 highlight.js
marked.setOptions({
    highlight: function (code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    langPrefix: 'hljs language-',
    breaks: true,      // 启用换行符转换为 <br>
    gfm: true,         // 启用 GitHub 风格的 Markdown
    mangle: false,     // 禁用自动转义 HTML
    headerIds: true,   // 为标题生成 ID
    smartLists: true   // 使用更智能的列表行为
});

const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const statusElement = document.getElementById('status');
const languageSelect = document.getElementById('language-select');
const modelSelect = document.getElementById('model-select');
const promptSelect = document.getElementById('prompt-select');
const sessionsContainer = document.getElementById('sessions-container');
const newSessionBtn = document.getElementById('new-session-btn');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
// 更新MCP服务容器元素
let mcpDropdownBtn = document.getElementById('mcp-dropdown-btn');
let mcpDropdownContent = document.getElementById('mcp-dropdown-content');
let currentModel = null;
let currentSessionId = null;
let sidebarCollapsed = false;
let isResizing = false;
let lastSidebarWidth = 250; // 保存侧边栏非折叠状态下的宽度
// 存储MCP服务和活跃状态
let mcpServers = {};
let activeMcps = [];

// 声明全局变量用于重命名会话
let currentRenamingSessionId = null;
let currentOldName = null;

// 初始化界面文本
function initUI() {
    const currentLang = i18n.getLocale() || 'zh-CN'; // 获取当前语言，默认为中文
    log.info(i18n.t('logs.currentLanguage'), currentLang);

    messageInput.placeholder = i18n.t('ui.inputPlaceholder');
    sendButton.textContent = i18n.t('ui.sendButton');
    statusElement.textContent = i18n.t('ui.status.ready');
}

// 加载模型列表
async function loadModels() {
    try {
        const models = await ipcRenderer.invoke('get-models');
        log.info(i18n.t('logs.modelList'), models);

        let defaultModelId = "";
        modelSelect.innerHTML = `<option value="add_new">${i18n.t('settings.buttons.addModelOption')}</option>`;
        Object.entries(models || {}).forEach(([modelId, model]) => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = model.name;
            modelSelect.appendChild(option);
            defaultModelId = modelId;
        });

        // 加载当前选择的模型
        const modelConfig = await ipcRenderer.invoke('get-config');
        if (modelConfig && modelConfig.currentModel) {
            currentModel = modelConfig.currentModel;
        } else {
            currentModel = defaultModelId;
        }
        log.info(i18n.t('logs.currentModel'), currentModel);

        modelSelect.value = currentModel || "";
    } catch (error) {
        log.error(i18n.t('logs.loadModelListFailed'), error);
    }
}


/**
 * 向聊天界面添加一条消息
 * 
 * 此函数用于在聊天界面中添加一条新消息，支持三种类型的消息：
 * - user: 用户发送的消息，靠右显示，不解析Markdown
 * - assistant: AI助手的回复，靠左显示，解析Markdown
 * - mcpTool: 工具执行的消息，靠左显示，解析Markdown，有特殊样式
 * 
 * @param {string} content - 消息内容。对于用户消息，直接显示；对于AI和工具消息，将解析Markdown格式
 * @param {string} type - 消息类型，可选值为 'user'、'assistant'、'mcpTool'，默认为 'assistant'
 */
function addMessage(content, type = 'assistant') {
    // 创建消息容器元素
    const messageDiv = document.createElement('div');

    // 创建发送者信息元素
    const sender = document.createElement('div');
    sender.className = 'message-sender';

    // 根据消息类型设置对应的类名和发送者文本
    if (type === 'user') {
        // 用户消息样式：蓝色背景，右对齐
        messageDiv.className = 'message user-message';
        sender.textContent = i18n.t('messages.user');
    } else if (type === 'mcpTool') {
        // 工具消息样式：蓝边框，左对齐
        messageDiv.className = 'message tool-message';
        sender.textContent = i18n.t('messages.tool');
    } else {
        // AI消息样式：灰色背景，左对齐
        messageDiv.className = 'message ai-message';
        sender.textContent = i18n.t('messages.ai');
    }

    // 创建消息内容元素
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // 更新消息内容
    updateMessage(contentDiv, content);

    // 组装消息元素
    messageDiv.appendChild(sender);
    messageDiv.appendChild(contentDiv);

    // 将消息添加到聊天容器中
    chatMessages.appendChild(messageDiv);

    // 滚动到最新消息
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 保存引用以便后续使用updateMessage函数更新内容 这对于实现流式响应非常重要
    return contentDiv;
}

/**
 * 更新已有消息的内容
 * 
 * 此函数用于更新当前消息的内容，主要用于流式响应场景。
 * 在流式响应时，首先通过addMessage添加一个空消息，然后随着内容流式返回，
 * 不断调用此函数更新消息内容，从而实现打字机效果。
 * @param {HTMLDivElement} messageDiv - 要更新的消息容器元素
 * @param {string} content - 新的完整消息内容，将替换当前消息的内容
 */
function updateMessage(messageDiv, content) {
    if (!messageDiv) {
        return;
    }

    // 解析 Markdown 并更新消息内容
    messageDiv.innerHTML = marked.parse(content);

    // 确保内容可选择
    messageDiv.style.userSelect = 'text';
    messageDiv.style.webkitUserSelect = 'text';

    // 对新添加的代码块应用语法高亮
    if (window.applyHighlighting) {
        // 使用全局高亮函数，如果存在
        window.applyHighlighting();
    } else {
        // 否则使用highlight.js直接处理
        messageDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }

    // 滚动到最新内容，保持消息可见
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * 对不完整或格式不正确的JSON代码块进行预处理和格式化
 * 
 * 此函数查找Markdown中的JSON代码块，尝试解析并格式化它们，
 * 使JSON内容更具可读性。如果解析失败，则保留原始内容。
 * 
 * @param {string} text - 包含可能JSON代码块的Markdown文本
 * @returns {string} - 处理后的文本，其中合法的JSON已被格式化
 */
function sanitizeJsonInMarkdown(text) {
    // 查找所有JSON代码块：以```json开始，以```结束的内容
    return text.replace(/```json\n([\s\S]*?)```/g, (match, jsonContent) => {
        try {
            // 尝试解析JSON内容
            const parsed = JSON.parse(jsonContent);
            // 将解析后的JSON重新格式化为缩进为2的美观格式
            return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
        } catch (e) {
            // 如果解析失败（可能是JSON不完整或格式错误），
            // 则返回原始内容，不进行修改
            return match;
        }
    });
}

/**
 * 对Markdown中的代码块进行预处理，确保正确的语言标识
 * 
 * 此函数对Markdown文本中的代码块进行预处理，包括：
 * 1. 使用sanitizeJsonInMarkdown对JSON代码块进行格式化
 * 2. 确保所有代码块都有语言标识，如果没有则使用默认值'plaintext'
 * 
 * @param {string} text - 包含代码块的Markdown文本
 * @returns {string} - 处理后的文本，所有代码块都有正确的语言标识
 */
function preprocessCodeBlocks(text) {
    // 首先处理JSON代码块，使其格式化
    text = sanitizeJsonInMarkdown(text);

    // 正则表达式匹配所有代码块，包括语言标识部分和代码内容部分
    const codeBlockRegex = /```([^\n]*)\n([\s\S]*?)```/g;

    // 替换每个匹配的代码块
    return text.replace(codeBlockRegex, (match, language, code) => {
        // 如果语言标识为空，设置为'plaintext'
        language = language.trim() || 'plaintext';
        // 重新构造代码块，确保有正确的语言标识
        return '```' + language + '\n' + code + '```';
    });
}

// 会话管理相关函数
async function loadSessions() {
    try {
        log.info(i18n.t('logs.loadSessionList'));
        statusElement.textContent = i18n.t('ui.status.loading');
        const sessions = await ipcRenderer.invoke('get-sessions');

        // 清空会话容器
        sessionsContainer.innerHTML = '';

        if (sessions.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'session-empty';
            emptyMsg.textContent = i18n.t('session.noSessions');
            sessionsContainer.appendChild(emptyMsg);
            return;
        }

        // 渲染会话列表
        sessions.forEach(session => {
            const sessionItem = document.createElement('div');
            sessionItem.className = `session-item ${session.id === currentSessionId ? 'active' : ''}`;
            sessionItem.setAttribute('data-id', session.id);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'session-name';
            nameSpan.textContent = session.name;

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'session-actions';

            // 创建重命名按钮，使用图标替代文字
            const renameBtn = document.createElement('button');
            renameBtn.className = 'session-action-btn';
            renameBtn.title = i18n.t('session.rename');
            renameBtn.innerHTML = '✏️'; // 铅笔图标
            renameBtn.onclick = (e) => {
                e.stopPropagation();
                renameSession(session.id, session.name);
            };

            // 创建删除按钮，使用图标替代文字
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'session-action-btn';
            deleteBtn.title = i18n.t('session.delete');
            deleteBtn.innerHTML = '🗑️'; // 垃圾桶图标
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteSession(session.id);
            };

            actionsDiv.appendChild(renameBtn);
            actionsDiv.appendChild(deleteBtn);

            sessionItem.appendChild(nameSpan);
            sessionItem.appendChild(actionsDiv);

            // 点击会话项加载对应会话
            sessionItem.addEventListener('click', () => loadSession(session.id));

            sessionsContainer.appendChild(sessionItem);
        });

        statusElement.textContent = i18n.t('ui.status.ready');
    } catch (error) {
        log.error(i18n.t('logs.sessionListLoadFailed'), error);
        statusElement.textContent = i18n.t('errors.loadSessionListFailed', { error: error.message });
    }
}

// 创建新会话
async function createNewSession() {
    try {
        statusElement.textContent = i18n.t('ui.status.creatingNewSession');

        // 清空聊天界面
        chatMessages.innerHTML = '';

        // 创建新会话
        const session = await ipcRenderer.invoke('create-session');
        currentSessionId = session.id;

        // 重新加载会话列表
        await loadSessions();

        statusElement.textContent = i18n.t('ui.status.newSessionCreated', { name: session.name });
    } catch (error) {
        log.error(i18n.t('logs.createSessionFailed'), error);
        statusElement.textContent = i18n.t('ui.status.newSessionFailed', { error: error.message });
    }
}

// 加载指定会话
async function loadSession(sessionId) {
    try {
        if (sessionId === currentSessionId) return;

        statusElement.textContent = i18n.t('ui.status.loadingSession');

        // 加载会话
        const session = await ipcRenderer.invoke('load-session', sessionId);
        if (!session) {
            statusElement.textContent = i18n.t('ui.status.sessionLoadFailed');
            return;
        }

        currentSessionId = session.id;

        // 更新会话列表UI
        const items = document.querySelectorAll('.session-item');
        items.forEach(item => {
            if (item.getAttribute('data-id') === sessionId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // 清空聊天界面
        chatMessages.innerHTML = '';

        // 渲染消息历史
        session.messages.forEach(msg => {
            addMessage(msg.content, msg.role);
        });

        statusElement.textContent = i18n.t('ui.status.sessionLoaded', { name: session.name });
    } catch (error) {
        log.error(i18n.t('logs.loadSessionFailed'), error);
        statusElement.textContent = i18n.t('ui.status.loadSessionFailed', { error: error.message });
    }
}

// 重命名会话
async function renameSession(sessionId, oldName) {
    try {
        // 保存当前正在重命名的会话ID和旧名称
        currentRenamingSessionId = sessionId;
        currentOldName = oldName;

        // 获取对话框元素
        const renameDialog = document.getElementById('rename-dialog');
        const newNameInput = document.getElementById('new-name-input');

        // 设置默认值
        newNameInput.value = oldName;

        // 显示对话框
        renameDialog.style.display = 'flex';

        // 设置焦点
        newNameInput.focus();
        newNameInput.select();

    } catch (error) {
        log.error(i18n.t('logs.renameSessionFailed'), error);
        statusElement.textContent = i18n.t('ui.status.renamingSessionFailed', { error: error.message });
    }
}

// 确认重命名会话
async function confirmRenameSession() {
    try {
        const newNameInput = document.getElementById('new-name-input');
        const newName = newNameInput.value.trim();

        // 如果名称为空或没有变化，关闭对话框
        if (!newName || newName === currentOldName) {
            closeRenameDialog();
            return;
        }

        await ipcRenderer.invoke('rename-session', currentRenamingSessionId, newName);

        // 更新UI
        const sessionItem = document.querySelector(`.session-item[data-id="${currentRenamingSessionId}"] .session-name`);
        if (sessionItem) {
            sessionItem.textContent = newName;
        }

        // 如果是当前会话，更新状态栏
        if (currentRenamingSessionId === currentSessionId) {
            statusElement.textContent = i18n.t('ui.status.sessionRenamed', { name: newName });
        }

        // 关闭对话框
        closeRenameDialog();
    } catch (error) {
        log.error(i18n.t('logs.renameSessionFailed'), error);
        statusElement.textContent = i18n.t('ui.status.renamingSessionFailed', { error: error.message });
        closeRenameDialog();
    }
}

// 关闭重命名对话框
function closeRenameDialog() {
    const renameDialog = document.getElementById('rename-dialog');
    renameDialog.style.display = 'none';

    // 清除当前重命名状态
    currentRenamingSessionId = null;
    currentOldName = null;
}

// 删除会话
async function deleteSession(sessionId) {
    try {
        if (!confirm(i18n.t('session.confirmDelete'))) return;

        await ipcRenderer.invoke('delete-session', sessionId);

        // 如果删除的是当前会话，创建一个新会话
        if (sessionId === currentSessionId) {
            chatMessages.innerHTML = '';
            currentSessionId = null;
            await createNewSession();
        } else {
            // 否则仅重新加载会话列表
            await loadSessions();
        }

        statusElement.textContent = i18n.t('ui.status.sessionDeleted');
    } catch (error) {
        log.error('删除会话失败:', error);
        statusElement.textContent = `删除会话失败: ${error.message}`;
    }
}

// 修改发送消息函数，保持消息流畅度
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    // 检查是否选择了模型
    if (!currentModel) {
        statusElement.textContent = i18n.t('modelSelector.selectModel');
        setTimeout(() => {
            statusElement.textContent = i18n.t('ui.status.ready');
        }, 3000);

        // 自动打开设置窗口
        openSettingsWindow();
        return;
    }

    // 确保有活动会话
    if (!currentSessionId) {
        await createNewSession();
    }

    addMessage(message, 'user');
    messageInput.value = '';
    statusElement.textContent = i18n.t('ui.status.generating');

    // 跟踪AI消息的原始文本
    let currentAiMessage = null;
    let currentRawText = '';

    // 跟踪AI消息的原始文本
    let currentToolMessage = null;
    let currentToolRawText = '';

    try {
        ipcRenderer.on('new-ai-message', (event, chunk) => {
            // 添加空的AI回复消息，准备接收流式内容
            currentAiMessage = addMessage('', 'assistant');
            currentRawText = chunk;

            const processedText = preprocessCodeBlocks(currentRawText);
            updateMessage(currentAiMessage, processedText);
        });

        ipcRenderer.on('ai-message-chunk', (event, chunk) => {
            currentRawText += chunk;
            const processedText = preprocessCodeBlocks(currentRawText);
            updateMessage(currentAiMessage, processedText);
        });

        ipcRenderer.on('new-mcp-tool-message', (event, chunk) => {
            currentToolMessage = addMessage('', 'mcpTool');
            currentToolRawText = chunk;
            const processedText = preprocessCodeBlocks(currentToolRawText);
            updateMessage(currentToolMessage, processedText);
        });

        ipcRenderer.on('mcp-tool-message-chunk', (event, chunk) => {
            currentToolRawText += chunk;
            const processedText = preprocessCodeBlocks(currentToolRawText);
            updateMessage(currentToolMessage, processedText);
        });

        await ipcRenderer.invoke('send-message', message);
        statusElement.textContent = i18n.t('ui.status.ready');
    } catch (error) {
        log.error('发送消息失败:', {
            error: error.message,
            stack: error.stack
        });

        // 显示更友好的错误信息
        let errorMsg = error.message || i18n.t('errors.unknown');

        // 如果错误与模型API相关，提示用户检查设置
        if (errorMsg.includes('API') || errorMsg.includes('模型') || errorMsg.includes('Key')) {
            errorMsg += i18n.t('errors.checkModelSettings');
            // 添加错误处理逻辑，如果错误与设置相关，显示设置按钮
            const errorWithButton = document.createElement('div');
            errorWithButton.innerHTML = `<div class="error-message">${errorMsg}
                <button class="open-settings-btn">${i18n.t('errors.openSettings')}</button>
            </div>`;

            // 在现有AI消息中添加错误提示
            if (currentAiMessage) {
                currentAiMessage.appendChild(errorWithButton);

                // 添加设置按钮点击事件
                const settingsBtn = errorWithButton.querySelector('.open-settings-btn');
                if (settingsBtn) {
                    settingsBtn.addEventListener('click', openSettingsWindow);
                }
            }
        }

        statusElement.textContent = i18n.t('ui.status.error', { error: errorMsg });
    } finally {
        ipcRenderer.removeAllListeners('ai-message-chunk');
    }
}

// 侧边栏折叠/展开功能
function toggleSidebar() {
    log.info('Toggle Sidebar called, current state:', sidebarCollapsed);

    // 检查sidebar是否存在
    if (!sidebar) {
        log.error('找不到sidebar元素!');
        return;
    }
    log.info('Sidebar element:', sidebar);

    // 添加调试代码，检查事件触发时的元素状态
    log.info('触发前sidebar-toggle样式:', sidebarToggle ? window.getComputedStyle(sidebarToggle) : 'not found');
    log.info('触发前sidebarToggle可点击状态:', sidebarToggle ? window.getComputedStyle(sidebarToggle).pointerEvents : 'not found');

    // 切换前保存当前宽度（如果未折叠）
    if (!sidebarCollapsed) {
        // 获取计算后的实际宽度
        const computedStyle = window.getComputedStyle(sidebar);
        lastSidebarWidth = parseFloat(computedStyle.width);
        localStorage.setItem('sidebarWidth', lastSidebarWidth.toString());
        log.info('Saving current sidebar width:', lastSidebarWidth);
    }

    sidebarCollapsed = !sidebarCollapsed;
    log.info('New state:', sidebarCollapsed);

    try {
        const resizer = document.getElementById('sidebar-resizer');

        if (sidebarCollapsed) {
            log.info('执行折叠操作 - 进入折叠分支');
            sidebar.classList.add('collapsed');

            // 直接设置样式确保折叠效果
            sidebar.style.width = '40px';
            sidebar.style.minWidth = '40px'; // 添加最小宽度确保不会被其他样式覆盖
            sidebar.style.overflow = 'hidden';
            log.info('设置sidebar宽度为:', sidebar.style.width);

            // 设置拖动条位置为折叠状态
            if (resizer) {
                resizer.style.left = '40px';
                resizer.style.pointerEvents = 'none'; // 禁用拖动
                log.info('设置拖动条位置为折叠状态:', resizer.style.left);
            }

            // 隐藏子元素
            const sidebarHeader = document.querySelector('.sidebar-header');
            const sessionsContainer = document.querySelector('.sessions-container');
            const sidebarLower = document.getElementById('sidebar-footer');

            // 确保系统区域隐藏，会话列表恢复显示（在下次展开时）
            const systemItemsContainer = document.getElementById('system-items-container');
            if (systemItemsContainer) {
                systemItemsContainer.style.display = 'none';
                log.info('已隐藏系统区域');
            }

            // 确保会话列表在下次展开时是可见的
            if (sessionsContainer) {
                sessionsContainer.style.display = 'block';
                sessionsContainer.style.opacity = '0';
                sessionsContainer.style.pointerEvents = 'none';
                log.info('已设置sessions-container不可见，但保持display为block');
            } else {
                log.error('找不到sessions-container元素!');
            }

            if (sidebarHeader) {
                sidebarHeader.style.opacity = '0';
                sidebarHeader.style.pointerEvents = 'none';
                log.info('已设置sidebar-header不可见');
            } else {
                log.error('找不到sidebar-header元素!');
            }

            // 调整底部按钮区域样式为折叠状态
            if (sidebarLower) {
                sidebarLower.classList.add('collapsed');
                log.info('已设置底部按钮为折叠状态');
            } else {
                log.error('找不到底部按钮容器!');
            }

            // 显示折叠图标
            const collapseIcon = document.querySelector('.sidebar-collapse-icon');
            if (collapseIcon) {
                collapseIcon.style.display = 'flex';
                collapseIcon.style.opacity = '1';
                log.info('已设置collapse-icon可见');
            } else {
                log.error('找不到sidebar-collapse-icon元素!');
            }

            // 隐藏折叠按钮，但保持可点击
            if (sidebarToggle) {
                // 修改：让按钮始终保持可点击，只改变透明度
                sidebarToggle.style.opacity = '0.2'; // 设置为轻微可见，以便于调试
                // 确保按钮依然可交互
                sidebarToggle.style.pointerEvents = 'auto';
                log.info('已设置sidebar-toggle不可见，但保持可点击状态');
            } else {
                log.error('找不到sidebarToggle元素!');
            }

            // 保存状态到本地存储
            localStorage.setItem('sidebarCollapsed', 'true');

            // 拖动条位置会通过CSS自动调整
            updateResizerPosition();

            // 强制重绘
            window.requestAnimationFrame(() => {
                log.info('请求下一帧重绘，确保样式应用');
                // 触发重排/重绘，但不隐藏整个body以避免闪烁
                const _ = sidebar.offsetHeight;
            });
        } else {
            log.info('执行展开操作 - 进入展开分支');
            sidebar.classList.remove('collapsed');

            // 直接设置样式确保展开效果，恢复之前保存的宽度
            const savedWidth = localStorage.getItem('sidebarWidth');
            if (savedWidth) {
                lastSidebarWidth = parseInt(savedWidth);
                log.info('从本地存储恢复侧边栏宽度:', lastSidebarWidth);
            }

            sidebar.style.width = `${lastSidebarWidth}px`;
            sidebar.style.minWidth = '180px'; // 修改为一致的最小宽度
            sidebar.style.overflow = 'auto';
            log.info('恢复sidebar宽度为:', sidebar.style.width);

            // 等待页面重排并计算实际宽度后更新拖动条位置
            if (resizer) {
                // 使用setTimeout确保DOM更新后获取正确宽度
                setTimeout(() => {
                    // 获取计算后的实际宽度
                    const computedStyle = window.getComputedStyle(sidebar);
                    const actualWidth = parseFloat(computedStyle.width);

                    resizer.style.left = `${actualWidth}px`;
                    resizer.style.pointerEvents = 'auto'; // 恢复拖动功能
                    log.info('展开后设置拖动条位置与侧边栏右侧对齐:', actualWidth);
                }, 50);
            }

            // 显示子元素
            const sidebarHeader = document.querySelector('.sidebar-header');
            const sessionsContainer = document.querySelector('.sessions-container');
            const sidebarLower = document.getElementById('sidebar-footer');
            const sidebarUpper = document.querySelector('.sidebar-upper');
            const verticalResizer = document.getElementById('sidebar-vertical-resizer');
            const systemItemsContainer = document.getElementById('system-items-container');

            // 恢复上下区域的高度比例
            if (sidebarUpper && sidebarLower && verticalResizer) {
                verticalResizer.style.display = 'block';

                // 从本地存储加载上次保存的高度比例
                const savedUpperHeightPercent = localStorage.getItem('sidebarUpperHeightPercent');
                if (savedUpperHeightPercent) {
                    const percent = parseFloat(savedUpperHeightPercent);
                    const sidebarHeight = sidebar.clientHeight;
                    const upperHeight = (sidebarHeight - 5) * (percent / 100);
                    const lowerHeight = (sidebarHeight - 5) * ((100 - percent) / 100);

                    // 应用保存的高度比例
                    sidebarUpper.style.height = `${upperHeight}px`;
                    sidebarLower.style.height = `${lowerHeight}px`;

                    // 移除最大最小高度限制，允许自由调整
                    sidebarLower.style.maxHeight = 'none';
                    sidebarLower.style.minHeight = 'auto';

                    // 确保会话列表高度正确设置
                    const sessionsContainer = document.getElementById('sessions-container');
                    if (sessionsContainer) {
                        const sidebarHeader = document.querySelector('.sidebar-header');
                        const headerHeight = sidebarHeader ? sidebarHeader.offsetHeight : 40;

                        // 直接计算内容区域高度并设置
                        const containerHeight = upperHeight - headerHeight;
                        sessionsContainer.style.flex = '0 0 auto'; // 确保不伸缩
                        sessionsContainer.style.height = containerHeight + 'px';
                        sessionsContainer.style.maxHeight = containerHeight + 'px';
                        sessionsContainer.style.minHeight = containerHeight + 'px';

                        log.info('切换侧边栏，更新会话列表高度:', containerHeight);
                    }
                } else {
                    // 没有保存的比例，使用默认值
                    sidebarUpper.style.height = 'calc(100% - 80px - 5px)';
                    sidebarLower.style.height = '80px';

                    // 移除最大最小高度限制，允许自由调整
                    sidebarLower.style.maxHeight = 'none';
                    sidebarLower.style.minHeight = 'auto';

                    // 使用默认值时设置会话列表高度
                    const sessionsContainer = document.getElementById('sessions-container');
                    if (sessionsContainer) {
                        const sidebarHeader = document.querySelector('.sidebar-header');
                        const headerHeight = sidebarHeader ? sidebarHeader.offsetHeight : 40;
                        // 计算默认高度 - 假设上部区域减去分隔条和下部区域
                        const upperHeight = sidebar.clientHeight - 80 - 5;

                        // 直接计算内容区域高度并设置
                        const containerHeight = upperHeight - headerHeight;
                        sessionsContainer.style.flex = '0 0 auto'; // 确保不伸缩
                        sessionsContainer.style.height = containerHeight + 'px';
                        sessionsContainer.style.maxHeight = containerHeight + 'px';
                        sessionsContainer.style.minHeight = containerHeight + 'px';

                        log.info('使用默认值，更新会话列表高度:', containerHeight);
                    }
                }
            }

            if (sidebarHeader) {
                sidebarHeader.style.opacity = '1';
                sidebarHeader.style.pointerEvents = 'auto';
                log.info('已设置sidebar-header可见');
            } else {
                log.error('找不到sidebar-header元素!');
            }

            if (sessionsContainer) {
                sessionsContainer.style.opacity = '1';
                sessionsContainer.style.pointerEvents = 'auto';
                log.info('已设置sessions-container可见');
            } else {
                log.error('找不到sessions-container元素!');
            }

            // 恢复底部按钮区域样式
            if (sidebarLower) {
                sidebarLower.classList.remove('collapsed');
                log.info('已恢复底部按钮为正常状态');
            } else {
                log.error('找不到底部按钮容器!');
            }

            // 隐藏折叠图标
            const collapseIcon = document.querySelector('.sidebar-collapse-icon');
            if (collapseIcon) {
                collapseIcon.style.display = 'none';
                log.info('已设置collapse-icon不可见');
            } else {
                log.error('找不到sidebar-collapse-icon元素!');
            }

            // 显示折叠按钮
            if (sidebarToggle) {
                sidebarToggle.style.opacity = '1';
                sidebarToggle.style.pointerEvents = 'auto';
                log.info('已设置sidebar-toggle可见');
            } else {
                log.error('找不到sidebarToggle元素!');
            }

            // 更新拖动条位置
            updateResizerPosition();

            // 保存状态到本地存储
            localStorage.setItem('sidebarCollapsed', 'false');

            // 强制重绘
            window.requestAnimationFrame(() => {
                log.info('请求下一帧重绘，确保样式应用');
                // 触发重排/重绘，但不隐藏整个body以避免闪烁
                const _ = sidebar.offsetHeight;
            });
        }

        // 保存状态到本地存储
        localStorage.setItem('sidebarCollapsed', sidebarCollapsed.toString());

        // 更新拖动条位置
        updateResizerPosition();
    } catch (error) {
        log.error('应用侧边栏样式时出错:', error);
    }

    log.info('Current sidebar classList:', sidebar.classList);
    log.info('Current sidebar computed style:', window.getComputedStyle(sidebar).width);
}

// 加载侧边栏状态
function loadSidebarState() {
    log.info('Loading sidebar state');

    // 确保sidebar元素存在
    if (!sidebar) {
        log.error('初始化时找不到sidebar元素!');
        return;
    }

    // 获取保存的宽度设置
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        lastSidebarWidth = parseInt(savedWidth);
        log.info('从本地存储读取侧边栏宽度:', lastSidebarWidth);
    }

    const collapsed = localStorage.getItem('sidebarCollapsed');
    log.info('Stored sidebar state:', collapsed);

    try {
        // 修改逻辑：默认折叠，只有明确设置为false时才展开
        if (collapsed !== 'false') {
            log.info('Setting sidebar to collapsed (default)');
            sidebarCollapsed = true;
            sidebar.classList.add('collapsed');

            // 直接设置样式确保折叠效果
            sidebar.style.width = '40px';
            sidebar.style.minWidth = '40px';
            sidebar.style.overflow = 'hidden';
            log.info('初始化时设置sidebar宽度为:', sidebar.style.width);

            // 设置拖动条位置为折叠状态 - 移动到侧边栏右侧
            const resizer = document.getElementById('sidebar-resizer');
            if (resizer) {
                resizer.style.left = '40px';
                resizer.style.pointerEvents = 'none'; // 禁用拖动
                log.info('初始化时设置拖动条位置为折叠状态');
            }

            // 隐藏子元素
            const sidebarHeader = document.querySelector('.sidebar-header');
            const sessionsContainer = document.querySelector('.sessions-container');
            const sidebarLower = document.getElementById('sidebar-footer');

            // 确保系统区域隐藏，会话列表恢复显示（在下次展开时）
            const systemItemsContainer = document.getElementById('system-items-container');
            if (systemItemsContainer) {
                systemItemsContainer.style.display = 'none';
                log.info('已隐藏系统区域');
            }

            if (sidebarHeader) {
                sidebarHeader.style.opacity = '0';
                sidebarHeader.style.pointerEvents = 'none';
                log.info('初始化时设置sidebar-header不可见');
            } else {
                log.error('初始化时找不到sidebar-header元素!');
            }

            if (sessionsContainer) {
                sessionsContainer.style.opacity = '0';
                sessionsContainer.style.pointerEvents = 'none';
                log.info('初始化时设置sessions-container不可见');
            } else {
                log.error('初始化时找不到sessions-container元素!');
            }

            // 调整底部按钮区域样式为折叠状态
            if (sidebarLower) {
                sidebarLower.classList.add('collapsed');
                log.info('已设置底部按钮为折叠状态');
            } else {
                log.error('找不到底部按钮容器!');
            }

            // 显示折叠图标
            const collapseIcon = document.querySelector('.sidebar-collapse-icon');
            if (collapseIcon) {
                collapseIcon.style.display = 'flex';
                collapseIcon.style.opacity = '1';
                log.info('初始化时设置collapse-icon可见');
            } else {
                log.error('初始化时找不到sidebar-collapse-icon元素!');
            }

            // 隐藏折叠按钮，但保持可点击状态
            if (sidebarToggle) {
                sidebarToggle.style.opacity = '0.2'; // 设置为轻微可见
                sidebarToggle.style.pointerEvents = 'auto'; // 确保可点击
                log.info('初始化时设置sidebar-toggle半透明但可点击');
            } else {
                log.error('初始化时找不到sidebarToggle元素!');
            }

            log.info('Sidebar classes after init:', sidebar.classList);
            log.info('Sidebar computed style after init:', window.getComputedStyle(sidebar).width);
        } else {
            log.info('Setting sidebar to expanded (from saved state)');
            sidebarCollapsed = false;

            // 确保侧边栏处于展开状态
            sidebar.classList.remove('collapsed');

            // 设置侧边栏宽度为保存的值或默认值
            sidebar.style.width = lastSidebarWidth ? `${lastSidebarWidth}px` : '250px';
            sidebar.style.minWidth = '180px';
            sidebar.style.overflow = 'auto';

            log.info('初始化时恢复sidebar宽度为:', sidebar.style.width);

            // 更新拖动条位置 - 使用更可靠的方法
            const resizer = document.getElementById('sidebar-resizer');
            if (resizer) {
                // 等待布局稳定后再设置准确位置
                setTimeout(() => {
                    // 获取计算后的实际宽度
                    const computedStyle = window.getComputedStyle(sidebar);
                    const actualWidth = parseFloat(computedStyle.width);

                    resizer.style.left = `${actualWidth}px`;
                    resizer.style.pointerEvents = 'auto'; // 确保拖动功能可用
                    log.info('初始化时设置拖动条位置与侧边栏右侧对齐:', actualWidth);
                }, 50);
            }

            // 显示子元素
            const sidebarHeader = document.querySelector('.sidebar-header');
            const sessionsContainer = document.querySelector('.sessions-container');
            const sidebarLower = document.getElementById('sidebar-footer');
            const systemItemsContainer = document.getElementById('system-items-container');

            if (sidebarHeader) {
                sidebarHeader.style.opacity = '1';
                sidebarHeader.style.pointerEvents = 'auto';
                log.info('已恢复sidebar-header可见性');
            } else {
                log.error('找不到sidebar-header元素!');
            }

            if (sessionsContainer) {
                sessionsContainer.style.opacity = '1';
                sessionsContainer.style.pointerEvents = 'auto';
                log.info('已恢复sessions-container可见性');
            } else {
                log.error('找不到sessions-container元素!');
            }

            // 恢复底部按钮区域样式
            if (sidebarLower) {
                sidebarLower.classList.remove('collapsed');
                log.info('已恢复底部按钮为正常状态');
            } else {
                log.error('找不到底部按钮容器!');
            }

            // 显示系统菜单，但初始状态为隐藏
            if (systemItemsContainer) {
                // 保持display为none，但允许通过点击系统按钮显示
                systemItemsContainer.style.display = 'none';
            }
        }
    } catch (error) {
        log.error('初始化侧边栏样式时出错:', error);
    }
}

// 初始化函数
async function init() {
    // 首先初始化主题切换 - 提前到其他初始化前，以避免主题闪烁
    initThemeToggle();

    // 设置更新检查事件监听器 - 尽早设置以捕获启动时的更新通知
    setupUpdateListeners();

    // 初始化界面文本
    initUI();

    // 设置当前语言
    if (languageSelect) {
        languageSelect.value = i18n.getLocale();
    }

    // 初始化侧边栏状态 - 提前到模型加载前，使界面更快可用
    loadSidebarState();

    // 初始化侧边栏调整功能 - 使用更新的setupSidebarResizing代替旧函数
    setupSidebarResizing();

    // 移除此行，避免与setupSidebarResizing冲突
    // initSidebarResize();

    // 仍然保留垂直拖动初始化，如果有需要的话
    // initSidebarVerticalResize();

    // 确保下拉选择框样式一致性
    ensureConsistentDropdownStyles();

    // 设置事件监听器
    setupEventListeners();

    // 创建一个并行加载函数
    const loadPromise = Promise.all([
        // 加载模型列表
        (async () => {
            await loadModels();
        })(),

        // 加载提示词列表
        (async () => {
            await loadPrompts();
        })(),

        // 加载MCP服务列表
        (async () => {
            await loadMcpServers();
        })(),

        // 加载会话
        (async () => {
            await loadSessions();

            try {
                // 获取当前活动会话
                const activeSessionId = await ipcRenderer.invoke('get-active-session-id');
                if (activeSessionId) {
                    // 加载活动会话
                    await loadSession(activeSessionId);
                } else {
                    // 如果没有活动会话，创建一个新会话
                    await createNewSession();
                }
            } catch (error) {
                log.error('初始化会话失败:', error);
                statusElement.textContent = `初始化会话失败: ${error.message}`;
            }
        })()
    ]);

    // 初始化时添加一个测试工具消息展示
    // 这段代码仅用于测试，可以在实际部署前删除
    setTimeout(() => {
        addMessage("这是一个**工具消息**示例，用于展示工具执行结果。\n\n```json\n{\n  \"status\": \"success\",\n  \"result\": \"操作完成\"\n}\n```", 'mcpTool');
    }, 1000);

    // 等待所有并行任务完成
    await loadPromise;

    statusElement.textContent = i18n.t('ui.status.ready');

    // 调试MCP下拉菜单 - 延迟执行，不阻塞初始化
    setTimeout(() => {
        debugMcpDropdown();
    }, 1000);

    // 记录总体耗时统计
    log.info('应用初始化完成，各阶段耗时已记录');
}

/**
 * 设置更新检查相关的事件监听器
 */
function setupUpdateListeners() {
    // 当有新版本可用时显示通知
    ipcRenderer.on('update-available', (event, updateInfo) => {
        if (updateInfo && updateInfo.hasUpdate) {
            log.info('发现新版本:', updateInfo);
            // 显示更新通知窗口
            showUpdateNotification(updateInfo);
        }
    });

    // 检查更新状态变化
    ipcRenderer.on('checking-for-updates', (event) => {
        statusElement.textContent = i18n.t('ui.status.checkingForUpdates', '正在检查更新...');
    });

    // 更新检查结果
    ipcRenderer.on('update-check-result', (event, result) => {
        if (result.hasUpdate) {
            statusElement.textContent = i18n.t('ui.status.updateAvailable', '发现新版本 {version}', { version: result.version });
            showUpdateNotification(result);
        } else {
            statusElement.textContent = i18n.t('ui.status.noUpdateAvailable', '已是最新版本');
            // 3秒后恢复状态显示
            setTimeout(() => {
                statusElement.textContent = i18n.t('ui.status.ready');
            }, 3000);
        }
    });

    // 更新检查错误
    ipcRenderer.on('update-check-error', (event, errorMsg) => {
        log.error('检查更新失败:', errorMsg);
        statusElement.textContent = i18n.t('ui.status.error', { error: '检查更新失败' });
        // 3秒后恢复状态显示
        setTimeout(() => {
            statusElement.textContent = i18n.t('ui.status.ready');
        }, 3000);
    });

    // 记录设置更新监听器完成
    log.info('已设置更新检查相关事件监听器');
}

// 侧边栏折叠/展开按钮的事件处理函数
function handleSidebarToggle(e) {
    log.info('Sidebar toggle button clicked!');
    log.info('Event target:', e.target);
    log.info('Button state:', window.getComputedStyle(sidebarToggle).pointerEvents);
    // 确保阻止事件冒泡和默认行为
    e.stopPropagation();
    e.preventDefault();
    // 调用切换函数
    toggleSidebar();
}

// 打开带有特定标签页的设置窗口
function openSettingsWindowWithTab(tabName) {
    try {
        ipcRenderer.invoke('open-config-window-with-tab', tabName);
    } catch (error) {
        log.error('打开设置窗口失败:', error);
        statusElement.textContent = i18n.t('errors.openSettingsWindowFailed', { error: error.message });
    }
}

// 添加模型配置
function addModelConfig() {
    openSettingsWindowWithTab('models');
}

// 添加提示词配置
function addPromptConfig() {
    openSettingsWindowWithTab('prompts');
}

// 添加MCP服务配置
function addMcpConfig() {
    openSettingsWindowWithTab('mcp-servers');
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
                styleEl.textContent = `
                    #${selectElement.id} option {
                        padding: 8px 12px;
                    }
                    #${selectElement.id}:focus option {
                        max-height: calc(10 * 36px);
                        overflow-y: auto;
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
    enhanceSelectElement(modelSelect);
    enhanceSelectElement(promptSelect);

    // 添加侧边栏折叠/展开按钮的事件监听器
    if (sidebarToggle) {
        log.info('Adding click event to sidebar toggle button');

        // 移除之前可能存在的事件监听器，避免重复
        sidebarToggle.removeEventListener('click', handleSidebarToggle);

        // 使用捕获模式添加事件，确保事件首先被这个处理程序接收
        sidebarToggle.addEventListener('click', handleSidebarToggle, true);

        // 增强按钮的可视性，便于调试
        sidebarToggle.style.zIndex = '100';
    } else {
        log.error('Sidebar toggle button not found!');
    }

    // 获取时钟图标元素并添加点击事件
    const sidebarCollapseIcon = document.querySelector('.sidebar-collapse-icon');
    if (sidebarCollapseIcon) {
        sidebarCollapseIcon.addEventListener('click', function (e) {
            log.info('Sidebar collapse icon clicked');
            if (sidebarCollapsed) {
                toggleSidebar();
                e.stopPropagation(); // 阻止事件冒泡
            }
        });
    }

    // 设置按钮的点击事件
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', function (e) {
            e.stopPropagation(); // 阻止事件冒泡
            openSettingsWindow();
        });
    } else {
        log.error('Settings button not found!');
    }

    // 点击收起状态下的侧边栏区域也可以展开
    sidebar.addEventListener('click', (e) => {
        if (sidebarCollapsed) {
            toggleSidebar();
        }
    });

    // 其他事件监听器
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    sendButton.addEventListener('click', sendMessage);
    newSessionBtn.addEventListener('click', createNewSession);

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
                        log.error('Error copying text: ', err);
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
                        log.error('Error cutting text: ', err);
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
                        log.error('Error pasting text: ', err);
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

    // 选择模型处理
    modelSelect.addEventListener('change', async (e) => {
        const modelId = e.target.value;
        if (modelId === "add_new") {
            // 重置选择框
            modelSelect.value = currentModel || "";

            // 打开配置窗口的模型标签页
            openSettingsWindowWithTab('models');
        } else if (modelId) {
            // 用户选择了一个模型
            currentModel = modelId;
            await ipcRenderer.invoke('select-model', modelId);
        }
    });

    // 重命名对话框事件监听
    const renameCancelBtn = document.getElementById('rename-cancel-btn');
    const renameConfirmBtn = document.getElementById('rename-confirm-btn');
    const newNameInput = document.getElementById('new-name-input');

    renameCancelBtn.addEventListener('click', closeRenameDialog);
    renameConfirmBtn.addEventListener('click', confirmRenameSession);

    // 在输入框按下回车键也可以确认
    newNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            confirmRenameSession();
        }
    });

    // 初始化侧边栏拖动功能
    initSidebarResize();

    // 提示词选择变更事件
    promptSelect.addEventListener('change', async () => {
        try {
            const promptId = promptSelect.value || null;

            // 处理选择添加提示词的情况
            if (promptId === 'add_new') {
                // 重置选择框
                const currentPrompt = await ipcRenderer.invoke('get-current-prompt');
                promptSelect.value = currentPrompt ? currentPrompt.id : '';

                // 打开配置窗口
                openSettingsWindowWithTab('prompts');
                return;
            }

            const success = await ipcRenderer.invoke('set-current-prompt', promptId);

            if (success) {
                let message = promptId ? i18n.t('ui.status.promptSelected') : i18n.t('ui.status.promptCleared');
                statusElement.textContent = message;
            }
        } catch (error) {
            log.error('设置提示词失败:', error);
            statusElement.textContent = i18n.t('prompts.loadingFailed', { error: error.message });
        }
    });

    // 添加MCP下拉菜单事件处理
    if (mcpDropdownBtn) {
        mcpDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 防止触发window的点击事件
            toggleMcpDropdown();
        });
    }

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
                log.error('切换语言失败:', error);
                statusElement.textContent = i18n.t('errors.languageChangeFailed', { error: error.message });
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
            log.error('打开设置窗口失败:', error);
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
        log.error('获取语言设置失败:', error);
    }

    // 执行初始化，init函数中已经包含了setupEventListeners的调用
    await init();

    // 初始化会话列表高度
    initSessionsContainerHeight();
});

// 监听语言更新事件
ipcRenderer.on('locale-updated', async () => {
    // 重新初始化UI
    initUI();

    // 重新加载会话列表
    await loadSessions();

    // 如果有当前会话，重新加载会话内容
    if (currentSessionId) {
        await loadSession(currentSessionId);
    }
});

// 修改调试功能
setTimeout(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        log.info('DOM完全加载后对侧边栏进行检查:');
        log.info('- sidebar元素:', sidebar);
        log.info('- sidebar样式:', window.getComputedStyle(sidebar));
        log.info('- sidebar宽度:', window.getComputedStyle(sidebar).width);
        log.info('- sidebar类名:', sidebar.classList);

        // 调整：不强制设置样式，避免覆盖toggleSidebar中的设置
        // sidebar.style.cssText = "width: 250px !important; min-width: 250px !important; transition: all 0.3s ease !important;";
        // 改为只设置过渡效果
        sidebar.style.transition = "all 0.3s ease";
        log.info('已设置过渡效果: ' + sidebar.style.transition);

        // 检查sidebarToggle按钮状态
        if (sidebarToggle) {
            log.info('- sidebarToggle元素:', sidebarToggle);
            log.info('- sidebarToggle样式:', window.getComputedStyle(sidebarToggle));
            log.info('- sidebarToggle可点击状态:', window.getComputedStyle(sidebarToggle).pointerEvents);

            // 确保按钮始终可点击
            sidebarToggle.style.pointerEvents = 'auto';
        }

        // 为调试添加一个全局函数
        window.debugToggleSidebar = function () {
            log.info('手动调用toggleSidebar');
            toggleSidebar();
        }

        log.info('调试函数已添加，可在控制台中使用 window.debugToggleSidebar() 手动切换侧边栏');
    }
}, 1000);

// 监听配置更新事件
ipcRenderer.on('config-updated', (event, data) => {
    log.info('收到配置更新:', data);
    if (data.models) {
        loadModels();
    }
    if (data.mcpConfig) {
        mcpServers = data.mcpConfig.servers || {};
        activeMcps = data.mcpConfig.activeMcps || [];
        updateMcpServersList();
        updateMcpDropdownButton();

        // 重新绑定MCP下拉菜单按钮事件
        debugMcpDropdown();
    }
    if (data.generalConfig) {
        // 更新语言选择
        if (languageSelect && data.generalConfig.language) {
            languageSelect.value = data.generalConfig.language;
        }

        // 更新主题设置
        if (data.generalConfig.theme) {
            localStorage.setItem('theme', data.generalConfig.theme);
            applyTheme(data.generalConfig.theme);
        }
    }

    // 确保样式一致性
    setTimeout(ensureConsistentDropdownStyles, 50);
});

// 监听MCP服务更新事件
ipcRenderer.on('mcp-server-updated', async (event, mcpConfig) => {
    log.info('收到MCP服务更新:', mcpConfig);
    mcpServers = mcpConfig.servers || {};
    activeMcps = mcpConfig.activeMcps || [];
    updateMcpServersList();
    updateMcpDropdownButton();

    // 重新绑定MCP下拉菜单按钮事件
    debugMcpDropdown();

    // 确保样式一致性
    setTimeout(ensureConsistentDropdownStyles, 50);
});

// 监听提示词配置更新事件
ipcRenderer.on('prompts-updated', async () => {
    log.info('收到提示词配置更新事件');
    await loadPrompts();

    // 确保样式一致性
    setTimeout(ensureConsistentDropdownStyles, 50);
});

// 初始化侧边栏拖动功能
function initSidebarResize() {
    const resizer = document.getElementById('sidebar-resizer');
    if (!resizer || !sidebar) return;

    // 设置拖动条初始位置
    updateResizerPosition();

    // 鼠标按下事件
    resizer.addEventListener('mousedown', (e) => {
        if (sidebarCollapsed) return; // 如果侧边栏已折叠，忽略拖动

        isResizing = true;
        resizer.classList.add('active');

        // 阻止默认事件和文本选择
        e.preventDefault();
        document.body.style.userSelect = 'none';

        // 鼠标移动事件
        const mouseMoveHandler = (e) => {
            if (!isResizing) return;

            let newWidth = e.clientX;

            // 限制宽度范围
            if (newWidth < 180) newWidth = 180;
            if (newWidth > 500) newWidth = 500;

            // 更新侧边栏和拖动条的位置
            sidebar.style.width = `${newWidth}px`;
            resizer.style.left = `${newWidth}px`;

            // 保存当前宽度
            lastSidebarWidth = newWidth;
        };

        // 鼠标释放事件
        const mouseUpHandler = () => {
            if (!isResizing) return;

            isResizing = false;
            resizer.classList.remove('active');

            // 恢复文本选择
            document.body.style.userSelect = '';

            // 保存当前宽度到本地存储
            localStorage.setItem('sidebarWidth', lastSidebarWidth.toString());

            // 移除临时事件监听器
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        };

        // 添加临时事件监听器
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    });
}

// 更新拖动条位置的辅助函数
function updateResizerPosition() {
    const resizer = document.getElementById('sidebar-resizer');
    if (!resizer) return;

    // 使用更可靠的方法计算拖动条位置
    if (sidebarCollapsed) {
        resizer.style.left = '40px';
        resizer.style.pointerEvents = 'none'; // 禁用拖动功能
    } else {
        // 使用computed style获取实际宽度，避免同步问题
        const computedStyle = window.getComputedStyle(sidebar);
        const sidebarWidth = parseFloat(computedStyle.width);

        // 确保设置准确的像素值
        resizer.style.left = `${sidebarWidth}px`;
        resizer.style.pointerEvents = 'auto'; // 确保拖动功能可用
    }
    log.info('更新拖动条位置:', resizer.style.left);
}

// 加载提示词列表
async function loadPrompts() {
    try {
        const prompts = await ipcRenderer.invoke('get-prompts');
        log.info('提示词列表:', prompts);

        // 获取当前选择的提示词
        const currentPrompt = await ipcRenderer.invoke('get-current-prompt');

        // 清空并重新填充下拉列表
        promptSelect.innerHTML = `<option value="add_new">${i18n.t('prompts.addNew')}</option>`;

        Object.entries(prompts || {}).forEach(([promptId, prompt]) => {
            const option = document.createElement('option');
            option.value = promptId;
            option.textContent = prompt.name;
            promptSelect.appendChild(option);
        });

        // 设置当前选中的提示词
        if (currentPrompt) {
            promptSelect.value = currentPrompt.id;
        } else {
            promptSelect.value = '';
        }
    } catch (error) {
        log.error('加载提示词列表失败:', error);
        statusElement.textContent = i18n.t('prompts.loadingFailed', { error: error.message });
    }
}

// 加载MCP服务列表
async function loadMcpServers() {
    try {
        const mcpConfig = await ipcRenderer.invoke('get-mcp-config');
        log.info('MCP服务配置:', mcpConfig);

        mcpServers = mcpConfig.servers || {};
        activeMcps = mcpConfig.activeMcps || [];

        updateMcpServersList();
        updateMcpDropdownButton();

        // 确保MCP下拉菜单按钮事件正常工作
        setTimeout(debugMcpDropdown, 100);
    } catch (error) {
        log.error('加载MCP服务列表失败:', error);
        statusElement.textContent = i18n.t('errors.loadMcpServerListFailed', { error: error.message });
    }
}

// 更新MCP服务列表UI
function updateMcpServersList() {
    log.info('更新MCP服务列表');
    if (!mcpDropdownContent) {
        log.error('MCP下拉菜单内容元素不存在');
        return;
    }

    // 清空当前选项
    while (mcpDropdownContent.firstChild) {
        mcpDropdownContent.removeChild(mcpDropdownContent.firstChild);
    }

    // 配置下拉菜单样式，确保向上展开且最多显示10个选项
    // Width is now controlled by CSS // 固定宽度，与其他选择框一致
    mcpDropdownContent.style.maxHeight = 'calc(10 * 36px)'; // 限制为10个项目的高度
    mcpDropdownContent.style.overflowY = 'auto';
    mcpDropdownContent.style.bottom = '100%'; // 确保向上展开
    mcpDropdownContent.style.top = 'auto';

    // 添加"添加服务"选项
    const addServerItem = document.createElement('div');
    addServerItem.className = 'mcp-server-item add-server-item';
    addServerItem.textContent = i18n.t('mcp.addServer');
    addServerItem.addEventListener('click', (e) => {
        openSettingsWindowWithTab('mcp');
        mcpDropdownContent.classList.remove('show'); // 点击后关闭下拉菜单
    });
    mcpDropdownContent.appendChild(addServerItem);

    // 添加服务选项
    if (Object.keys(mcpServers).length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'mcp-empty-message';
        emptyMessage.textContent = i18n.t('mcp.noServer');
        mcpDropdownContent.appendChild(emptyMessage);
        return;
    }

    // 遍历当前所有服务并添加到列表中
    Object.keys(mcpServers).forEach(serverId => {
        const serverConfig = mcpServers[serverId];
        const serverItem = document.createElement('div');
        serverItem.className = 'mcp-server-item';
        serverItem.dataset.name = serverId;

        // 创建复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = activeMcps.includes(serverId);
        checkbox.addEventListener('change', (e) => {
            toggleMcpServer(serverId, e.target.checked);
        });

        // 添加服务名称
        const label = document.createTextNode(serverConfig.name || serverId);

        // 组装元素
        serverItem.appendChild(checkbox);
        serverItem.appendChild(label);
        mcpDropdownContent.appendChild(serverItem);
    });

    // 添加鼠标滚轮事件处理
    if (!mcpDropdownContent.hasWheelHandler) {
        mcpDropdownContent.addEventListener('wheel', (event) => {
            // 阻止默认行为，防止页面滚动
            event.preventDefault();

            // 根据滚轮方向滚动下拉菜单
            mcpDropdownContent.scrollTop += event.deltaY;
        });
        mcpDropdownContent.hasWheelHandler = true;
    }
}

// 更新MCP下拉按钮显示
function updateMcpDropdownButton() {
    if (!mcpDropdownBtn) return;

    if (activeMcps.length === 0) {
        mcpDropdownBtn.textContent = i18n.t('mcp.server');
        mcpDropdownBtn.classList.remove('active');
    } else if (activeMcps.length === 1) {
        const serverId = activeMcps[0];
        const serverConfig = mcpServers[serverId];
        mcpDropdownBtn.textContent = serverConfig && serverConfig.name ? serverConfig.name : serverId;
        mcpDropdownBtn.classList.add('active');
    } else {
        mcpDropdownBtn.textContent = i18n.t('mcp.selectedServers', { count: activeMcps.length });
        mcpDropdownBtn.classList.add('active');
    }
}

// 切换MCP服务的激活状态
async function toggleMcpServer(serverId, isActive) {
    try {
        // 更新本地数组
        if (isActive && !activeMcps.includes(serverId)) {
            activeMcps.push(serverId);
        } else if (!isActive && activeMcps.includes(serverId)) {
            activeMcps = activeMcps.filter(id => id !== serverId);
        }

        // 更新UI
        const serverItem = mcpDropdownContent.querySelector(`.mcp-server-item[data-name="${serverId}"]`);
        if (serverItem) {
            if (isActive) {
                serverItem.classList.add('active');
            } else {
                serverItem.classList.remove('active');
            }
        }

        // 更新下拉按钮文本
        updateMcpDropdownButton();

        // 保存到配置
        const result = await ipcRenderer.invoke('set-active-mcps', activeMcps);
        if (!result) {
            throw new Error(i18n.t('errors.saveMcpServerFailed'));
        }
    } catch (error) {
        log.error('切换MCP服务激活状态失败:', error);
        statusElement.textContent = i18n.t('mcp.toggleFailed', { error: error.message });
        // 恢复UI状态（重新加载）
        await loadMcpServers();
    }
}

// 切换MCP下拉菜单的显示状态
function toggleMcpDropdown() {
    log.info('切换MCP下拉菜单显示状态');
    if (!mcpDropdownContent) {
        log.error('MCP下拉菜单内容元素不存在');
        return;
    }

    const isShowing = mcpDropdownContent.classList.contains('show');
    log.info('当前显示状态:', isShowing);

    if (isShowing) {
        mcpDropdownContent.classList.remove('show');
        log.info('隐藏下拉菜单');
    } else {
        // 配置下拉菜单样式，确保向上展开且最多显示10个选项
        mcpDropdownContent.style.maxHeight = 'calc(10 * 36px)'; // 限制为10个项目的高度
        mcpDropdownContent.style.overflowY = 'auto';
        mcpDropdownContent.style.bottom = '100%'; // 确保向上展开
        mcpDropdownContent.style.top = 'auto';

        mcpDropdownContent.classList.add('show');
        log.info('显示下拉菜单');

        // 添加鼠标滚轮事件以支持滚动
        if (!mcpDropdownContent.hasWheelHandler) {
            mcpDropdownContent.addEventListener('wheel', (event) => {
                // 阻止默认行为，防止页面滚动
                event.preventDefault();

                // 根据滚轮方向滚动下拉菜单
                mcpDropdownContent.scrollTop += event.deltaY;
            });
            mcpDropdownContent.hasWheelHandler = true;
        }
    }
}

// 点击页面其他位置关闭下拉菜单
window.addEventListener('click', (event) => {
    if (!event.target.matches('#mcp-dropdown-btn') && !event.target.closest('.mcp-dropdown-content')) {
        mcpDropdownContent.classList.remove('show');
    }
});

// 添加函数用于调试和修复MCP下拉菜单
function debugMcpDropdown() {
    log.info('重新绑定MCP下拉菜单事件...');

    // 重新获取元素引用，确保始终使用最新的DOM元素
    const dropdownBtn = document.getElementById('mcp-dropdown-btn');
    const dropdownContent = document.getElementById('mcp-dropdown-content');

    // 更新全局引用
    mcpDropdownBtn = dropdownBtn;
    mcpDropdownContent = dropdownContent;

    log.info('当前MCP下拉菜单按钮:', mcpDropdownBtn);
    log.info('当前MCP下拉菜单内容:', mcpDropdownContent);

    if (!mcpDropdownBtn) {
        log.error('MCP下拉菜单按钮不存在，无法绑定事件');
        return;
    }

    if (!mcpDropdownContent) {
        log.error('MCP下拉菜单内容不存在，无法完成功能');
        return;
    }

    // 移除所有现有的点击事件监听器
    const clone = mcpDropdownBtn.cloneNode(true);
    if (mcpDropdownBtn.parentNode) {
        mcpDropdownBtn.parentNode.replaceChild(clone, mcpDropdownBtn);
        log.info('成功替换了MCP按钮元素，移除了旧事件');
    } else {
        log.error('MCP按钮没有父节点，无法替换');
        return;
    }

    // 更新全局引用到新的DOM元素
    mcpDropdownBtn = document.getElementById('mcp-dropdown-btn');
    if (!mcpDropdownBtn) {
        log.error('替换后无法找到MCP按钮元素');
        return;
    }

    // 添加新的点击事件
    mcpDropdownBtn.addEventListener('click', (e) => {
        log.info('MCP按钮被点击 - 事件触发');
        e.stopPropagation();
        toggleMcpDropdown();
    });

    log.info('成功为MCP按钮添加了新的点击事件');
}

// 确保下拉选择框样式一致性
function ensureConsistentDropdownStyles() {
    log.info('确保下拉选择框样式一致性');

    // 确保MCP下拉菜单容器正确使用CSS样式而不是内联样式
    if (mcpDropdownContent) {
        // 清除可能的内联宽度样式
        mcpDropdownContent.style.removeProperty('width');

        // 确保其他样式正确设置
        mcpDropdownContent.style.maxHeight = 'calc(10 * 36px)';
        mcpDropdownContent.style.overflowY = 'auto';
        mcpDropdownContent.style.bottom = '100%';
        mcpDropdownContent.style.top = 'auto';
    }

    // 确保model-selector容器正确使用CSS样式
    const modelSelector = document.querySelector('.model-selector');
    if (modelSelector) {
        // 确保使用正确的显示方式
        modelSelector.style.display = 'flex';
        modelSelector.style.width = '100%';
    }

    // 移除所有下拉元素的固定宽度，使用CSS控制
    const dropdowns = modelSelector.querySelectorAll('select, .mcp-dropdown-btn');
    dropdowns.forEach(dropdown => {
        dropdown.style.removeProperty('width');
    });
}

// 主题切换功能
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');

    // 检查theme-toggle元素是否存在
    if (!themeToggle) {
        log.error('主题切换按钮未找到！主题切换功能初始化失败。');
        return; // 提前返回，避免在undefined上添加事件监听器
    }

    // 从后端获取主题设置
    ipcRenderer.invoke('get-theme').then(theme => {
        if (theme) {
            localStorage.setItem('theme', theme);
            applyTheme(theme);
        } else {
            // 如果后端没有设置，则使用本地存储的主题
            const savedTheme = localStorage.getItem('theme') || 'light';
            applyTheme(savedTheme);
        }
    }).catch(error => {
        // 如果获取失败，使用本地存储
        const savedTheme = localStorage.getItem('theme') || 'light';
        applyTheme(savedTheme);
    });

    // 创建主题菜单
    const themeMenu = document.createElement('div');
    themeMenu.className = 'theme-menu';
    themeMenu.innerHTML = `
        <div class="theme-menu-item" data-theme-option="light">浅色</div>
        <div class="theme-menu-item" data-theme-option="dark">深色</div>
        <div class="theme-menu-item" data-theme-option="auto">自动</div>
    `;
    themeMenu.style.display = 'none';
    document.body.appendChild(themeMenu);

    // 系统主题变化监听器
    const systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemThemeMediaQuery.addEventListener('change', (e) => {
        if (localStorage.getItem('theme') === 'auto') {
            const newTheme = e.matches ? 'dark' : 'light';
            log.info(`系统主题变化，新主题: ${newTheme}`);
            applyTheme('auto', newTheme);
        }
    });

    // 切换主题菜单显示
    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();

        // 显示或隐藏菜单
        if (themeMenu.style.display === 'none') {
            const rect = themeToggle.getBoundingClientRect();
            themeMenu.style.top = (rect.bottom + 5) + 'px';
            themeMenu.style.right = (window.innerWidth - rect.right) + 'px';
            themeMenu.style.display = 'block';

            // 标记当前选中的主题
            const currentTheme = localStorage.getItem('theme') || 'light';
            themeMenu.querySelectorAll('.theme-menu-item').forEach(item => {
                item.classList.toggle('active', item.dataset.themeOption === currentTheme);
            });
        } else {
            themeMenu.style.display = 'none';
        }
    });

    // 点击菜单项切换主题
    themeMenu.addEventListener('click', (e) => {
        if (e.target.classList.contains('theme-menu-item')) {
            const newTheme = e.target.dataset.themeOption;
            localStorage.setItem('theme', newTheme);

            if (newTheme === 'auto') {
                // 自动模式下，根据系统主题设置
                const systemTheme = systemThemeMediaQuery.matches ? 'dark' : 'light';
                applyTheme(newTheme, systemTheme);
            } else {
                applyTheme(newTheme);
            }

            // 通知主进程当前主题更改，以便更新配置
            ipcRenderer.send('theme-changed', newTheme);
            themeMenu.style.display = 'none';
        }
    });

    // 点击页面其他区域关闭菜单
    document.addEventListener('click', () => {
        themeMenu.style.display = 'none';
    });
}

// 应用主题
function applyTheme(themeMode, actualTheme = null) {
    // 更新主题类
    document.body.classList.remove('light-theme', 'dark-theme', 'system-theme');
    document.body.classList.add(`${themeMode}-theme`);

    // 同时设置data-theme属性，这是CSS样式实际使用的选择器
    const actualThemeToApply = themeMode === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : themeMode;
    document.documentElement.setAttribute('data-theme', actualThemeToApply);

    // 更新代码高亮主题
    updateCodeHighlightTheme(actualTheme || themeMode);

    // 更新主题图标
    updateThemeIcon(themeMode);

    log.info(`主题应用完成: ${themeMode}`);
}

// 更新主题切换按钮图标
function updateThemeIcon(themeMode) {
    const themeToggleIcon = document.getElementById('theme-toggle-icon');
    if (themeMode === 'dark') {
        themeToggleIcon.textContent = '☀️';
    } else if (themeMode === 'light') {
        themeToggleIcon.textContent = '🌒';
    } else if (themeMode === 'auto') {
        themeToggleIcon.textContent = '🌓';
    }
}

// 更新代码高亮主题
function updateCodeHighlightTheme(theme) {
    log.info(`开始更新代码高亮主题: ${theme}`);

    // 记录当前DOM状态
    const totalCodeBlocks = document.querySelectorAll('pre code').length;
    log.info(`当前页面共有 ${totalCodeBlocks} 个代码块需要处理`);

    // 确定主题样式文件的路径
    let stylePath = theme === 'dark'
        ? 'assets/highlight.js/styles/dracula.min.css'
        : 'assets/highlight.js/styles/github.min.css';

    // 预加载新的样式表，避免切换时的闪烁

    // 优化: 缓存已加载过的主题，避免重复加载
    const cacheKey = `theme_cache_${theme}`;
    if (!window[cacheKey]) {
        log.info(`主题 ${theme} 未缓存，开始加载和缓存`);
        // 使用fetch API预加载CSS内容
        fetch(stylePath)
            .then(response => response.text())
            .then(cssContent => {
                // 缓存CSS内容
                window[cacheKey] = cssContent;

                // 创建新样式元素并立即应用
                const styleElement = document.createElement('style');
                styleElement.id = 'highlight-theme';
                styleElement.textContent = cssContent;

                // 替换旧样式表
                highlightTheme.parentNode.replaceChild(styleElement, highlightTheme);

                log.info('高亮样式内容加载并应用完成');

                // 仅处理可见区域内的代码块
                applyHighlightToVisibleBlocks(totalCodeBlocks);
            })
            .catch(error => {
                log.error(`加载主题 ${theme} 失败:`, error);
            });
    } else {
        log.info(`使用缓存的主题 ${theme}`);
        // 直接使用缓存的CSS内容
        const styleElement = document.createElement('style');
        styleElement.id = 'highlight-theme';
        styleElement.textContent = window[cacheKey];

        // 替换旧样式表
        highlightTheme.parentNode.replaceChild(styleElement, highlightTheme);

        log.info('缓存的高亮样式内容已应用');

        // 仅处理可见区域内的代码块
        applyHighlightToVisibleBlocks(totalCodeBlocks);
    }
}

function applyHighlightToVisibleBlocks(totalCodeBlocks) {
    if (totalCodeBlocks <= 0) return;

    const visibleCodeBlocks = Array.from(document.querySelectorAll('pre code'))
        // 过滤出可见区域内的代码块
        .filter(block => {
            const rect = block.getBoundingClientRect();
            return (
                rect.top >= -window.innerHeight &&
                rect.bottom <= window.innerHeight * 2
            );
        });

    log.info(`过滤出 ${visibleCodeBlocks.length} 个可见区域内的代码块进行立即处理`);

    // 立即处理可见区域内的代码块
    visibleCodeBlocks.forEach(block => {
        try {
            hljs.highlightElement(block);
        } catch (error) {
            log.error('高亮显示代码块失败:', error);
        }
    });

    // 如果有额外的不可见代码块，使用 IntersectionObserver 延迟处理
    if (visibleCodeBlocks.length < totalCodeBlocks) {
        log.info(`还有 ${totalCodeBlocks - visibleCodeBlocks.length} 个不可见代码块将延迟处理`);

        // 使用 IntersectionObserver 处理剩余代码块
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const block = entry.target;
                    try {
                        hljs.highlightElement(block);
                    } catch (error) {
                        log.error('延迟高亮显示代码块失败:', error);
                    }
                    // 处理完毕后取消观察
                    observer.unobserve(block);
                }
            });
        }, {
            root: null,
            rootMargin: '100px', // 在元素进入可视区域前100px开始处理
            threshold: 0.1        // 元素有10%进入可视区域时处理
        });

        // 获取所有不可见代码块并开始观察
        const hiddenCodeBlocks = Array.from(document.querySelectorAll('pre code'))
            .filter(block => !visibleCodeBlocks.includes(block));

        hiddenCodeBlocks.forEach(block => observer.observe(block));
    }
}

// 监听主题变化
ipcRenderer.on('apply-theme', (event, theme) => {
    document.documentElement.setAttribute('data-theme', theme === 'auto' ?
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme);
    localStorage.setItem('theme', theme);
    updateThemeIcon(theme);
    updateCodeHighlightTheme(theme === 'auto' ?
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme);
});

// 监听系统主题变化
ipcRenderer.on('system-theme-changed', (event, isDarkMode) => {
    if (localStorage.getItem('theme') === 'auto') {
        const newTheme = isDarkMode ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        updateCodeHighlightTheme(newTheme);
    }
});

// 打开关于窗口
function openAboutWindow() {
    log.info('Opening about window');
    statusElement.textContent = i18n.t('ui.status.openingAboutWindow');

    // 调用后端方法打开关于窗口
    ipcRenderer.invoke('open-about-window')
        .then(() => {
            statusElement.textContent = i18n.t('ui.status.ready');
        })
        .catch(error => {
            log.error('打开关于窗口失败:', error);
            statusElement.textContent = i18n.t('errors.openAboutWindowFailed', { error: error.message });
        });
}

// 将函数在window中暴露，以便HTML中调用
window.openAboutWindow = openAboutWindow;

// 将toggleSidebar函数暴露到全局，以便在HTML中直接调用
window.toggleSidebar = toggleSidebar;

// 将openSettingsWindow函数暴露到全局，以便在HTML中调用
window.openSettingsWindow = openSettingsWindow;

/**
 * 检查应用更新
 * @param {boolean} force 是否强制检查更新
 */
function checkForUpdates(force = false) {
    log.info('检查应用更新...');
    statusElement.textContent = i18n.t('ui.status.checkingForUpdates', '正在检查更新...');

    // 调用主进程中的检查更新方法
    ipcRenderer.invoke('check-for-updates', force)
        .then(result => {
            if (result.hasUpdate) {
                // 显示更新通知
                showUpdateNotification(result);
                statusElement.textContent = i18n.t('ui.status.updateAvailable', '发现新版本 {version}', { version: result.version });
            } else {
                statusElement.textContent = i18n.t('ui.status.noUpdateAvailable', '已是最新版本');
                // 3秒后恢复状态显示
                setTimeout(() => {
                    statusElement.textContent = i18n.t('ui.status.ready');
                }, 3000);
            }
        })
        .catch(error => {
            log.error('检查更新失败:', error);
            statusElement.textContent = i18n.t('ui.status.error', { error: '检查更新失败' });
            // 3秒后恢复状态显示
            setTimeout(() => {
                statusElement.textContent = i18n.t('ui.status.ready');
            }, 3000);
        });
}

/**
 * 显示更新通知
 * @param {object} updateInfo 更新信息
 */
function showUpdateNotification(updateInfo) {
    // 检查是否已存在通知窗口
    const existingNotification = document.querySelector('.update-notification');
    if (existingNotification) {
        // 已存在通知窗口，更新其内容
        const versionElement = existingNotification.querySelector('.update-notification-details p:nth-child(1) strong');
        if (versionElement) {
            versionElement.nextSibling.textContent = `: ${updateInfo.version}`;
        }

        const dateElement = existingNotification.querySelector('.update-notification-details p:nth-child(2) strong');
        if (dateElement) {
            dateElement.nextSibling.textContent = `: ${updateInfo.date}`;
        }

        const descElement = existingNotification.querySelector('.update-notification-details p:nth-child(3) strong');
        if (descElement) {
            descElement.nextSibling.textContent = `: ${updateInfo.desc}`;
        }

        // 通知已更新内容，刷新关闭计时器
        const existingTimerId = existingNotification.getAttribute('data-timer-id');
        if (existingTimerId) {
            clearTimeout(parseInt(existingTimerId));
        }

        // 重新设置30秒后自动关闭
        const newTimerId = setTimeout(() => {
            if (document.body.contains(existingNotification)) {
                const styleElement = document.getElementById('update-notification-style');
                if (styleElement) {
                    document.head.removeChild(styleElement);
                }
                document.body.removeChild(existingNotification);

                // 执行清理函数
                const cleanupFn = window.updateNotificationCleanup;
                if (typeof cleanupFn === 'function') {
                    cleanupFn();
                }
            }
        }, 30000);

        existingNotification.setAttribute('data-timer-id', newTimerId);

        return; // 已更新现有通知，不需要继续创建新通知
    }

    // 获取当前主题
    const themeMode = localStorage.getItem('theme') || 'light';
    const isDarkMode = themeMode === 'dark' ||
        (themeMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    notification.innerHTML = `
        <div class="update-notification-content">
            <div class="update-notification-title">
                <i class="fas fa-arrow-alt-circle-up"></i> 
                ${i18n.t('ui.update.newVersion', '发现新版本')}
            </div>
            <div class="update-notification-details">
                <p><strong>${i18n.t('ui.update.version', '版本')}</strong>: ${updateInfo.version}</p>
                <p><strong>${i18n.t('ui.update.date', '发布日期')}</strong>: ${updateInfo.date}</p>
                <p><strong>${i18n.t('ui.update.description', '更新内容')}</strong>: ${updateInfo.desc}</p>
            </div>
            <div class="update-notification-actions">
                <button class="update-notification-btn close-btn">
                    ${i18n.t('ui.update.later', '稍后提醒')}
                </button>
                <button class="update-notification-btn download-btn">
                    ${i18n.t('ui.update.download', '前往下载')}
                </button>
            </div>
        </div>
    `;

    // 添加到页面
    document.body.appendChild(notification);

    // 添加样式
    const style = document.createElement('style');
    style.id = 'update-notification-style';
    style.textContent = `
        .update-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            border-radius: 8px;
            z-index: 1000;
            max-width: 350px;
            overflow: hidden;
            animation: slide-in 0.3s ease-out;
        }
        
        .update-notification[data-theme="light"] {
            background-color: white;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        .update-notification[data-theme="dark"] {
            background-color: var(--dropdown-bg, #2d2d2d);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        @keyframes slide-in {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        .update-notification-content {
            padding: 15px;
        }
        
        .update-notification-title {
            font-size: 16px;
            font-weight: bold;
            color: #4caf50;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .update-notification[data-theme="light"] .update-notification-details {
            color: #555;
        }
        
        .update-notification[data-theme="dark"] .update-notification-details {
            color: var(--text-color, #e0e0e0);
        }
        
        .update-notification-details {
            margin-bottom: 15px;
            font-size: 14px;
        }
        
        .update-notification-details p {
            margin: 5px 0;
        }
        
        .update-notification-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }
        
        .update-notification-btn {
            padding: 8px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        
        .update-notification[data-theme="light"] .close-btn {
            background-color: #f5f5f5;
            color: #555;
        }
        
        .update-notification[data-theme="dark"] .close-btn {
            background-color: #444;
            color: #e0e0e0;
        }
        
        .download-btn {
            background-color: #4caf50;
            color: white;
        }
        
        .update-notification[data-theme="light"] .close-btn:hover {
            background-color: #e0e0e0;
        }
        
        .update-notification[data-theme="dark"] .close-btn:hover {
            background-color: #555;
        }
        
        .download-btn:hover {
            background-color: #388e3c;
        }
    `;
    document.head.appendChild(style);

    // 添加事件监听
    const closeBtn = notification.querySelector('.close-btn');
    const downloadBtn = notification.querySelector('.download-btn');

    const removeNotification = () => {
        if (document.body.contains(notification)) {
            document.body.removeChild(notification);
            document.head.removeChild(style);

            // 执行清理函数
            if (typeof window.updateNotificationCleanup === 'function') {
                window.updateNotificationCleanup();
                window.updateNotificationCleanup = null;
            }
        }
    };

    closeBtn.addEventListener('click', () => {
        // 设置稍后提醒标记
        ipcRenderer.invoke('set-remind-later').then(() => {
            log.info('已设置稍后提醒，24小时内不再检查更新');
        }).catch(error => {
            log.error('设置稍后提醒失败:', error);
        });
        removeNotification();
    });

    downloadBtn.addEventListener('click', () => {
        // 打开下载页面
        ipcRenderer.invoke('open-external-url', 'https://mindcomplete.me/download');
        removeNotification();
    });

    // 30秒后自动关闭
    const timerId = setTimeout(() => {
        removeNotification();
    }, 30000);

    // 保存定时器ID，以便可以在更新时重置
    notification.setAttribute('data-timer-id', timerId);

    // 监听系统主题变化
    const updateTheme = () => {
        const currentThemeMode = localStorage.getItem('theme') || 'light';
        const currentIsDarkMode = currentThemeMode === 'dark' ||
            (currentThemeMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        notification.setAttribute('data-theme', currentIsDarkMode ? 'dark' : 'light');
    };

    // 添加监听器以响应主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme);

    // 监听主题变化
    const themeObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.attributeName === 'data-theme') {
                updateTheme();
            }
        }
    });

    themeObserver.observe(document.documentElement, { attributes: true });

    // 在通知关闭时清理监听器和观察器
    const cleanup = () => {
        window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', updateTheme);
        themeObserver.disconnect();
    };

    // 将清理函数存储在全局变量中，以便在更新通知内容时重用
    window.updateNotificationCleanup = cleanup;
}

// 将checkForUpdates函数暴露到全局，以便在HTML中调用
window.checkForUpdates = checkForUpdates;

// 初始化侧边栏垂直拖动调整功能
function initSidebarVerticalResize() {
    const sidebar = document.getElementById('sidebar');
    const sidebarUpper = document.querySelector('.sidebar-upper');
    const sidebarLower = document.getElementById('sidebar-footer');
    const verticalResizer = document.getElementById('sidebar-vertical-resizer');

    if (!verticalResizer || !sidebarUpper || !sidebarLower) {
        log.error('初始化侧边栏垂直拖动功能失败: 找不到必要元素');
        return;
    }

    // 保存上次拖动位置
    let lastVerticalPosition = 0;

    // 保存初始高度比例
    let initialUpperHeight = sidebarUpper.clientHeight;
    let initialLowerHeight = sidebarLower.clientHeight;

    // 从本地存储加载上次保存的高度比例
    const savedUpperHeightPercent = localStorage.getItem('sidebarUpperHeightPercent');
    if (savedUpperHeightPercent) {
        const percent = parseFloat(savedUpperHeightPercent);
        const sidebarHeight = sidebar.clientHeight;
        const upperHeight = (sidebarHeight - 5) * (percent / 100); // 减去分隔条高度
        const lowerHeight = (sidebarHeight - 5) * ((100 - percent) / 100);

        // 应用保存的高度比例
        sidebarUpper.style.height = `${upperHeight}px`;
        sidebarLower.style.height = `${lowerHeight}px`;
    }

    // 鼠标按下事件处理
    verticalResizer.addEventListener('mousedown', (e) => {
        if (sidebar.classList.contains('collapsed')) return;

        e.preventDefault();
        verticalResizer.classList.add('active');
        lastVerticalPosition = e.clientY;
        initialUpperHeight = sidebarUpper.clientHeight;
        initialLowerHeight = sidebarLower.clientHeight;

        // 添加鼠标移动和松开事件监听
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    });

    // 鼠标移动事件处理
    const mouseMoveHandler = (e) => {
        if (sidebar.classList.contains('collapsed')) return;

        const deltaY = e.clientY - lastVerticalPosition;
        const newUpperHeight = initialUpperHeight + deltaY;
        const newLowerHeight = initialLowerHeight - deltaY;

        // 将最小高度限制降低，只保留30px防止区域完全消失
        if (newUpperHeight < 30 || newLowerHeight < 30) return;

        // 应用新高度
        sidebarUpper.style.height = `${newUpperHeight}px`;
        sidebarLower.style.height = `${newLowerHeight}px`;

        // 移除最大/最小高度限制
        sidebarLower.style.maxHeight = 'none';
        sidebarLower.style.minHeight = 'auto';

        // 更新会话列表高度
        const sessionsContainer = document.getElementById('sessions-container');
        if (sessionsContainer) {
            const sidebarHeader = document.querySelector('.sidebar-header');
            const headerHeight = sidebarHeader ? sidebarHeader.offsetHeight : 40;
            const containerHeight = newUpperHeight - headerHeight;
            sessionsContainer.style.height = `${containerHeight}px`;
            sessionsContainer.style.flex = '0 0 auto';
        }

        // 计算并保存高度百分比
        const totalUsableHeight = initialUpperHeight + initialLowerHeight;
        const upperHeightPercent = (newUpperHeight / totalUsableHeight) * 100;
        localStorage.setItem('sidebarUpperHeightPercent', upperHeightPercent.toString());
    };

    // 鼠标松开事件处理
    const mouseUpHandler = () => {
        verticalResizer.classList.remove('active');
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
    };

    // 窗口大小变化时，保持比例
    window.addEventListener('resize', () => {
        if (sidebar.classList.contains('collapsed')) return;

        const savedPercent = localStorage.getItem('sidebarUpperHeightPercent');
        if (savedPercent) {
            const percent = parseFloat(savedPercent);
            const sidebarHeight = sidebar.clientHeight;
            const totalUsableHeight = sidebarHeight - 5; // 减去分隔条高度
            const upperHeight = totalUsableHeight * (percent / 100);
            const lowerHeight = totalUsableHeight * ((100 - percent) / 100);

            sidebarUpper.style.height = `${upperHeight}px`;
            sidebarLower.style.height = `${lowerHeight}px`;

            // 移除最大/最小高度限制
            sidebarLower.style.maxHeight = 'none';
            sidebarLower.style.minHeight = 'auto';

            // 确保会话列表高度与sidebar-upper底部对齐
            const sessionsContainer = document.getElementById('sessions-container');
            if (sessionsContainer) {
                const sidebarHeader = document.querySelector('.sidebar-header');
                const headerHeight = sidebarHeader ? sidebarHeader.offsetHeight : 40;

                // 直接计算内容区域高度并设置
                const containerHeight = upperHeight - headerHeight;
                sessionsContainer.style.flex = '0 0 auto'; // 确保不伸缩
                sessionsContainer.style.height = containerHeight + 'px';
                sessionsContainer.style.maxHeight = containerHeight + 'px';
                sessionsContainer.style.minHeight = containerHeight + 'px';

                log.info('窗口调整大小，更新会话列表高度:', containerHeight);
            }
        }
    });
}

// Add sidebar resizing functionality
function setupSidebarResizing() {
    const sidebar = document.querySelector('.sidebar');
    const sidebarResizer = document.querySelector('.sidebar-resizer');
    const sidebarVerticalResizer = document.querySelector('.sidebar-vertical-resizer');
    const sidebarUpper = document.querySelector('.sidebar-upper');
    const sidebarLower = document.querySelector('.sidebar-lower');

    if (!sidebar || !sidebarResizer || !sidebarVerticalResizer) {
        log.error('无法找到侧边栏拖动所需的元素!');
        return;
    }

    log.info('正在初始化侧边栏拖动功能...');

    // 更可靠的拖动条位置更新函数
    function syncResizerPosition() {
        if (!sidebar || !sidebarResizer) return;

        if (sidebar.classList.contains('collapsed')) {
            sidebarResizer.style.left = '40px';
        } else {
            // 使用computed style获取实际宽度，避免可能的同步问题
            const computedStyle = window.getComputedStyle(sidebar);
            const sidebarWidth = parseFloat(computedStyle.width);

            // 确保设置准确的像素值
            sidebarResizer.style.left = `${sidebarWidth}px`;
            log.info('同步更新拖动条位置:', sidebarWidth);
        }
    }

    // 设置拖动条初始位置
    syncResizerPosition();

    // 确保拖动条可以触发事件 - 这是关键修复
    if (!sidebar.classList.contains('collapsed')) {
        sidebarResizer.style.pointerEvents = 'auto';
        log.info('设置拖动条事件为可用状态');
    }

    // 移除可能已存在的事件监听器以避免重复绑定
    sidebarResizer.removeEventListener('mousedown', handleResizerMouseDown);
    document.removeEventListener('mousemove', handleResizerMouseMove);
    document.removeEventListener('mouseup', handleResizerMouseUp);

    sidebarVerticalResizer.removeEventListener('mousedown', handleVerticalResizerMouseDown);
    document.removeEventListener('mousemove', handleVerticalResizerMouseMove);
    document.removeEventListener('mouseup', handleVerticalResizerMouseUp);

    // 添加新的事件监听器
    sidebarResizer.addEventListener('mousedown', handleResizerMouseDown);
    sidebarVerticalResizer.addEventListener('mousedown', handleVerticalResizerMouseDown);

    // 水平拖动相关变量
    let isResizing = false;
    // 垂直拖动相关变量
    let isVerticalResizing = false;

    // 鼠标按下拖动条事件处理函数
    function handleResizerMouseDown(e) {
        // 只有在侧边栏非折叠状态下才能拖动
        if (sidebar.classList.contains('collapsed')) return;

        log.info('拖动条鼠标按下事件触发');
        isResizing = true;
        sidebar.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();

        // 添加临时事件监听器
        document.addEventListener('mousemove', handleResizerMouseMove);
        document.addEventListener('mouseup', handleResizerMouseUp);
    }

    // 鼠标移动事件处理函数
    function handleResizerMouseMove(e) {
        if (!isResizing) return;

        // 确保侧边栏非折叠状态
        if (sidebar.classList.contains('collapsed')) {
            isResizing = false;
            sidebar.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            return;
        }

        const newWidth = e.clientX;

        // Apply min/max constraints
        if (newWidth >= 180 && newWidth <= 500) {
            sidebar.style.width = newWidth + 'px';
            sidebarResizer.style.left = newWidth + 'px';

            // 保存当前宽度，以便在切换折叠/展开状态时使用
            lastSidebarWidth = newWidth;
            log.info('拖动调整侧边栏宽度:', newWidth);
        }
    }

    // 鼠标释放事件处理函数
    function handleResizerMouseUp() {
        if (!isResizing) return;

        log.info('拖动完成，保存宽度:', lastSidebarWidth);
        isResizing = false;
        sidebar.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // 移除临时事件监听器
        document.removeEventListener('mousemove', handleResizerMouseMove);
        document.removeEventListener('mouseup', handleResizerMouseUp);

        // Save the width in local storage for persistence
        if (!sidebar.classList.contains('collapsed')) {
            localStorage.setItem('sidebarWidth', lastSidebarWidth.toString());
            // 确保拖动完成后位置准确
            syncResizerPosition();
        }
    }

    // 垂直分隔条的鼠标按下事件处理函数
    function handleVerticalResizerMouseDown(e) {
        // 只在侧边栏非折叠状态下才能进行垂直拖动
        if (sidebar.classList.contains('collapsed')) return;

        log.info('垂直拖动条鼠标按下事件触发');
        isVerticalResizing = true;
        sidebarUpper.classList.add('resizing');
        sidebarLower.classList.add('resizing');
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();

        // 添加临时事件监听器
        document.addEventListener('mousemove', handleVerticalResizerMouseMove);
        document.addEventListener('mouseup', handleVerticalResizerMouseUp);
    }

    // 垂直拖动的鼠标移动事件处理函数
    function handleVerticalResizerMouseMove(e) {
        if (!isVerticalResizing) return;

        // 确保侧边栏非折叠状态
        if (sidebar.classList.contains('collapsed')) {
            isVerticalResizing = false;
            sidebarUpper.classList.remove('resizing');
            sidebarLower.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            return;
        }

        const sidebarRect = sidebar.getBoundingClientRect();
        const upperHeight = e.clientY - sidebarRect.top;
        const lowerHeight = sidebarRect.height - upperHeight - sidebarVerticalResizer.offsetHeight;

        // 移除最小高度限制，允许上下区域自由调整高度
        // 只保留最小值30px的限制，防止区域完全消失
        if (upperHeight >= 30 && lowerHeight >= 30) {
            sidebarUpper.style.height = upperHeight + 'px';
            sidebarLower.style.height = lowerHeight + 'px';

            // 移除最大/最小高度限制
            sidebarLower.style.maxHeight = 'none';
            sidebarLower.style.minHeight = 'auto';

            // 确保会话列表底部与sidebar-upper底部对齐
            const sessionsContainer = document.getElementById('sessions-container');
            if (sessionsContainer) {
                const sidebarHeader = document.querySelector('.sidebar-header');
                const headerHeight = sidebarHeader ? sidebarHeader.offsetHeight : 40;

                // 直接计算内容区域高度并设置，移除所有可能冲突的样式
                const containerHeight = upperHeight - headerHeight;
                sessionsContainer.style.flex = '0 0 auto'; // 确保不伸缩
                sessionsContainer.style.height = containerHeight + 'px';
                sessionsContainer.style.maxHeight = containerHeight + 'px';
                sessionsContainer.style.minHeight = containerHeight + 'px';

                log.info('更新会话列表高度:', containerHeight);
            }

            log.info('拖动调整垂直比例，上部高度:', upperHeight, '下部高度:', lowerHeight);
        }
    }

    // 垂直拖动的鼠标释放事件处理函数
    function handleVerticalResizerMouseUp() {
        if (!isVerticalResizing) return;

        log.info('垂直拖动完成');
        isVerticalResizing = false;
        sidebarUpper.classList.remove('resizing');
        sidebarLower.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // 移除临时事件监听器
        document.removeEventListener('mousemove', handleVerticalResizerMouseMove);
        document.removeEventListener('mouseup', handleVerticalResizerMouseUp);

        // 计算并保存高度百分比，以便恢复时使用
        if (!sidebar.classList.contains('collapsed')) {
            const totalHeight = sidebar.clientHeight - sidebarVerticalResizer.offsetHeight;
            const upperHeightPercent = (sidebarUpper.clientHeight / totalHeight) * 100;
            localStorage.setItem('sidebarUpperHeightPercent', upperHeightPercent.toString());
            log.info('保存垂直比例:', upperHeightPercent);
        }
    }

    // Restore saved width on page load if exists
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth && !sidebar.classList.contains('collapsed')) {
        sidebar.style.width = savedWidth;
        sidebarResizer.style.left = savedWidth;
        log.info('从存储恢复侧边栏宽度:', savedWidth);
    }

    // DOM完全加载后再次确认拖动条位置
    window.addEventListener('load', () => {
        // 延迟执行，确保所有CSS和布局已完成
        setTimeout(() => {
            syncResizerPosition();
            log.info('DOM完全加载后再次同步拖动条位置');
        }, 100);
    });

    // 每当侧边栏宽度变化时更新拖动条位置
    const resizeObserver = new ResizeObserver(() => {
        if (!sidebar.classList.contains('collapsed') && !isResizing) {
            syncResizerPosition();
        }
    });

    // 监视侧边栏大小变化
    resizeObserver.observe(sidebar);
}

// 初始化会话列表高度
function initSessionsContainerHeight() {
    const sidebar = document.getElementById('sidebar');
    const sidebarUpper = document.querySelector('.sidebar-upper');
    const sessionsContainer = document.getElementById('sessions-container');
    const sidebarHeader = document.querySelector('.sidebar-header');

    if (!sidebar || !sidebarUpper || !sessionsContainer || !sidebarHeader) {
        log.error('初始化会话列表高度失败：找不到必要的DOM元素');
        return;
    }

    // 获取sidebar-header的实际高度
    const headerHeight = sidebarHeader.offsetHeight;

    // 计算会话列表应有的高度 = sidebar-upper高度 - header高度
    const upperHeight = sidebarUpper.offsetHeight;
    const containerHeight = upperHeight - headerHeight;

    // 直接计算内容区域高度并设置
    sessionsContainer.style.flex = '0 0 auto'; // 确保不伸缩
    sessionsContainer.style.height = containerHeight + 'px';
    sessionsContainer.style.maxHeight = containerHeight + 'px';
    sessionsContainer.style.minHeight = containerHeight + 'px';

    log.info('初始化会话列表高度：', containerHeight);
}

/**
 * 发送工具命令并显示执行过程
 * 
 * 此函数用于执行工具命令并在聊天界面中显示工具执行的过程和结果。
 * 它会创建工具类型的消息来展示命令执行状态，并在执行完成后显示结果。
 * 
 * @param {string} command - 要执行的工具命令
 * @param {string} toolName - 工具名称，将显示在消息发送者位置
 * @returns {Promise<void>} - 异步执行结果
 */
async function sendToolCommand(command, toolName) {
    try {
        // 记录工具命令的执行，便于调试
        log.info(`执行工具命令: ${command}, 工具: ${toolName}`);

        // 显示工具执行中的状态消息
        addMessage(`正在执行: \`${command}\``, 'mcpTool');

        // 这里可以调用主进程执行命令
        // 通常通过IPC通道与主进程通信，例如:
        // const result = await ipcRenderer.invoke('execute-tool-command', command);

        // 工具执行完成后，添加结果消息
        // addMessage(`执行结果: \n\`\`\`\n${result}\n\`\`\``, 'mcpTool');

        // 注意：上面的代码被注释掉了，因为这是一个示例函数
        // 在实际使用中，需要取消注释并实现与主进程的通信
    } catch (error) {
        // 记录错误信息
        log.error(`工具命令执行失败: ${error.message}`);

        // 显示错误消息，便于用户了解执行状态
        addMessage(`执行失败: ${error.message}`, 'mcpTool');
    }
}
