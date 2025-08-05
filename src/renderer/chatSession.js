/**
 * chatService.js
 * 聊天服务模块
 *
 * 该模块负责处理聊天相关的所有功能，包括：
 * - 消息的发送和接收
 * - 消息的显示和更新
 * - Markdown和代码块的处理
 * - 工具授权管理
 *
 * 通过将聊天功能从renderer.js中分离出来，提高了代码的模块化和可维护性
 */

const { ipcRenderer } = require('electron');
const Logger = require('../main/logger');
const log = new Logger('chatService');
const i18n = require('../locales/i18n');
const markdownRenderer = require('./utils/markdownRenderer');
const sidebarSessionService = require('./sidebarSession');
const modelService = require('./modelService');
const promptService = require('./promptService');
const mcpServer = require('./mcpServerService');

/**
 * 聊天服务类
 * 负责处理消息的发送、接收和显示
 */
class ChatSessionService {
    constructor(sessionId) {
        // 会话对应的标签id 用于关联到特定标签及其输入、选择框
        this.tabId = null;

        // 状态
        this.statusElement = document.getElementById('status');

        // session
        this.sessionId = sessionId;
        this.data = null;

        // 用于跟踪当前是否有AI正在生成回复
        this.isGenerating = false;

        /**
         * 单个请求的响应消息
         * @type {Map<string, { id: string, { msgId: string, element: HTMLElement } } }>}
         */
        this.responses = new Map();

        this.setEventListeners();
    }

    setSessionNameChangeCallback(callback) {
        this.sessionNameChangeCallback = callback;
    }

    async sessionNameChange(newSessionName) {
        log.info(`会话 ${this.sessionId} 重命名: ${newSessionName}`)
        await ipcRenderer.invoke('rename-session', this.sessionId, newSessionName);

        if (this.sessionNameChangeCallback) {
            this.sessionNameChangeCallback(this.sessionId, newSessionName);
        }
    }

    setResponseMessages(rspId, msgId, role, content, roleName, serverName, serverId) {
        if (!this.responses[rspId]) {
            // 创建响应容器，用于包含同一个响应的所有消息
            const responseContainer = document.createElement('div');
            responseContainer.className = 'response-container';
            this.chatMessages.appendChild(responseContainer);

            this.responses[rspId] = {
                id: rspId,
                messages: {},
                container: responseContainer
            };
        }

        let rsp = this.responses[rspId];
        let msgElement = rsp.messages[msgId]?.element || null;
        if (!msgElement) {
            // 根据消息类型添加消息
            // 如果是工具授权请求，需要包含授权按钮
            if (role === 'tool-auth') {
                msgElement = this.addMessageToContainer('', role, rsp.container, roleName, serverName, {
                    toolName: roleName,
                    serverId: serverId,
                    serverName: serverName
                });
            } else {
                msgElement = this.addMessageToContainer('', role, rsp.container, roleName, serverName);
            }
            rsp.messages[msgId] = { element: msgElement };
        }

        const processedText = this.preprocessCodeBlocks(content);

        // 如果是工具调用消息，更新发送者显示
        if (role === 'tool') {
            // 查找消息元素的父元素直到message元素
            let parentElement = msgElement;
            while (parentElement && !parentElement.classList.contains('message')) {
                parentElement = parentElement.parentElement;
            }

            if (parentElement) {
                // 更新工具名称和服务器信息
                const senderEl = parentElement.querySelector('.message-sender');
                if (senderEl) {
                    let senderText = i18n.t('messages.tool');

                    // 添加工具名称
                    if (roleName) {
                        senderText = roleName;
                        if (serverName) {
                            senderText = `${serverName} : ${roleName}`;
                        }
                    }

                    senderEl.textContent = senderText;
                }
            }
        }

        this.updateMessage(msgElement, processedText);
    }

    setEventListeners() {
        if (!this.sessionId) {
            return
        }

        // 接收响应消息
        ipcRenderer.on('response-stream-' + this.sessionId, (event, rspId, msgId, role, content, roleName, serverName, serverId) => {
            this.setResponseMessages(rspId, msgId, role, content, roleName, serverName, serverId);
        });

        // 对话触发的会话名称变更
        ipcRenderer.on('session-name-change-' + this.sessionId, (event, newName) => {
            this.sessionNameChange(newName);
        });
    }

    /**
     * 更新会话的标签ID，用于关联到特定标签及其输入、选择框
     * @param {string} tabId - 标签ID
     */
    setTabId(tabId) {
        log.info("set Session tab", this.sessionId, tabId)
        this.tabId = tabId;

        // 消息框
        this.chatMessages = document.getElementById(`chat-messages-${this.tabId}`);

        // 配置选择
        this.modelSelect = document.getElementById(`model-select-${this.tabId}`);

        // 修改为查找提示词下拉选择器元素（适应新的下拉结构）
        this.promptDropdownBtn = document.getElementById(`prompt-dropdown-btn-${this.tabId}`);
        this.promptDropdownContent = document.getElementById(`prompt-dropdown-content-${this.tabId}`);
        this.promptSelect = null; // 标记为不使用单个选择器

        this.McpSelect = document.getElementById(`mcp-select-${this.tabId}`);

        // 新建会话按钮
        this.newSessionButton = document.getElementById(`new-session-${this.tabId}`);

        // 输入框
        this.messageInput = document.getElementById(`message-input-${this.tabId}`);

        this.updateUi();
    }

    /**
     * 创建新会话
     * @returns {Promise<Object>} 新创建的会话对象
     */
    async createNewSession() {
        try {
            this.statusElement.textContent = i18n.t('ui.status.creatingNewSession');

            // 创建新会话
            const session = await ipcRenderer.invoke('create-session');
            this.sessionId = session.id;
            this.data = session;

            this.setEventListeners();

            this.statusElement.textContent = i18n.t('ui.status.newSessionCreated', { name: session.name });
            return session;
        } catch (error) {
            log.error(i18n.t('logs.createSessionFailed'), error.message);
            this.statusElement.textContent = i18n.t('ui.status.newSessionFailed', { error: error.message });
            throw error;
        }
    }

    updateUi() {
        if (!this.data) {
            this.data = this.loadSession();
        }

        // 清空聊天界面
        this.clearChatMessages();

        // 渲染消息历史
        if (this.data.messages) {
            // 按照消息顺序组织用户消息和响应
            let currentResponseContainer = null;
            let lastMessageRole = null;

            // 按照原始顺序处理消息
            this.data.messages.forEach((msg) => {
                if (msg.role === 'user') {
                    // 用户消息直接添加到主容器
                    this.addMessage(msg.content, msg.role, msg.roleName);
                    // 标记下一个非用户消息需要创建新的响应容器
                    lastMessageRole = 'user';
                    currentResponseContainer = null;
                } else {
                    // AI消息、工具消息或推理过程
                    if (lastMessageRole === 'user' || currentResponseContainer === null) {
                        // 如果上一条是用户消息，或者还没有响应容器，创建新的响应容器
                        currentResponseContainer = document.createElement('div');
                        currentResponseContainer.className = 'response-container';
                        this.chatMessages.appendChild(currentResponseContainer);
                    }

                    // 将消息添加到当前响应容器
                    this.addMessageToContainer(msg.content, msg.role, currentResponseContainer, msg.roleName, msg.serverName);
                    lastMessageRole = msg.role;
                }
            });

            // 加载历史消息后，折叠所有工具和推理过程消息
            this.collapseToolAndThinkingMessages();
        }

        // 延迟滚动，确保渲染完成
        if (this.chatMessages) {
            setTimeout(() => {
                this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
            }, 50);
        }

        // 仅更新UI显示，不发送IPC消息
        if (this.modelSelect) {
            this.modelSelect.value = this.data.modelId;
        }

        this.statusElement.textContent = i18n.t('ui.status.sessionLoaded', { name: this.data.name });
    }

    async getConfig() {
        // 从后端获取配置最新信息
        const session = await ipcRenderer.invoke('load-session', this.sessionId);
        if (!session) {
            this.statusElement.textContent = i18n.t('ui.status.sessionLoadFailed');
            return this.data;
        }

        // 只更新配置信息
        this.data.name = session.name;
        this.data.agentId = session.agentId;
        this.data.modelId = session.modelId;
        this.data.promptIds = session.promptIds;
        this.data.mcpServers = session.mcpServers;

        return {
            name: session.name,
            agentId: session.agentId,
            modelId: session.modelId,
            promptIds: session.promptIds,
            mcpServers: session.mcpServers
        }
    }

    /**
     * 设置多个提示词ID  
     * @param {Array} promptIds 提示词ID数组
     */
    async setPromptIds(promptIds) {
        try {
            // 通过IPC调用后端设置提示词
            await ipcRenderer.invoke('select-session-prompt', this.sessionId, promptIds);

            // 更新本地数据
            this.data.promptIds = promptIds;

            log.info(`会话 ${this.sessionId} 提示词已更新为:`, promptIds);
        } catch (error) {
            log.error('设置提示词失败:', error);
            throw error;
        }
    }

    /**
     * 加载指定会话
     *
     * 此函数加载指定ID的会话，并在界面上显示其消息历史
     *
     * @returns {Promise<Object>} 加载的会话对象
     */
    async loadSession() {
        try {
            log.info("加载会话", this.sessionId)
            this.statusElement.textContent = i18n.t('ui.status.loadingSession');

            // 加载会话
            const session = await ipcRenderer.invoke('load-session', this.sessionId);
            if (!session) {
                this.statusElement.textContent = i18n.t('ui.status.sessionLoadFailed');
                return null;
            }

            this.data = session;
            this.statusElement.textContent = i18n.t('ui.status.sessionLoaded', { name: this.data.name });
            return session;
        } catch (error) {
            log.error(i18n.t('logs.loadSessionFailed'), error.message);
            this.statusElement.textContent = i18n.t('ui.status.loadSessionFailed', { error: error.message });
            throw error;
        }
    }

    /**
     * 创建折叠切换按钮
     * 
     * @param {HTMLDivElement} contentDiv - 消息内容元素
     * @param {string} type - 消息类型
     * @returns {HTMLButtonElement} 折叠/展开按钮
     */
    createToggleButton(contentDiv, type) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'toggle-content-btn';
        toggleBtn.innerHTML = `<span class="toggle-icon">▼</span>`;  // 默认显示展开状态的图标

        toggleBtn.addEventListener('click', () => {
            const isCollapsed = contentDiv.classList.contains('collapsed');
            if (isCollapsed) {
                // 展开内容
                contentDiv.classList.remove('collapsed');
                toggleBtn.innerHTML = `<span class="toggle-icon">▼</span>`;
            } else {
                // 折叠内容
                contentDiv.classList.add('collapsed');
                toggleBtn.innerHTML = `<span class="toggle-icon">▶</span>`;
            }
        });

        return toggleBtn;
    }

    /**
     * 向指定容器添加一条消息
     *
     * @param {string} content - 消息内容
     * @param {string} type - 消息类型，可选值为 'user'、'assistant'、'thinking'、 'tool'，默认为 'assistant'
     * @param {HTMLElement} container - 容器元素，如果未提供则使用this.chatMessages
     * @param {Object} authRequest - 授权请求对象，包含toolName、serverId等信息
     * @returns {HTMLDivElement} - 消息内容元素，用于后续更新
     */
    addMessageToContainer(content, type = 'assistant', container = null, roleName = null, serverName = null, authRequest = null) {
        const targetContainer = container || this.chatMessages;

        if (!targetContainer) {
            log.error(`尝试添加消息但未找到消息容器`);
            return null;
        }

        // 创建消息容器元素
        const messageDiv = document.createElement('div');

        // 创建发送者信息元素
        const sender = document.createElement('div');
        sender.className = 'message-sender';

        // 根据消息类型设置对应的类名和发送者文本
        if (type === 'user') {
            messageDiv.className = 'message user-message';
            sender.textContent = i18n.t('messages.user');
        } else if (type === 'tool-auth') {
            messageDiv.className = 'message tool-message';
            sender.textContent = i18n.t('messages.tool');
        } else if (type === 'tool') {
            messageDiv.className = 'message tool-message';
            sender.textContent = i18n.t('messages.tool');
        } else if (type === 'thinking') {
            messageDiv.className = 'message thinking-message';
            sender.textContent = i18n.t('messages.ai') + ': ' + i18n.t('messages.thinking', '推理过程');
        } else {
            messageDiv.className = 'message ai-message';
            sender.textContent = i18n.t('messages.ai');
        }

        if (roleName) {
            sender.textContent = roleName;
            if (serverName) {
                sender.textContent = `${serverName} : ${roleName}`;
            }

            if (type === 'thinking') {
                sender.textContent = `${roleName} : ${i18n.t('messages.thinking', '推理过程')}`;
            }
        }

        // 创建发送者头部容器，包含发送者信息和折叠按钮
        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        headerDiv.appendChild(sender);

        // 为推理过程和工具调用添加折叠功能
        if (type === 'thinking' || type === 'tool') {
            // 添加用于折叠效果的CSS类，但默认展开(不添加collapsed类)
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content collapsible-content';
            contentDiv.dataset.messageType = type; // 添加数据属性以便后续识别

            // 创建折叠/展开按钮
            const toggleBtn = this.createToggleButton(contentDiv, type);
            headerDiv.appendChild(toggleBtn);

            messageDiv.appendChild(headerDiv);
            this.updateMessage(contentDiv, content);
            messageDiv.appendChild(contentDiv);
        } else {
            messageDiv.appendChild(headerDiv);

            // 消息内容
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            this.updateMessage(contentDiv, content);
            messageDiv.appendChild(contentDiv);
        }

        // 如果是工具授权请求或工具消息，并且存在授权元数据，添加授权按钮
        if (type === 'tool-auth' && authRequest) {
            const authButtons = this.createToolAuthButtons(authRequest);
            messageDiv.appendChild(authButtons);
        }

        // 将消息添加到目标容器中
        targetContainer.appendChild(messageDiv);

        // 滚动到最新消息
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

        // 返回消息内容元素以便后续更新
        return messageDiv.querySelector('.message-content');
    }

    /**
     * 向聊天界面添加一条消息
     *
     * @param {string} content - 消息内容。
     * @param {string} type - 消息类型，可选值为 'user'、'assistant'、'thinking'、 'tool'，默认为 'assistant'
     * @param {Object} authRequest - 授权请求对象，包含toolName、serverId等信息
     * @returns {HTMLDivElement} - 消息内容元素，用于后续更新
     */
    addMessage(content, type = 'assistant', roleName = null, serverName = null, authRequest = null) {
        if (!this.chatMessages) {
            log.error(`尝试添加消息但未找到消息容器，tabId=${this.tabId}`);
            return null;
        }

        // 如果是用户消息，直接添加到主容器
        if (type === 'user') {
            // 用户消息直接添加到主容器
            return this.addMessageToContainer(content, type, this.chatMessages, roleName, serverName, authRequest);
        } else {
            // 对于AI响应、推理过程或工具调用，创建一个新的响应容器
            const responseContainer = document.createElement('div');
            responseContainer.className = 'response-container';
            this.chatMessages.appendChild(responseContainer);

            // 将AI响应消息添加到新容器
            return this.addMessageToContainer(content, type, responseContainer, roleName, serverName, authRequest);
        }
    }

    /**
     * 创建工具授权按钮组
     *
     * 此函数创建工具授权按钮容器，包含三个按钮：本次授权、后续自动授权和拒绝
     *
     * @param {Object} authRequest - 授权请求对象，包含toolName、serverId等信息
     * @returns {HTMLDivElement} - 包含授权按钮的容器元素
     */
    createToolAuthButtons(authRequest) {
        const { toolName, serverId, serverName } = authRequest;

        // 创建按钮容器
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'tool-auth-buttons';
        // 确保按钮容器始终可见
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.opacity = '1';
        buttonsContainer.style.visibility = 'visible';

        // 创建本次授权按钮
        const onetimeBtn = document.createElement('button');
        onetimeBtn.className = 'tool-auth-btn onetime';
        onetimeBtn.textContent = i18n.t('mcp.authorization.onetime');
        onetimeBtn.onclick = () => this.handleToolAuthorization(toolName, serverId, true, false);

        // 创建后续自动授权按钮
        const autoBtn = document.createElement('button');
        autoBtn.className = 'tool-auth-btn auto';
        autoBtn.textContent = i18n.t('mcp.authorization.auto');
        autoBtn.onclick = () => this.handleToolAuthorization(toolName, serverId, true, true);

        // 创建拒绝按钮
        const denyBtn = document.createElement('button');
        denyBtn.className = 'tool-auth-btn deny';
        denyBtn.textContent = i18n.t('mcp.authorization.deny');
        denyBtn.onclick = () => this.handleToolAuthorization(toolName, serverId, false, false);

        // 将按钮添加到容器
        buttonsContainer.appendChild(onetimeBtn);
        buttonsContainer.appendChild(autoBtn);
        buttonsContainer.appendChild(denyBtn);

        return buttonsContainer;
    }

    /**
     * 处理工具授权请求的响应
     *
     * 此函数根据用户点击的按钮向主进程发送授权结果
     *
     * @param {string} toolName - 工具名称
     * @param {string} serverId - 服务ID
     * @param {boolean} authorized - 是否授权
     * @param {boolean} permanent - 是否永久授权
     */
    handleToolAuthorization(toolName, serverId, authorized, permanent) {
        // 构造授权结果对象
        const result = {
            toolName,
            serverId,
            authorized,
            permanent
        };

        // 向主进程发送授权结果
        ipcRenderer.send('tool-authorization-response', result);

        // 获取按钮容器
        const buttons = document.querySelectorAll('.tool-auth-buttons');

        // 找到并删除包含授权请求的整个消息元素
        buttons.forEach(btn => {
            if (btn.parentNode) {
                // 查找包含此按钮的消息元素（向上查找到最近的.message元素）
                const messageElement = btn.closest('.message');
                if (messageElement && messageElement.parentNode) {
                    // 删除整个消息元素
                    messageElement.parentNode.removeChild(messageElement);
                } else {
                    // 如果找不到父消息元素，至少删除按钮
                    btn.parentNode.removeChild(btn);
                }
            }
        });

        // 删除授权请求消息后，如果需要可以添加一个短暂的状态提示（可选）
        this.statusElement.textContent = authorized
            ? (permanent
                ? i18n.t('mcp.authorization.success')
                : i18n.t('mcp.authorization.onetime'))
            : i18n.t('mcp.authorization.denied');

        this.statusElement.textContent = i18n.t('ui.status.ready');

        // 消息处理完成后折叠剩余的工具和推理过程消息
        this.collapseToolAndThinkingMessages();
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
    updateMessage(messageDiv, content) {
        if (!messageDiv) {
            return;
        }

        // 保存当前折叠状态
        const wasCollapsed = messageDiv.classList.contains('collapsed');

        // 解析普通消息内容 - 使用公共Markdown渲染器
        markdownRenderer.renderContent(content, messageDiv, 'message-content');

        // 确保内容可选择
        messageDiv.style.userSelect = 'text';

        // 恢复折叠状态
        if (wasCollapsed) {
            messageDiv.classList.add('collapsed');

            // 尝试找到第一行文本作为预览文本
            const firstParagraph = messageDiv.querySelector('p');
            if (firstParagraph) {
                // 给第一行文本添加data-preview属性，用于CSS样式特殊处理
                firstParagraph.setAttribute('data-preview', 'true');
            }
        }

        // 滚动到最新内容，保持消息可见
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
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
    sanitizeJsonInMarkdown(text) {
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
    preprocessCodeBlocks(text) {
        // 首先处理JSON代码块，使其格式化
        text = this.sanitizeJsonInMarkdown(text);

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

    /**
     * 中断当前正在进行的AI回复生成
     * 
     * 如果当前有AI正在生成回复，此函数将中断该过程
     * 
     * @returns {boolean} 是否成功中断（如果当前没有生成过程，返回false）
     */
    async abortCurrentGeneration() {
        if (!this.isGenerating) {
            return true
        }
        log.info("中断当前AI回复生成", this.sessionId);

        try {
            // 向主进程发送中断消息并等待结果
            const abortResult = await ipcRenderer.invoke('abort-message-generation', this.sessionId);

            // 记录中断结果
            log.info(`中断 ${this.sessionId} : ${abortResult ? '成功' : '失败'}`);

            // 重置生成状态
            this.isGenerating = false;

            // 更新状态提示
            if (abortResult) {
                this.statusElement.textContent = i18n.t('ui.status.aborted') || "消息生成已中断";
            } else {
                this.statusElement.textContent = i18n.t('ui.status.abortFailed') || "中断失败";
            }

            return true;
        } catch (error) {
            log.error("中断消息生成时出错:", error.message);
            this.statusElement.textContent = i18n.t('ui.status.abortError') || `中断出错: ${error.message}`;
            return false;
        }
    }

    /**
     * 发送消息到AI
     *
     * @param {string} message - 要发送的消息内容
     * @param {string} currentModel - 当前选择的模型ID
     * @param {string} currentSessionId - 当前会话ID
     * @param {Function} openSettingsWindow - 打开设置窗口的函数
     */
    async sendMessage(message, openSettingsWindow) {
        if (!message.trim()) return;

        // 检查是否选择了模型
        if (!this.data.modelId) {
            this.statusElement.textContent = i18n.t('modelSelector.selectModel');

            // 自动打开设置窗口
            window.openSettingsWindowWithTab('model');
            return;
        }

        // 如果已经有正在进行的生成过程，先中断它
        this.abortCurrentGeneration();

        // 标记为正在生成状态
        this.isGenerating = true;

        this.addMessage(message, 'user');

        this.messageInput.value = '';
        this.statusElement.textContent = i18n.t('ui.status.generating');

        // 生成唯一ID
        const now = new Date();
        const requestId = this.data.id + '-' + now.toLocaleString();

        try {
            // 在send-message IPC中传递会话特定的配置
            await ipcRenderer.invoke('send-message', this.data.id, requestId, message);
            this.statusElement.textContent = i18n.t('ui.status.ready');
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

                // 添加设置按钮点击事件
                const settingsBtn = errorWithButton.querySelector('.open-settings-btn');
                if (settingsBtn) {
                    settingsBtn.addEventListener('click', openSettingsWindow);
                }
            }

            this.statusElement.textContent = i18n.t('ui.status.error', { error: errorMsg });
        } finally {
            setTimeout(() => {
                this.isGenerating = false;
                this.responses.delete(requestId);

                // 在消息生成完成后折叠所有工具和推理过程消息
                this.collapseToolAndThinkingMessages();
            }, 100);
        }
    }

    /**
     * 清空聊天界面
     */
    clearChatMessages() {
        if (this.chatMessages) {
            this.chatMessages.innerHTML = '';
            log.info(`已清空聊天消息容器: ${this.chatMessages.id}`);
        } else {
            log.error('尝试清空消息但未找到消息容器');
        }
    }

    /**
     * 在消息生成完成后折叠所有工具和推理过程消息
     */
    collapseToolAndThinkingMessages() {
        if (!this.chatMessages) return;

        // 查找所有工具和推理过程消息
        const collapsibleContents = this.chatMessages.querySelectorAll('.collapsible-content:not(.collapsed)');

        collapsibleContents.forEach(contentDiv => {
            // 添加折叠类
            contentDiv.classList.add('collapsed');

            // 更新对应的折叠按钮图标
            const messageHeader = contentDiv.parentElement.querySelector('.message-header');
            if (messageHeader) {
                const toggleBtn = messageHeader.querySelector('.toggle-content-btn');
                if (toggleBtn) {
                    toggleBtn.innerHTML = `<span class="toggle-icon">▶</span>`;
                }
            }

            // 尝试找到第一行文本作为预览文本
            const firstParagraph = contentDiv.querySelector('p');
            if (firstParagraph) {
                // 给第一行文本添加data-preview属性，用于CSS样式特殊处理
                firstParagraph.setAttribute('data-preview', 'true');
            }
        });
    }
}

// 创建并导出聊天服务实例
module.exports = ChatSessionService;
