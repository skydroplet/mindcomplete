const fs = require('fs');
const path = require('path');
const Logger = require('../logger');
const log = new Logger('session');
const crypto = require('crypto');
const { app } = require('electron');
const i18n = require('../../locales/i18n');

const modelConfig = require('../config/modelConfig');
const promptConfig = require('../config/promptConfig');
const mcpConfig = require('../config/mcpConfig');
const agentConfig = require('../config/agentConfig');
const mcp = require('../mcp/mcpClient');
const mcpClientManager = require('../mcp/mcpClient');

function getFormattedDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份从0开始，需+1
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 单个对话
 */
class ChatSession {
    constructor(filePath, sessionTemplate) {
        try {
            if (filePath) {
                const data = fs.readFileSync(filePath, 'utf8');
                this.data = JSON.parse(data);
                this.data.createdAt = new Date(this.data.createdAt);
                this.filePath = filePath;
                log.info("加载会话: ", filePath)
            } else {
                this.newSession();
                if (sessionTemplate) {
                    this.data.agentId = sessionTemplate.data.agentId;
                    this.data.modelId = sessionTemplate.data.modelId;
                    this.data.promptId = sessionTemplate.data.promptId;
                    this.data.mcpServers = sessionTemplate.data.mcpServers;
                    this.data.conversationMode = sessionTemplate.data.conversationMode;
                }

                this.saveToFile();
                log.info("创建新会话")
            }

            // 用于中断消息生成的控制器
            this.abortController = null;
        } catch (err) {
            log.error('初始化会话失败:', err.message);
        }
    }

    setModelId(modelId) {
        this.data.modelId = modelId;
        this.data.agentId = 'free-mode';
        log.info(`id: ${this.data.id}, agentId: ${this.data.agentId}, modelId: ${this.data.modelId}`)
        this.saveToFile();
    }

    setPromptId(promptId) {
        this.data.promptId = promptId;
        this.data.agentId = 'free-mode';
        log.info(`id: ${this.data.id}, agentId: ${this.data.agentId}, promptId: ${this.data.promptId}`)
        this.saveToFile();
    }

    setAgentId(agentId) {
        // 切换到自由模式时 使用之前使用的Agent配置 否则使用当前的Agent配置
        if (agentId === 'free-mode') {
            const agent = agentConfig.getAgent(this.data.agentId);
            if (agent) {
                this.data.modelId = agent.modelId;
                this.data.promptId = agent.promptId;
                this.data.mcpServers = agent.mcpServers;
            }
        } else {
            const agent = agentConfig.getAgent(agentId);
            if (agent) {
                this.data.modelId = agent.modelId;
                this.data.promptId = agent.promptId;
                this.data.mcpServers = agent.mcpServers;
            }
        }

        this.data.agentId = agentId;
        log.info(`id: ${this.data.id}, agentId: ${this.data.agentId}, modelId: ${this.data.modelId}, promptId: ${this.data.promptId}, mcpServers: ${this.data.mcpServers}`)
        this.saveToFile();
    }

    setMcpServers(servers) {
        this.data.mcpServers = servers;
        this.data.agentId = 'free-mode';
        log.info(`id: ${this.data.id}, agentId: ${this.data.agentId}, mcpServers: ${this.data.mcpServers}`)
        this.saveToFile();
    }

    /**
     * 设置会话对话模式
     * @param {string} mode 对话模式 'single-turn' 或 'multi-turn'
     */
    setConversationMode(mode) {
        this.data.conversationMode = mode;
        this.saveToFile();
    }

    /**
     * 生成不重复的随机会话ID
     */
    generateSessionId() {
        return 'session-' + crypto.randomBytes(5).toString('hex');
    }

    /**
     * 创建新会话
     * @returns {Promise<void>}
     */
    newSession() {
        const now = new Date();

        this.data = {
            id: this.generateSessionId(),
            name: i18n.t('session.defaultNewName', { date: now.toLocaleString() }) || `新会话 - ${now.toLocaleString()}`,
            createdAt: now,
            updatedAt: now,
            messageCount: 0,
            sessionStartMessageId: 0,
            conversationMode: 'multi-turn',
            messages: []
        }
    }

    /**
     * 保存会话到文件
     */
    saveToFile() {
        try {
            const sessionDir = path.join(app.getPath('userData'), 'user-data', 'sessions', getFormattedDate(this.data.createdAt))
            fs.mkdirSync(sessionDir, { recursive: true });
            this.filePath = path.join(sessionDir, `${this.data.id}.json`);

            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
            return true;
        } catch (err) {
            log.error('保存当前会话失败:', err.message);
            return false;
        }
    }

    /**
     * 从文件加载会话信息
     */
    loadFromFile(filePath) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            this.data = JSON.parse(data);
        } catch (err) {
            log.error(`加载会话 ${filePath} 失败:`, err.message);
        }
    }

    /**
     * 保存消息到当前会话
     * @param {Object} message 消息对象 {role, content}
     * @param {string} responseId 响应唯一标识，用于前端消息关联
     * @param {string} msgId 消息唯一标识，用于前端消息关联
     * @param {string} roleName 消息名称，Agent名称、模型名称、工具名称等
     * @param {string} serverName 服务名称，用于工具调用消息
     */
    saveMessage(message, responseId, msgId, roleName, serverName) {
        if (!message.content) {
            return;
        }

        // 确保 lastMessageId 字段存在
        if (this.data.messageCount === undefined) {
            this.data.messageCount = 0;
        } else {
            this.data.messageCount++;
        }

        // 添加消息及其ID
        this.data.messages.push({
            id: this.data.messageCount,
            ...message,
            responseId: responseId,
            msgId: msgId,
            roleName: roleName,
            serverName: serverName,
            timestamp: new Date().toLocaleString()
        });

        // 保存会话
        this.saveToFile();

        return true;
    }

    resetSessionStartMessage() {
        this.data.sessionStartMessageId = this.data.messages.length;
        this.saveToFile();
    }

    /**
     * 获取当前会话的消息，用于发送给ai，只返回role为user和assistant的消息
     */
    getMessagesForAi() {
        // 单轮对话模式 不返回历史消息
        if (this.data.conversationMode === 'single-turn') {
            return [];
        }

        if (this.data.sessionStartMessageId === undefined || this.data.sessionStartMessageId === null) {
            this.data.sessionStartMessageId = 0;
        }

        const sessionMessages = this.data.messages.slice(this.data.sessionStartMessageId);

        const messages = sessionMessages.filter(message => message.role === 'user' || message.role === 'assistant');
        // 删除消息中的thinking和前端展示相关字段
        return messages.map(message => {
            // 提取AI需要的字段
            const { role, content } = message;
            const aiMessage = { role, content };

            return aiMessage;
        });
    }

    /**
     * 获取摘要信息
     */
    getSummary() {
        return {
            id: this.data.id,
            name: this.data.name,
            createdAt: this.data.createdAt,
            updatedAt: this.data.updatedAt,
            messageCount: this.data.messageCount,
            agentId: this.data.agentId,
            modelId: this.data.modelId,
            promptId: this.data.promptId,
            mcpServers: this.data.mcpServers || [],
            conversationMode: this.data.conversationMode || 'single-turn',
            dataFile: this.filePath
        };
    }

    /**
     * 获取当前会话的消息，用于显示给用户
     */
    getMessages() {
        return this.data.messages;
    }

    /**
     * 重命名当前会话
     * @param {string} newName 新的名字
     */
    rename(newName) {
        this.data.name = newName;
        this.saveToFile();
    }

    /**
     * 删除当前会话
     */
    remove() {
        try {
            // 删除文件
            fs.unlinkSync(this.filePath);
            this.data = null;
        } catch (err) {
            log.error('删除会话失败:', err.message);
        }
    }

    /**
     * 中断当前正在进行的消息生成
     * 
     * 此函数用于中断当前正在进行的AI模型消息生成流程
     * @returns {boolean} 是否成功中断消息生成
     */
    abortMessageGeneration() {
        if (!this.abortController) {
            return false;
        }

        log.info(`开始会话 ${this.data.id} 响应`);
        try {
            this.abortController.abort();
            this.abortController = null;
            return true;
        } catch (error) {
            log.error(`中断会话 ${this.data.id} 消息生成时出错:`, error.message);
            this.abortController = null;
            return false;
        }
    }

    /**
     * 根据agentId获取配置信息
     * @returns {Object} 配置对象 {modelId, promptId, mcpServers}
     */
    getSessionConfig() {
        const config = {
            modelId: this.data.modelId,
            promptId: this.data.promptId,
            mcpServers: this.data.mcpServers || []
        };

        return config;
    }

    /**
     * 获取系统提示词消息
     * @param {string} promptId 提示词ID
     * @returns {Array} 提示词消息数组
     */
    getPromptMessages(promptId) {
        const messages = [];

        if (promptId) {
            const prompt = promptConfig.getPromptById(promptId);
            if (prompt) {
                const promptType = prompt.type || 'system';
                messages.push({
                    role: promptType,
                    content: prompt.content
                });
            }
        }

        return messages;
    }

    /**
     * 获取MCP工具列表
     * @param {Array} mcpServers MCP服务器列表
     * @returns {Array} 工具列表
     */
    getMcpTools(mcpServers) {
        let tools = [];
        if (mcpServers && mcpServers.length > 0) {
            tools = mcp.getToolsForServer(mcpServers);
        }

        return tools;
    }

    /**
     * 获取模型配置和客户端
     * @param {string} modelId 模型ID
     * @returns {Object} 模型配置和客户端 {model, modelClient}
     */
    getModelConfigAndClient(modelId) {
        if (!modelId) {
            throw new Error(i18n.t('errors.modelNotConfigured'));
        }

        const model = modelConfig.getModelById(modelId);
        if (!model) {
            throw new Error(i18n.t('errors.modelNotFound', { modelId }));
        }

        const modelClient = modelConfig.getModelClient(modelId);
        if (!modelClient) {
            throw new Error(i18n.t('errors.modelClientNotFound'));
        }

        return { model, modelClient };
    }

    async sendMessage(event, requestId, message) {
        try {
            // 如果存在旧的中断控制器，先中断它
            if (this.abortController) {
                this.abortController.abort();
            }

            // 一个请求的后续响应都使用这个ID
            const responseId = requestId;

            // 创建新的中断控制器
            this.abortController = new AbortController();

            // 获取配置信息
            const config = this.getSessionConfig();

            // 构建消息列表
            let messages = [];

            // 添加系统提示词
            const promptMessages = this.getPromptMessages(config.promptId);
            messages = messages.concat(promptMessages);

            // 获取MCP工具
            const tools = this.getMcpTools(config.mcpServers);

            // 如果有活动会话，加载会话历史
            let historyMessages = this.getMessagesForAi() || [];

            // 将会话历史添加到消息列表
            messages = messages.concat(historyMessages);

            // 添加当前用户消息
            messages.push({ role: 'user', content: message });
            // 保存到文件
            this.saveMessage({ role: 'user', content: message }, requestId, null, null, null);
            if (this.data.messageCount === 1) {
                this.data.name = message.slice(0, 64);
                event.sender.send("session-name-change-" + this.data.id, this.data.name);
            }

            // 获取模型配置和客户端
            const { model, modelClient } = this.getModelConfigAndClient(config.modelId);

            // 构建API请求参数
            const requestParams = {
                model: model.type,
                messages: messages,
                temperature: model.temperature || 0.7,
                max_tokens: model.contextWindowSize || 4096,
                stream: true
            };

            // 只有当工具列表不为空时，才添加tools参数
            if (tools && tools.length > 0) {
                requestParams.tools = tools;
                requestParams.tool_choice = "auto";
            }

            // 添加中断控制器信号
            const signal = this.abortController.signal;

            return await this.sendMessageToModel(event, signal, modelClient, requestParams, responseId, messages);
        } catch (err) {
            // 确认是否是中断导致的错误
            if (err.name === 'AbortError') {
                log.info(`会话 ${this.data.id} 的API调用被用户中断，这是预期的中断`);
                return { content: '已中断', aborted: true };
            }

            log.error('API调用失败:', err.message);
            // 向用户显示友好的错误消息
            if (err.status === 401) {
                throw new Error(i18n.t('errors.invalidApiKey'));
            } else if (err.status === 429) {
                throw new Error(i18n.t('errors.apiRequestLimit'));
            } else if (err.status >= 500) {
                throw new Error(i18n.t('errors.modelServerError'));
            } else {
                throw new Error(i18n.t('errors.apiCallFailed', { error: err.message }));
            }
        } finally {
            this.abortController = null;
        }
    }

    /**
     * 向前端回复消息
     * @param {Object} event - 事件对象，用于发送消息到前端
     * @param {AbortSignal} signal - 中断信号，用于控制请求中断
     * @param {string} rspId - 响应唯一标识，用于前端消息关联
     * @param {string} msgId - 消息唯一标识，用于前端消息关联
     * @param {string} role - 消息角色，如'user'、'assistant'等
     * @param {string} content - 消息内容
     * @param {string} roleName - 消息名称，Agent名称、模型名称、工具名称等
     * @param {string} serverName - 服务名称，用于工具调用消息
     */
    replyMessage(event, signal, rspId, msgId, role, content, roleName, serverName, serverId = null) {
        // 检查是否已经中断
        if (signal.aborted) {
            log.info(`会话 ${this.data.id} 的消息生成已被中断, 停止处理`);
            return;
        }

        let newMsgId = msgId || crypto.randomUUID();
        event.sender.send("response-stream-" + this.data.id, rspId, newMsgId, role, content, roleName, serverName, serverId);
        return newMsgId;
    }

    /**
     * 向模型发送消息并处理流式响应
     * @param {Object} event - 事件对象，用于发送消息到前端
     * @param {AbortSignal} signal - 中断信号，用于控制请求中断
     * @param {Object} modelClient - 模型客户端实例，用于调用模型接口
     * @param {Object} requestParams - 请求参数对象，包含模型调用配置
     * @param {string} responseId - 响应唯一标识，用于前端消息关联
     * @param {Array} messages - 消息历史数组，包含对话上下文
     * @returns {Promise<Object>} 返回包含响应内容的Promise对象
     */
    async sendMessageToModel(event, signal, modelClient, requestParams, responseId, messages) {
        // 检查是否已经中断
        if (signal.aborted) {
            log.info(`会话 ${this.data.id} 的消息生成已被中断, 停止处理`);
            return;
        }

        requestParams.messages = messages;
        const stream = await modelClient.chat.completions.create({
            ...requestParams,
            signal
        });

        log.info("模型请求: ", requestParams);

        let thinkingContent = '';
        let thinkingMsgId = null;
        let modelContent = '';
        let modelMsgId = null;
        let toolCalls = [];

        // 获取模型名称或Agent名称
        let roleName = null;
        if (this.data.agentId && this.data.agentId !== 'free-mode') {
            // 使用Agent配置，获取Agent名称
            const agent = agentConfig.getAgent(this.data.agentId);
            if (agent) {
                roleName = agent.name;
            }
        } else if (this.data.modelId) {
            // 自由模式，使用模型名称
            const model = modelConfig.getModelById(this.data.modelId);
            if (model) {
                roleName = model.name;
            }
        }

        for await (const chunk of stream) {
            // 检查是否已经中断
            if (signal.aborted) {
                log.info(`会话 ${this.data.id} 的消息生成已被中断，停止处理后续消息块`);
                break;
            }
            // log.info("receive chunk", chunk)

            // 推理
            const thinking = chunk.choices[0]?.delta?.reasoning_content;
            if (thinking) {
                thinkingContent += thinking;
                thinkingMsgId = this.replyMessage(event, signal, responseId, thinkingMsgId, 'thinking', thinkingContent, roleName, null);
            }

            // 工具调用
            const toolCallChunks = chunk.choices[0]?.delta?.tool_calls || [];
            if (toolCallChunks.length > 0) {
                // 添加详细的工具调用日志
                for (let index = 0; index < toolCallChunks.length; index++) {
                    const toolCallChunk = toolCallChunks[index];

                    // 初始化工具调用对象
                    if (toolCalls[index] === undefined) {
                        toolCalls[index] = {
                            id: toolCallChunk.id || `call_${index}`,
                            type: "function",
                            function: {
                                name: "",
                                arguments: ""
                            }
                        };
                    }

                    // 更新工具调用名称
                    if (toolCallChunk.function?.name) {
                        toolCalls[index].function.name += toolCallChunk.function.name;
                    }

                    // 更新工具调用参数
                    if (toolCallChunk.function?.arguments) {
                        toolCalls[index].function.arguments += toolCallChunk.function.arguments;
                    }
                }
            }

            // 回复
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                modelContent += content;
                modelMsgId = this.replyMessage(event, signal, responseId, modelMsgId, 'assistant', modelContent, roleName, null);
            }
        }

        log.info("模型响应: ", { thinking: thinkingContent, content: modelContent, tool_calls: toolCalls });

        // 保存推理消息 只用于显示 不返回给模型
        if (thinkingContent) {
            this.saveMessage({ role: 'thinking', content: thinkingContent }, responseId, thinkingMsgId, roleName, null);
        }

        // 多轮对话时 要返回给模型
        const responseMsg = { role: 'assistant', content: modelContent, tool_calls: toolCalls };
        this.saveMessage(responseMsg, responseId, modelMsgId, roleName, null);

        // 调用工具
        if (toolCalls.length > 0) {
            // 处理工具调用
            messages = messages.concat(responseMsg);
            await this.handleToolCalls(event, signal, modelClient, requestParams, responseId, messages, toolCalls);
        }
    }

    /**
     * 解析模型返回的toolName 返回实际的serverId、serverName、toolName
     * 使用:将原始modelToolName分割为两部分，前半部分为serverId,后半部为toolName
     * 根据serverId获取实际的serverName
     * 
     * @param {string} modelToolName 
     */
    parseToolName(modelToolName) {
        // 使用:将原始modelToolName分割为两部分，前半部分为serverId,后半部为toolName
        // 只按第一个冒号分割，支持toolName包含冒号的情况
        const firstColonIndex = modelToolName.indexOf(':');
        if (firstColonIndex === -1) {
            const toolName = modelToolName;
            let serverId = null;
            let serverName = null;

            // 查找工具所在的MCP服务
            const config = this.getSessionConfig();
            if (config.mcpServers && config.mcpServers.length > 0) {
                const tools = mcp.getToolsForServer(config.mcpServers);
                const tool = tools.find(t => t.function.name === toolName);
                if (tool) {
                    serverId = tool.function.serverId;
                    serverName = tool.function.serverName;
                }
            }

            return {
                serverId: serverId,
                serverName: serverName,
                toolName: modelToolName
            };
        } else {
            const serverId = modelToolName.substring(0, firstColonIndex);
            const toolName = modelToolName.substring(firstColonIndex + 1);

            // 根据serverId获取实际的serverName
            let serverName = null;
            const config = this.getSessionConfig();
            if (config.mcpServers && config.mcpServers.length > 0) {
                const tools = mcp.getToolsForServer(config.mcpServers);
                const tool = tools.find(t => t.function.serverId === serverId);
                if (tool) {
                    serverName = tool.function.serverName;
                }
            }

            log.info(`解析工具名称: ${modelToolName} -> serverId: ${serverId}, serverName: ${serverName}, toolName: ${toolName}`);

            return {
                serverId: serverId,
                serverName: serverName,
                toolName: toolName
            };
        }
    }

    /**
     * 处理AI模型生成的工具调用
     *
     * 该函数负责处理AI模型生成的工具调用请求，执行每个工具，并生成最终回复
     * 工作流程：
     * 1. 依次处理每个工具调用
     * 2. 检查工具授权状态
     * 3. 如果未授权，发送授权请求到前端
     * 4. 等待授权结果后执行工具
     * 5. 向前端发送工具执行状态和结果
     * 6. 收集所有工具执行结果
     * 7. 将结果发送给AI模型生成最终回复
     * 8. 将最终回复流式发送给前端
     *
     * @param {Event} event - 事件通信对象，用于前后端消息传递
     * @param {AbortSignal} signal - 中断信号，用于控制流程中断
     * @param {ModelClient} modelClient - 模型客户端实例，用于后续AI交互
     * @param {Object} requestParams - 请求参数对象，包含模型配置信息
     * @param {string} responseId - 响应唯一标识，用于消息追踪
     * @param {Array} messages - 当前会话消息历史数组
     * @param {Array} toolCalls - 待处理的工具调用对象数组
     * 
     * @returns {Promise} 返回最终模型响应结果或中断状态
     */
    async handleToolCalls(event, signal, modelClient, requestParams, responseId, messages, toolCalls) {
        // 依次处理每个工具调用
        for await (const toolCall of toolCalls) {
            // 检查是否已经中断
            if (signal.aborted) {
                log.info("工具处理已被中断，停止处理剩余工具");
                return "";
            }
            log.info("call tool", toolCall)

            // 确保工具调用包含有效的名称和参数
            if (toolCall.function.name && toolCall.function.arguments) {
                let toolMessage = "";
                let toolMsgId = null;

                try {
                    // 解析工具名称和对应的mcp服务
                    const mcpInfo = this.parseToolName(toolCall.function.name)
                    const toolName = mcpInfo.toolName;
                    const serverId = mcpInfo.serverId;
                    const serverName = mcpInfo.serverName;

                    let args = JSON.parse(toolCall.function.arguments);

                    // 向前端发送当前正在执行的工具信息
                    toolMessage += `${i18n.t('toolCalls.tool', { name: toolName })}\n\n`;
                    toolMsgId = this.replyMessage(event, signal, responseId, null, 'tool', toolMessage, toolName, serverName);

                    // 向前端显示工具参数
                    toolMessage += i18n.t('toolCalls.parameters', { args: JSON.stringify(args, null, 2) });
                    this.replyMessage(event, signal, responseId, toolMsgId, 'tool', toolMessage, toolName, serverName);

                    // 检查工具是否已授权
                    const isAuthorized = serverId ? mcp.isToolAuthorized(toolName, serverId) : false;
                    if (!isAuthorized && serverId) {
                        log.info(`工具 ${toolName} 未授权，发送授权请求`);

                        // 创建授权请求消息
                        const authMessage = i18n.t('mcp.authorization.message', {
                            serverId: serverId,
                            serverName: serverName || serverId,
                            name: toolName
                        });

                        // 发送授权请求消息到前端，使用 serverId 作为 serverName 参数传递，但不保存到会话历史
                        this.replyMessage(event, signal, responseId, null, 'tool-auth', authMessage, toolName, serverName, serverId);

                        // 等待授权结果
                        const authResult = await new Promise((resolve) => {
                            // 监听授权结果
                            const onAuthResult = (result) => {
                                if (result.toolName === toolName && result.serverId === serverId) {
                                    mcp.removeListener('tool-authorization-result', onAuthResult);
                                    resolve(result);
                                }
                            };

                            mcp.on('tool-authorization-result', onAuthResult);
                        });

                        // 如果授权被拒绝，跳过此工具
                        if (!authResult.authorized) {
                            const errorMsg = i18n.t('toolCalls.userDenied', { name: toolName });
                            log.info(errorMsg);

                            toolMessage = errorMsg;
                            toolMsgId = this.replyMessage(event, signal, responseId, null, 'tool', toolMessage, toolName, serverName);

                            const message = {
                                role: "tool",
                                tool_call_id: toolCall.id,
                                serverName: serverName,
                                roleName: toolName,
                                content: toolMessage
                            };
                            messages.push(message);
                            this.saveMessage(message, responseId, toolMsgId, toolName, serverName);
                            continue;
                        }

                        // 如果永久授权，更新授权状态
                        if (authResult.permanent) {
                            await mcp.updateToolAuthorizationStatus(toolName, serverId, true);
                        }
                    }

                    // 调用工具执行器(mcp)执行工具
                    const result = await mcp.executeTool(this.data.id, {
                        name: toolName,
                        arguments: args,
                        serverId: serverId,
                        serverName: serverName
                    });

                    // 处理工具执行结果
                    if (result && typeof result === 'object') {
                        // 获取serverId和serverName
                        const resultServerName = result.serverName || serverName || '';

                        // 向前端发送执行结果
                        let toolContents = "";
                        for (const toolContent of result.content) {
                            toolContents += toolContent.text + "\n\n";
                        }

                        // 添加serverId和toolName到工具消息中
                        toolMessage += i18n.t('toolCalls.result', { result: toolContents });

                        // 发送消息到前端，包含serverId和toolName
                        this.replyMessage(event, signal, responseId, toolMsgId, 'tool', toolMessage, toolName, resultServerName);

                        // 设置结果角色并添加到消息列表，稍后发送给AI
                        const message = {
                            role: "tool",
                            tool_call_id: toolCall.id,
                            serverName: resultServerName,
                            roleName: toolName,
                            content: toolMessage
                        }
                        messages.push(message);
                        this.saveMessage(message, responseId, toolMsgId, toolName, resultServerName);
                    } else {
                        // 如果结果不是有效对象，记录错误
                        const errorMsg = i18n.t('toolCalls.invalidResult', { type: typeof result });
                        log.error(errorMsg, result);
                        toolMessage += errorMsg;
                        this.replyMessage(event, signal, responseId, toolMsgId, 'tool', toolMessage, toolName, serverName);
                    }
                } catch (toolError) {
                    // 捕获并处理工具执行过程中的错误
                    const errorMsg = i18n.t('toolCalls.error', { message: toolError.message });
                    log.error('工具执行错误:', toolError);
                    toolMessage += errorMsg;
                    this.replyMessage(event, signal, responseId, toolMsgId, 'tool', toolMessage, toolCall.function.name, null);
                }
            }
        }

        return await this.sendMessageToModel(event, signal, modelClient, requestParams, responseId, messages);
    }
}


module.exports = ChatSession; 