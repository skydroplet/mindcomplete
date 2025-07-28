const fs = require('fs');
const path = require('path');
const Logger = require('../logger');
const log = new Logger('session');
const EventEmitter = require('events');
const { app } = require('electron');
const ChatSession = require('./session');

/**
 * 会话管理器
 * 负责管理聊天会话，包括创建会话、保存会话历史、加载会话等功能
 */
class SessionManager extends EventEmitter {
    constructor() {
        super();

        // 获取 Electron 的 userData 路径
        const userDataPath = app.getPath('userData');
        this.sessionDir = path.join(userDataPath, 'user-data', 'sessions');
        fs.mkdirSync(this.sessionDir, { recursive: true });

        // map[sessionId]Session
        this.sessionDataMap = {};
        this.sessionInfoMap = {}; // 除了对话信息的其他信息
        this.sessionInfoFile = path.join(this.sessionDir, 'session-info-list.json');

        // 当前激活的会话ID
        this.currentSessionId = null;

        this.loadSessions();
    }

    /**
     * 获取所有会话列表
     */
    getSessions() {
        const sessionInfoList = [];

        for (const sessionId in this.sessionInfoMap) {
            const sessionInfo = this.sessionInfoMap[sessionId];
            sessionInfoList.push(sessionInfo);
        }

        sessionInfoList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        return sessionInfoList;
    }

    /**
     * 加载所有会话列表
     */
    loadSessions() {
        try {
            if (!fs.existsSync(this.sessionInfoFile)) {
                // 初始没有会话 自动创建一个新的
                this.createSession();
            }

            const sessionInfoData = fs.readFileSync(this.sessionInfoFile, 'utf8');
            this.sessionInfoMap = JSON.parse(sessionInfoData);
            log.info('加载会话', this.sessionInfoMap.length);
        } catch (err) {
            log.error('加载会话列表失败:', err.message);
        }
    }

    updateSessionInfo(session) {
        const sessionInfo = session.getSummary();
        this.sessionInfoMap[session.data.id] = sessionInfo;
        fs.writeFileSync(this.sessionInfoFile, JSON.stringify(this.sessionInfoMap, null, 2));
    }

    /**
     * 设置当前激活的会话
     * @param {string} sessionId - 激活的会话ID
     */
    setActiveSession(sessionId) {
        this.currentSessionId = sessionId;
    }

    /**
     * 创建新会话
     */
    createSession() {
        const currentSession = this.sessionDataMap[this.currentSessionId];
        const session = new ChatSession(null, currentSession);
        this.sessionDataMap[session.data.id] = session;

        this.updateSessionInfo(session);
        return session.data;
    }

    /**
     * 加载指定会话
     * @param {string} sessionId 会话ID
     * @returns {Promise<Session>} 加载的会话对象
     */
    loadSession(sessionId) {
        let session = this.sessionDataMap[sessionId];
        if (session) {
            return session;
        }

        const sessionInfo = this.sessionInfoMap[sessionId];
        if (!sessionInfo) {
            log.error(`加载会话信息 ${sessionId} 失败:`);
            return null;
        }

        session = new ChatSession(sessionInfo.dataFile);
        if (!session) {
            log.error(`加载会话数据 ${sessionId} 失败:`);
            return null;
        }
        this.sessionDataMap[sessionId] = session;
        log.info(`加载会话信息`, sessionInfo);

        return session;
    }

    /**
     * 向指定会话发送消息
     * @param {Object} event Electron IPC事件对象
     * @param {string} sessionId 会话ID
     * @param {string} requestId 一组请求响应ID
     * @param {string} message 消息内容
     * @returns {Promise<Object>} 处理结果
     */
    async sendMessage(event, sessionId, requestId, message) {
        try {
            const session = this.loadSession(sessionId);
            if (!session) {
                throw new Error(`未找到会话 ${sessionId}`);
            }

            const response = await session.sendMessage(event, requestId, message);
            this.updateSessionInfo(session);

            return response;
        } catch (err) {
            log.error(`向会话 ${sessionId} 发送消息失败:`, err.message);
            throw err;
        }
    }

    /**
     * 中断指定会话的消息生成
     * @param {string} sessionId 会话ID
     * @returns {boolean} 是否成功中断
     */
    abortMessageGeneration(sessionId) {
        try {
            log.info(`中断会话ID: ${sessionId}`);

            const session = this.loadSession(sessionId);
            if (!session) {
                log.error(`尝试中断的会话不存在: ${sessionId}`);
                return false;
            }

            this.updateSessionInfo(session);
            return session.abortMessageGeneration();
        } catch (err) {
            log.error(`中断会话 ${sessionId} 的消息失败:`, err.message, err.stack);
            return false;
        }
    }

    /**
     * 重命名会话
     * @param {string} sessionId 会话ID
     * @param {string} newName 新的名称
     */
    renameSession(sessionId, newName) {
        try {
            const session = this.loadSession(sessionId);
            if (!session) {
                return false;
            }

            session.rename(newName);
            this.updateSessionInfo(session);
            return true;
        } catch (err) {
            log.error(`重命名会话 ${sessionId} 失败:`, err.message);
            return false;
        }
    }

    /**
     * 删除会话
     * @param {string} sessionId 会话ID
     */
    deleteSession(sessionId) {
        try {
            const session = this.loadSession(sessionId);
            if (!session) {
                return false;
            }

            session.remove();
            delete this.sessionDataMap[sessionId];
            delete this.sessionInfoMap[sessionId];
            fs.writeFileSync(this.sessionInfoFile, JSON.stringify(this.sessionInfoMap, null, 2));

            // 如果删除的是当前激活会话，需要重新设置激活会话
            if (this.currentSessionId === sessionId) {
                const remainingSessions = Object.keys(this.sessionInfoMap);
                if (remainingSessions.length > 0) {
                    // 选择第一个剩余会话作为激活会话
                    this.setActiveSession(remainingSessions[0]);
                    log.info(`删除激活会话 ${sessionId}，设置新的激活会话: ${remainingSessions[0]}`);
                } else {
                    // 没有剩余会话，清空激活会话
                    this.currentSessionId = null;
                    log.info(`删除最后一个会话 ${sessionId}，清空激活会话`);
                }
            }

            return true;
        } catch (err) {
            log.error(`删除会话 ${sessionId} 失败:`, err.message);
            return false;
        }
    }

    /**
     * 设置会话的模型ID
     * @param {string} sessionId 会话ID
     * @param {string} modelId 模型ID
     * @returns {boolean} 设置是否成功
     */
    setSessionModelId(sessionId, modelId) {
        const session = this.loadSession(sessionId);
        if (!session) {
            log.error("未找到会话:", sessionId)
            return false;
        }

        session.setModelId(modelId);
        this.updateSessionInfo(session);
        return true;
    }

    /**
     * 设置会话的提示词ID
     * @param {string} sessionId 会话ID
     * @param {string} promptId 提示词ID
     * @returns {boolean} 设置是否成功
     */
    setSessionPromptId(sessionId, promptId) {
        const session = this.loadSession(sessionId);
        if (!session) {
            log.error("未找到会话", sessionId)
            return false;
        }

        session.setPromptIds(promptId);
        this.updateSessionInfo(session);
        return true;
    }

    /**
     * 设置会话的Agent ID
     * @param {string} sessionId 会话ID
     * @param {string} agentId Agent ID
     * @returns {boolean} 设置是否成功
     */
    setSessionAgentId(sessionId, agentId) {
        const session = this.loadSession(sessionId);
        if (!session) {
            log.error("未找到会话", sessionId)
            return false;
        }

        session.setAgentId(agentId);
        this.updateSessionInfo(session);
        return true;
    }

    /**
     * 设置会话的MCP服务
     * @param {string} sessionId 会话ID
     * @param {Array<string>} servers MCP服务ID数组
     * @returns {boolean} 设置是否成功
     */
    setSessionMcpServers(sessionId, servers) {
        const session = this.loadSession(sessionId);
        if (!session) {
            log.error("未找到会话", sessionId)
            return false;
        }

        session.setMcpServers(servers);
        this.updateSessionInfo(session);
        return true;
    }

    /**
     * 设置会话对话模式
     * @param {string} sessionId 会话ID
     * @param {string} mode 对话模式 'single-turn' 或 'multi-turn'
     * @returns {boolean} 设置是否成功
     */
    setSessionConversationMode(sessionId, mode) {
        const session = this.loadSession(sessionId);
        if (!session) {
            log.error("未找到会话", sessionId)
            return false;
        }

        session.setConversationMode(mode);
        this.updateSessionInfo(session);
        return true;
    }

    /**
     * 重置会话起始消息
     * @param {string} sessionId 
     * @returns 
     */
    resetSessionStartMessage(sessionId) {
        const session = this.loadSession(sessionId);
        if (!session) {
            log.error("未找到会话", sessionId)
            return false;
        }

        session.resetSessionStartMessage();
        return true;
    }
}

// 创建并导出单例实例
const sessionManager = new SessionManager();
module.exports = sessionManager; 