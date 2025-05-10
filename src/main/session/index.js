/**
 * 会话管理模块入口文件
 * 整合并导出所有会话相关的功能
 */

const sessionManager = require('./sessionManager');

// 注册会话相关的IPC处理函数
function registerSessionIPC(ipcMain) {
    // 获取所有会话
    ipcMain.handle('get-sessions', () => {
        return sessionManager.getSessions();
    });

    // 创建新会话
    ipcMain.handle('create-session', (event) => {
        return sessionManager.createSession();
    });

    // 加载会话
    ipcMain.handle('load-session', (event, sessionId) => {
        const session = sessionManager.loadSession(sessionId);
        return session.data;
    });

    // 重命名会话
    ipcMain.handle('rename-session', (event, sessionId, newName) => {
        return sessionManager.renameSession(sessionId, newName);
    });

    // 删除会话
    ipcMain.handle('delete-session', (event, sessionId) => {
        return sessionManager.deleteSession(sessionId);
    });

    // 配置变更
    ipcMain.handle('select-session-model', (event, sessionId, modelId) => {
        return sessionManager.setSessionModelId(sessionId, modelId);
    });

    ipcMain.handle('select-session-prompt', (event, sessionId, promptId) => {
        return sessionManager.setSessionPromptId(sessionId, promptId);
    });

    ipcMain.handle('select-session-mcp-servers', (event, sessionId, servers) => {
        return sessionManager.setSessionMcpServers(sessionId, servers);
    });

    ipcMain.handle('select-session-conversation-mode', (event, sessionId, mode) => {
        return sessionManager.setSessionConversationMode(sessionId, mode);
    });

    ipcMain.handle('send-message', async (event, sessionId, requestId, message) => {
        return sessionManager.sendMessage(event, sessionId, requestId, message);
    });

    ipcMain.handle('abort-message-generation', (event, sessionId) => {
        return sessionManager.abortMessageGeneration(sessionId);
    });
}

module.exports = {
    sessionManager,
    registerSessionIPC
}; 