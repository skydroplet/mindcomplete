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
    ipcMain.handle('create-session', (event, name) => {
        return sessionManager.createSession(name);
    });

    // 加载会话
    ipcMain.handle('load-session', (event, sessionId) => {
        return sessionManager.loadSession(sessionId);
    });

    // 保存当前会话
    ipcMain.handle('save-current-session', () => {
        return sessionManager.saveCurrentSession();
    });

    // 重命名会话
    ipcMain.handle('rename-session', (event, sessionId, newName) => {
        return sessionManager.renameSession(sessionId, newName);
    });

    // 删除会话
    ipcMain.handle('delete-session', (event, sessionId) => {
        return sessionManager.deleteSession(sessionId);
    });

    // 获取当前会话
    ipcMain.handle('get-current-session', () => {
        return sessionManager.getCurrentSession();
    });

    // 获取当前活动会话ID
    ipcMain.handle('get-active-session-id', () => {
        return sessionManager.getActiveSessionId();
    });

    // 清空当前会话消息
    ipcMain.handle('clear-session-messages', () => {
        return sessionManager.clearMessages();
    });
}

module.exports = {
    sessionManager,
    registerSessionIPC
}; 