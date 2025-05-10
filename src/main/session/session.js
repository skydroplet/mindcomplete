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
const mcp = require('../mcpClient');

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
    constructor(filePath) {
        try {
            if (filePath) {
                const data = fs.readFileSync(filePath, 'utf8');
                this.data = JSON.parse(data);
                this.data.createdAt = new Date(this.data.createdAt);
                this.filePath = filePath;
                log.info("加载会话: ", filePath)
            } else {
                this.newSession();
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
        // 同步保存到配置 新建会话时 以当前使用的配置为准
        modelConfig.selectModel(modelId);
        this.saveToFile();
    }

    setPromptId(promptId) {
        this.data.promptId = promptId;
        // 同步保存到配置 新建会话时 以当前使用的配置为准
        promptConfig.setCurrentPrompt(promptId);
        this.saveToFile();
    }

    setMcpServers(servers) {
        this.data.mcpServers = servers;
        // 同步保存到配置 新建会话时 以当前使用的配置为准
        mcpConfig.setActiveMcps(servers);
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

    setConfig() {
        this.data.modelId = modelConfig.getCurrentModelId();
        this.data.promptId = promptConfig.getCurrentPromptId();
        this.data.mcpServers = mcpConfig.getActiveMcps();
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
            modelId: modelConfig.getCurrentModelId(),
            promptId: promptConfig.getCurrentPromptId(),
            mcpServers: mcpConfig.getActiveMcps(),
            conversationMode: 'single-turn',
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
            log.info("保存会话：", this.filePath)

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
     * 添加消息到当前会话
     * @param {Object} message 消息对象 {role, content}
     */
    addMessage(message) {
        if (!message.content) {
            return;
        }

        // 确保 lastMessageId 字段存在
        if (this.data.messageCount === undefined) {
            this.data.messageCount = 0;
        } else {
            this.data.messageCount++;
        }

        if (this.data.messageCount === 1 && message.role === 'user') {
            this.data.name = message.content.slice(0, 64);
        }

        // 添加消息及其ID
        this.data.messages.push({
            id: this.data.messageCount,
            ...message,
            timestamp: new Date().toLocaleString()
        });

        // 保存会话
        this.saveToFile();

        return true;
    }

    /**
     * 获取当前会话的消息，用于发送给ai，只返回role为user和assistant的消息
     */
    getMessagesForAi() {
        // 单轮对话模式 不返回历史消息
        if (this.data.conversationMode === 'single-turn') {
            return [];
        }

        return this.data.messages.filter(message => message.role === 'user' || message.role === 'assistant');
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
            modelId: this.data.modelId,
            promptId: this.data.promptId,
            mcpServers: this.data.mcpServers || [],
            conversationMode: this.data.conversationMode || 'single-turn'
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

    async sendMessage(event, requestId, message) {
        try {
            // 如果存在旧的中断控制器，先中断它
            if (this.abortController) {
                this.abortController.abort();
            }

            // 一个请求的后续响应都使用这个ID
            const resposneId = requestId;

            // 创建新的中断控制器
            this.abortController = new AbortController();

            let messages = [];

            // 有系统提示词 添加系统提示词
            if (this.data.promptId) {
                const prompt = promptConfig.getPromptById(this.data.promptId);
                const promptType = prompt.type || 'system';
                messages.push({
                    role: promptType,
                    content: prompt.content
                });
                log.info("添加系统提示词：", prompt.content)
            }

            let tools = [];
            try {
                if (this.data.mcpServers && this.data.mcpServers.length > 0) {
                    tools = mcp.getToolsForServer(this.data.mcpServers);
                    log.info("添加Mcp工具：", tools)
                }
            } catch (err) {
                log.error(i18n.t('logs.getMcpToolFailed'), err.message);
                tools = [];
            }

            // 如果有活动会话，加载会话历史
            let historyMessages = this.getMessagesForAi() || [];

            // 将会话历史添加到消息列表
            messages = messages.concat(historyMessages);

            // 添加当前用户消息
            messages.push({ role: 'user', content: message });
            // 保存到文件
            this.addMessage({ role: 'user', content: message })

            const model = modelConfig.getModelById(this.data.modelId)
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

            const modelClient = modelConfig.getModelClient(this.data.modelId)

            // 添加中断控制器信号
            const signal = this.abortController.signal;

            const stream = await modelClient.chat.completions.create({
                ...requestParams,
                signal
            });

            let fullResponse = '';
            let toolCalls = [];
            let currentToolCallIndexes = {};

            for await (const chunk of stream) {
                // 检查是否已经中断
                if (signal.aborted) {
                    log.info(`会话 ${this.data.id} 的消息生成已被中断，停止处理后续消息块`);
                    break;
                }

                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    if (fullResponse === "") {
                        fullResponse = content;
                        event.sender.send('new-ai-message', resposneId, content);
                    } else {
                        fullResponse += content;
                        event.sender.send('ai-message-chunk', resposneId, content);
                    }
                }

                const toolCallChunks = chunk.choices[0]?.delta?.tool_calls || [];
                if (toolCallChunks.length > 0) {
                    // 添加详细的工具调用日志
                    log.info("收到工具调用块:", JSON.stringify(toolCallChunks, null, 2));

                    for (const toolCallChunk of toolCallChunks) {
                        const index = toolCallChunk.index;

                        // 初始化工具调用对象
                        if (!currentToolCallIndexes[index]) {
                            currentToolCallIndexes[index] = true;
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
                            toolCalls[index].function.name =
                                (toolCalls[index].function.name || "") + toolCallChunk.function.name;
                        }

                        // 更新工具调用参数
                        if (toolCallChunk.function?.arguments) {
                            toolCalls[index].function.arguments =
                                (toolCalls[index].function.arguments || "") + toolCallChunk.function.arguments;
                        }
                    }
                }
            }

            // 如果有工具调用，处理它
            if (toolCalls.length > 0) {
                // 处理工具调用
                const finalResponse = await this.handleToolCalls(event, messages, toolCalls, modelClient, model, resposneId);
                this.addMessage({ role: 'assistant', content: finalResponse })
                return { content: finalResponse, toolCalls };
            } else {
                this.addMessage({ role: 'assistant', content: fullResponse })
                return { content: fullResponse };
            }
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
     * 处理AI模型生成的工具调用
     *
     * 该函数负责处理AI模型生成的工具调用请求，执行每个工具，并生成最终回复
     * 工作流程：
     * 1. 依次处理每个工具调用
     * 2. 向前端发送工具执行状态和结果
     * 3. 收集所有工具执行结果
     * 4. 将结果发送给AI模型生成最终回复
     * 5. 将最终回复流式发送给前端
     *
     * @param {Object} event - Electron IPC事件对象，用于与前端通信
     * @param {Array} toolCalls - AI模型生成的工具调用数组，每个元素包含工具名称和参数
     * @param {Object} client - AI模型客户端，用于发送API请求
     * @param {Object} currentModel - 当前使用的AI模型配置
     * @returns {String} 工具处理后生成的完整回复文本
     */
    async handleToolCalls(event, messages, toolCalls, client, currentModel, responseID) {
        // 初始化最终回复文本和消息历史数组
        let fullResponse = '';

        messages = messages.concat({ role: 'user', tool_calls: toolCalls });

        // 依次处理每个工具调用
        for await (const toolCall of toolCalls) {
            // 检查是否已经中断
            if (this.abortController && this.abortController.signal.aborted) {
                log.info("工具处理已被中断，停止处理剩余工具");
                return "工具处理已被中断";
            }

            // 确保工具调用包含有效的名称和参数
            if (toolCall.function.name && toolCall.function.arguments) {
                let toolMessage = "";

                try {
                    // 解析工具名称和参数
                    const toolName = toolCall.function.name;
                    let args = JSON.parse(toolCall.function.arguments);

                    // 向前端发送当前正在执行的工具信息
                    event.sender.send('new-mcp-tool-message', responseID, `${i18n.t('toolCalls.tool', { name: toolName })}\n\n`);

                    toolMessage += `${i18n.t('toolCalls.tool', { name: toolName })}\n\n`;

                    // 向前端显示工具参数
                    event.sender.send('mcp-tool-message-chunk', responseID, i18n.t('toolCalls.parameters', { args: JSON.stringify(args, null, 2) }));
                    toolMessage += i18n.t('toolCalls.parameters', { args: JSON.stringify(args, null, 2) });

                    // 调用工具执行器(mcp)执行工具
                    const result = await mcp.executeTool({
                        name: toolName,
                        arguments: args
                    });

                    // 通知前端工具正在处理中
                    event.sender.send('mcp-tool-message-chunk', responseID, `${i18n.t('toolCalls.processing')}\n\n`);
                    toolMessage += i18n.t('toolCalls.processing') + "\n\n";

                    // 处理工具执行结果
                    if (result && typeof result === 'object') {
                        // 向前端发送执行结果
                        event.sender.send('mcp-tool-message-chunk', responseID, i18n.t('toolCalls.result', { result: JSON.stringify(result, null, 2) }));
                        toolMessage += i18n.t('toolCalls.result', { result: JSON.stringify(result, null, 2) });

                        // 设置结果角色并添加到消息列表，稍后发送给AI
                        result.role = "tool";
                        messages.push(result);
                    } else {
                        // 如果结果不是有效对象，记录错误
                        const errorMsg = i18n.t('toolCalls.invalidResult', { type: typeof result });
                        log.error(errorMsg, result);
                        event.sender.send('mcp-tool-message-chunk', responseID, errorMsg);
                        toolMessage += errorMsg;
                    }

                    // 将工具调用结果添加到会话历史
                    this.addMessage({ role: 'tool', name: toolName, content: toolMessage });
                } catch (toolError) {
                    // 捕获并处理工具执行过程中的错误
                    const errorMsg = i18n.t('toolCalls.error', { message: toolError.message });
                    log.error('工具执行错误:', toolError);
                    event.sender.send('mcp-tool-message-chunk', responseID, errorMsg);
                }
            }
        }

        try {
            // 检查是否已经中断
            if (this.abortController && this.abortController.signal.aborted) {
                log.info("最终回复生成已被中断，不进行后续API调用");
                return "最终回复生成已被中断";
            }

            // 创建第二次API请求，将工具调用结果发送给AI模型生成最终回复
            const secondStream = await client.chat.completions.create({
                model: currentModel.type,
                messages,
                stream: true, // 启用流式响应，便于逐步显示生成内容
                signal: this.abortController ? this.abortController.signal : undefined
            });

            // 处理流式响应的每个数据块
            for await (const chunk of secondStream) {
                // 从响应中提取文本内容
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    // 如果是第一个内容块，创建新消息
                    if (fullResponse === "") {
                        fullResponse = content;
                        event.sender.send('new-ai-message', responseID, content);
                    } else {
                        // 否则追加到现有消息
                        fullResponse += content;
                        event.sender.send('ai-message-chunk', responseID, content);
                    }
                }

                // 检查是否已经中断
                if (this.abortController && this.abortController.signal.aborted) {
                    fullResponse += "!!!消息被中断!!!";
                    break;
                }
            }
        } catch (apiError) {
            // 处理API调用过程中的错误
            const errorMsg = i18n.t('toolCalls.responseFailed', { message: apiError.message });
            log.error('最终响应生成过程中的API错误:', apiError);
            event.sender.send('ai-message-chunk', responseID, errorMsg);
        }

        // 返回处理工具调用后AI生成的完整回复文本
        return fullResponse;
    }
}


module.exports = ChatSession; 