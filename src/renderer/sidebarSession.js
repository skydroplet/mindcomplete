/**
 * sessionService.js
 * 会话管理服务模块
 *
 * 该模块负责管理聊天会话的所有功能，包括：
 * - 会话的创建和加载
 * - 会话的重命名和删除
 * - 会话列表的管理和渲染
 * - 会话状态的维护
 *
 * 通过将会话管理功能从renderer.js中分离出来，提高了代码的模块化和可维护性
 */

const { ipcRenderer } = require('electron');
const Logger = require('../main/logger');
const log = new Logger('sidebarSession');
const i18n = require('../locales/i18n');

/**
 * 会话服务类
 * 负责管理聊天会话，包括创建、加载、重命名和删除会话
 */
class SidebarSessionService {
    constructor() {
        // 当前会话ID
        this.currentSessionId = null;

        // DOM元素引用
        this.sessionsContainer = document.getElementById('sessions-container');
        this.statusElement = document.getElementById('status');
        this.appTitleHeader = document.getElementById('app-title-header');
    }

    /**
     * 获取当前会话ID
     * @returns {string} 当前会话ID
     */
    getCurrentSessionId() {
        return this.currentSessionId;
    }

    /**
     * 设置当前会话ID
     * @param {string} sessionId 会话ID
     */
    setCurrentSessionId(sessionId) {
        this.currentSessionId = sessionId;
    }

    setLoadSessionCallback(callback) {
        this.loadSessionCallback = callback;
    }

    setRenameSessionCallback(callback) {
        this.renameSessionCallback = callback;
    }

    /**
     * 加载会话列表
     * @returns {Promise<Array>} 会话列表
     */
    async loadSessions() {
        try {
            log.info(i18n.t('logs.loadSessionList'));
            this.statusElement.textContent = i18n.t('ui.status.loading');
            const sessions = await ipcRenderer.invoke('get-sessions');

            // 清空会话容器
            this.sessionsContainer.innerHTML = '';

            if (sessions.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.className = 'session-empty';
                emptyMsg.textContent = i18n.t('session.noSessions');
                this.sessionsContainer.appendChild(emptyMsg);
                return [];
            }

            // 渲染会话列表
            sessions.forEach(session => {
                const sessionItem = document.createElement('div');
                sessionItem.className = `session-item ${session.id === this.currentSessionId ? 'active' : ''}`;
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
                    this.renameSession(session.id, session.name);
                };
                actionsDiv.appendChild(renameBtn);

                // 创建删除按钮，使用图标替代文字
                // 只剩一个的时候不允许删除
                if (sessions.length > 1) {
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'session-action-btn';
                    deleteBtn.title = i18n.t('session.delete');
                    deleteBtn.innerHTML = '🗑️'; // 垃圾桶图标
                    deleteBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.deleteSession(session.id);
                    };
                    actionsDiv.appendChild(deleteBtn);
                }

                sessionItem.appendChild(nameSpan);
                sessionItem.appendChild(actionsDiv);

                // 点击会话项加载对应会话
                if (this.loadSessionCallback) {
                    sessionItem.addEventListener('click', () => this.loadSessionCallback(session.id));
                }

                this.sessionsContainer.appendChild(sessionItem);
            });

            this.statusElement.textContent = i18n.t('ui.status.ready');
            return sessions;
        } catch (error) {
            log.error(i18n.t('logs.sessionListLoadFailed'), error.message);
            this.statusElement.textContent = i18n.t('errors.loadSessionListFailed', { error: error.message });
            return [];
        }
    }

    /**
     * 加载指定会话
     *
     * 此函数加载指定ID的会话，并在界面上显示其消息历史
     *
     * @param {string} sessionId 会话ID
     * @returns {Promise<Object>} 加载的会话对象
     */
    async loadSession(sessionId) {
        try {
            this.statusElement.textContent = i18n.t('ui.status.loadingSession');

            // 加载会话
            const session = await ipcRenderer.invoke('load-session', sessionId);
            if (!session) {
                this.statusElement.textContent = i18n.t('ui.status.sessionLoadFailed');
                return null;
            }

            this.currentSessionId = session.id;

            // 更新页面标题，显示会话名称
            if (this.appTitleHeader) {
                this.appTitleHeader.textContent = session.name;
            }

            // 更新会话列表UI
            const items = document.querySelectorAll('.session-item');
            items.forEach(item => {
                if (item.getAttribute('data-id') === sessionId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            this.statusElement.textContent = i18n.t('ui.status.sessionLoaded', { name: session.name });
            return session;
        } catch (error) {
            log.error(i18n.t('logs.loadSessionFailed'), error.message);
            this.statusElement.textContent = i18n.t('ui.status.loadSessionFailed', { error: error.message });
            throw error;
        }
    }

    /**
     * 重命名会话
     * @param {string} sessionId 会话ID
     * @param {string} oldName 旧会话名称
     */
    async renameSession(sessionId, oldName) {
        try {
            // 保存当前正在重命名的会话ID和旧名称
            this.currentRenamingSessionId = sessionId;
            this.currentOldName = oldName;

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
            log.error(i18n.t('logs.renameSessionFailed'), error.message);
            this.statusElement.textContent = i18n.t('ui.status.renamingSessionFailed', { error: error.message });
        }
    }

    /**
     * 确认重命名会话
     */
    async confirmRenameSession() {
        try {
            const newNameInput = document.getElementById('new-name-input');
            const newName = newNameInput.value.trim();

            // 如果名称为空或没有变化，关闭对话框
            if (!newName || newName === this.currentOldName) {
                this.closeRenameDialog();
                return;
            }

            await ipcRenderer.invoke('rename-session', this.currentRenamingSessionId, newName);

            // 更新UI
            const sessionItem = document.querySelector(`.session-item[data-id="${this.currentRenamingSessionId}"] .session-name`);
            if (sessionItem) {
                sessionItem.textContent = newName;
            }

            // 如果是当前会话，更新状态栏和标题
            if (this.renameSessionCallback) {
                this.renameSessionCallback(this.currentRenamingSessionId, newName);
            }

            // 关闭对话框
            this.closeRenameDialog();
        } catch (error) {
            log.error(i18n.t('logs.renameSessionFailed'), error.message);
            this.statusElement.textContent = i18n.t('ui.status.renamingSessionFailed', { error: error.message });
            this.closeRenameDialog();
        }
    }

    /**
     * 关闭重命名对话框
     */
    closeRenameDialog() {
        const renameDialog = document.getElementById('rename-dialog');
        renameDialog.style.display = 'none';

        // 清除当前重命名状态
        this.currentRenamingSessionId = null;
        this.currentOldName = null;
    }

    setDeleteSessionCallback(callback) {
        this.deleteSessionCallback = callback;
    }

    /**
     * 删除会话
     *
     * 此函数删除指定ID的会话，如果删除的是当前会话，则会创建一个新会话
     *
     * @param {string} sessionId 会话ID
     */
    async deleteSession(sessionId, clearChatMessages) {
        try {
            if (!confirm(i18n.t('session.confirmDelete'))) return;

            await ipcRenderer.invoke('delete-session', sessionId);

            if (this.deleteSessionCallback) {
                this.deleteSessionCallback(sessionId);
            }

            // 重新加载会话列表
            await this.loadSessions();

            this.statusElement.textContent = i18n.t('ui.status.sessionDeleted');
        } catch (error) {
            log.error('删除会话失败:', error.message);
            this.statusElement.textContent = `删除会话失败: ${error.message}`;
        }
    }
}

// 创建并导出会话服务实例
const sidebarSessionService = new SidebarSessionService();
module.exports = sidebarSessionService;
