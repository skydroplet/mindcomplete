const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Logger = require('../logger');
const log = new Logger('session');
const EventEmitter = require('events');
const { app } = require('electron');
const i18n = require('../../locales/i18n');

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

        // 会话列表缓存
        this.sessionsCache = null;

        // 当前会话的消息历史
        this.currentSession = {
            id: null,
            name: '',
            messages: [],
            createdAt: null,
            updatedAt: null,
            messageCount: 0 // 用于跟踪消息ID
        };

        // 初始化
        this.loadSessions();
    }

    /**
     * 生成不重复的随机会话ID
     */
    generateSessionId() {
        return 'session-' + crypto.randomBytes(5).toString('hex');
    }

    /**
     * 获取所有会话列表
     */
    getSessions() {
        return this.loadSessions();
    }

    /**
     * 加载所有会话列表
     */
    loadSessions() {
        try {
            if (this.sessionsCache) {
                return this.sessionsCache;
            }

            const sessions = [];
            const files = fs.readdirSync(this.sessionDir);

            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(this.sessionDir, file);
                        const data = fs.readFileSync(filePath, 'utf8');
                        const session = JSON.parse(data);
                        sessions.push({
                            id: session.id,
                            name: session.name,
                            createdAt: session.createdAt,
                            updatedAt: session.updatedAt,
                            messageCount: session.messages.length
                        });
                    } catch (err) {
                        log.error(`解析会话文件 ${file} 失败:`, err);
                    }
                }
            }

            // 按更新时间排序，最新的在前面
            sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            this.sessionsCache = sessions;
            return sessions;
        } catch (err) {
            log.error('加载会话列表失败:', err);
            return [];
        }
    }

    /**
     * 创建新会话
     * @param {string} name 会话名称
     */
    createSession(name = '') {
        // 保存当前会话
        if (this.activeSessionId) {
            this.saveCurrentSession();
        }

        const sessionId = this.generateSessionId();
        const now = new Date().toLocaleString();

        this.currentSession = {
            id: sessionId,
            name: name || i18n.t('session.defaultNewName', { date: new Date().toLocaleString() }),
            messages: [],
            createdAt: now.toLocaleString(),
            updatedAt: now.toLocaleString(),
            lastMessageId: 1 // 初始化消息ID计数器
        };

        this.activeSessionId = sessionId;
        this.saveCurrentSession();

        // 清除缓存
        this.sessionsCache = null;

        // 通知会话创建
        this.emit('session-created', this.currentSession);

        return this.currentSession;
    }

    /**
     * 加载指定会话
     * @param {string} sessionId 会话ID
     */
    loadSession(sessionId) {
        try {
            // 保存当前会话
            if (this.activeSessionId) {
                this.saveCurrentSession();
            }

            const filePath = path.join(this.sessionDir, `${sessionId}.json`);
            if (!fs.existsSync(filePath)) {
                log.error(`会话 ${sessionId} 不存在`);
                return null;
            }

            const data = fs.readFileSync(filePath, 'utf8');
            this.currentSession = JSON.parse(data);
            this.activeSessionId = sessionId;

            // 通知会话加载
            this.emit('session-loaded', this.currentSession);

            return this.currentSession;
        } catch (err) {
            log.error(`加载会话 ${sessionId} 失败:`, err);
            return null;
        }
    }

    /**
     * 保存当前会话
     */
    saveCurrentSession() {
        try {
            if (!this.activeSessionId || !this.currentSession.id) {
                return false;
            }

            this.currentSession.updatedAt = new Date().toLocaleString();
            const filePath = path.join(this.sessionDir, `${this.currentSession.id}.json`);

            fs.writeFileSync(filePath, JSON.stringify(this.currentSession, null, 2));

            // 清除缓存
            this.sessionsCache = null;

            // 通知会话保存
            this.emit('session-saved', this.currentSession);

            return true;
        } catch (err) {
            log.error('保存当前会话失败:', err);
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
            const filePath = path.join(this.sessionDir, `${sessionId}.json`);
            if (!fs.existsSync(filePath)) {
                return false;
            }

            let session;
            if (sessionId === this.activeSessionId) {
                // 如果是当前会话，直接修改内存中的数据
                this.currentSession.name = newName;
                session = this.currentSession;
            } else {
                // 否则从文件加载
                const data = fs.readFileSync(filePath, 'utf8');
                session = JSON.parse(data);
                session.name = newName;
            }

            session.updatedAt = new Date().toLocaleString();
            fs.writeFileSync(filePath, JSON.stringify(session, null, 2));

            // 清除缓存
            this.sessionsCache = null;

            // 通知会话更新
            this.emit('session-renamed', sessionId, newName);

            return true;
        } catch (err) {
            log.error(`重命名会话 ${sessionId} 失败:`, err);
            return false;
        }
    }

    /**
     * 删除会话
     * @param {string} sessionId 会话ID
     */
    deleteSession(sessionId) {
        try {
            const filePath = path.join(this.sessionDir, `${sessionId}.json`);
            if (!fs.existsSync(filePath)) {
                return false;
            }

            fs.unlinkSync(filePath);

            // 如果删除的是当前会话，清空当前会话
            if (sessionId === this.activeSessionId) {
                this.activeSessionId = null;
                this.currentSession = {
                    id: null,
                    name: '',
                    messages: [],
                    createdAt: null,
                    updatedAt: null,
                    lastMessageId: 0
                };
            }

            // 清除缓存
            this.sessionsCache = null;

            // 通知会话删除
            this.emit('session-deleted', sessionId);

            return true;
        } catch (err) {
            log.error(`删除会话 ${sessionId} 失败:`, err);
            return false;
        }
    }

    /**
     * 获取当前活动会话
     */
    getCurrentSession() {
        return this.currentSession;
    }

    /**
     * 获取当前活动会话ID
     */
    getActiveSessionId() {
        return this.activeSessionId;
    }

    /**
     * 添加消息到当前会话
     * @param {Object} message 消息对象 {role, content}
     */
    addMessage(message) {
        // 如果没有活动会话，创建一个
        if (!this.activeSessionId) {
            this.createSession();
        }

        // 确保 lastMessageId 字段存在
        if (this.currentSession.messageCount === undefined) {
            this.currentSession.messageCount = 0;
        }

        if (this.currentSession.messageCount === 0 && message.role === 'user') {
            this.currentSession.name = message.content;
        }

        // 递增消息ID
        const messageId = ++this.currentSession.messageCount;
        this.currentSession.messageCount = messageId;

        // 添加消息及其ID
        this.currentSession.messages.push({
            id: messageId,
            ...message,
            timestamp: new Date().toLocaleString()
        });

        // 保存会话
        this.saveCurrentSession();

        return true;
    }

    /**
     * 清空当前会话的消息
     */
    clearMessages() {
        if (this.activeSessionId) {
            this.currentSession.messages = [];
            // 重置消息ID计数器
            this.currentSession.messageCount = 0;
            this.saveCurrentSession();

            // 通知会话消息已清空
            this.emit('session-messages-cleared', this.activeSessionId);

            return true;
        }
        return false;
    }
}

// 创建并导出单例实例
const sessionManager = new SessionManager();
module.exports = sessionManager; 