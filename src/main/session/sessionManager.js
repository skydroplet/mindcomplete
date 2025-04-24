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

        // 当前活动会话ID
        this.activeSessionId = null;

        // map[sessionId]Session
        this.sessionMap = {};

        this.loadSessions();

        if (this.sessionMap.size === 0) {
            this.createSession();
        }
    }

    /**
     * 获取所有会话列表
     */
    getSessions() {
        const sessionInfoList = [];

        for (const sessionId in this.sessionMap) {
            const session = this.sessionMap[sessionId];
            const sessionInfo = session.getSummary();
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
            const sessionDates = fs.readdirSync(this.sessionDir);

            sessionDates.forEach(sessionDates => {
                const sessionDateDir = path.join(this.sessionDir, sessionDates);
                const stats = fs.statSync(sessionDateDir);

                if (stats.isDirectory()) {
                    const sessionFiles = fs.readdirSync(sessionDateDir);

                    sessionFiles.forEach(sessionFile => {
                        if (sessionFile.endsWith('.json')) {
                            const sessionFilePath = path.join(sessionDateDir, sessionFile);
                            const session = new ChatSession(sessionFilePath);
                            this.sessionMap[session.data.id] = session;
                        }
                    })
                }
            })

            const sessionInfoList = [];

            for (const sessionId in this.sessionMap) {
                const session = this.sessionMap[sessionId];
                const sessionInfo = session.getSummary();
                sessionInfoList.push(sessionInfo);
            }

            sessionInfoList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            this.sessionInfoList = sessionInfoList;
        } catch (err) {
            log.error('加载会话列表失败:', err.message);
        }
    }

    /**
     * 创建新会话
     */
    createSession() {
        const session = new ChatSession();
        this.sessionMap[session.data.id] = session;
        return session.data;
    }

    /**
     * 加载指定会话
     * @param {string} sessionId 会话ID
     * @returns {Promise<Session>} 加载的会话对象
     */
    loadSession(sessionId) {
        try {
            const session = this.sessionMap[sessionId];
            if (!session) {
                throw new Error(`未找到会话 ${sessionId}`);
            }

            return session;
        } catch (err) {
            log.error(`加载会话 ${sessionId} 失败:`, err.message);
            return null;
        }
    }

    /**
     * 保存当前会话
     */
    saveCurrentSession() {
        try {
            this.currentSession.saveToFile();
            return true;
        } catch (err) {
            log.error('保存当前会话失败:', err.message);
            return false;
        }
    }

    /**
     * 重命名会话
     * @param {string} sessionId 会话ID
     * @param {string} newName 新名称
     */
    renameSession(sessionId, newName) {
        try {
            const session = this.sessionMap[sessionId];
            session.rename(newName);
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
            const session = this.sessionMap[sessionId];
            if (!session) {
                return false;
            }

            session.remove();
            delete this.sessionMap[sessionId];
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
        const session = this.sessionMap[sessionId];
        if (!session) {
            log.error("未找到会话:", sessionId)
            return false;
        }

        session.setModelId(modelId);
        return true;
    }

    /**
     * 设置会话的提示词ID
     * @param {string} sessionId 会话ID
     * @param {string} promptId 提示词ID
     * @returns {boolean} 设置是否成功
     */
    setSessionPromptId(sessionId, promptId) {
        const session = this.sessionMap[sessionId];
        if (!session) {
            log.error("未找到会话", sessionId)
            return false;
        }

        session.setPromptId(promptId);
        return true;
    }

    /**
     * 设置会话的对话模式
     * @param {string} sessionId 会话ID
     * @param {string} mode 对话模式 'single-turn' 或 'multi-turn'
     * @returns {boolean} 设置是否成功
     */
    setSessionConversationMode(sessionId, mode) {
        const session = this.sessionMap[sessionId];
        if (!session) {
            log.error("未找到会话", sessionId);
            return false;
        }

        session.setConversationMode(mode);
        return true;
    }

    /**
     * 设置会话使用的MCP服务器列表
     * @param {string} sessionId 会话ID
     * @param {Array} mcpServers MCP服务器ID数组
     * @returns {boolean} 设置是否成功
     */
    setSessionMcpServers(sessionId, mcpServers) {
        const session = this.sessionMap[sessionId];
        if (!session) {
            log.error("未找到会话", sessionId)
            return false;
        }

        session.setMcpServers(mcpServers);
        return true;
    }

    /**
     * 获取会话使用的MCP服务器列表
     * @param {string} sessionId 会话ID
     * @returns {Array} MCP服务器ID数组
     */
    getSessionMcpServers(sessionId) {
        const session = this.sessionMap[sessionId];
        if (!session) {
            log.error("未找到会话", sessionId)
            return [];
        }

        return session.getMcpServers();
    }
}

// 创建并导出单例实例
const sessionManager = new SessionManager();
module.exports = sessionManager; 