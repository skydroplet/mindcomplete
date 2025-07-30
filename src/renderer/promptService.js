/**
 * promptService.js
 * 提示词服务模块
 * 
 * 该模块负责处理与提示词相关的功能，包括：
 * - 管理提示词列表
 * - 处理提示词选择和编辑
 * - 提示词的增删改查操作
 */

const { ipcRenderer } = require('electron');
const Logger = require('../main/logger');
const i18n = require('../locales/i18n');

// 模块级别的logger，所有实例共享
const log = new Logger('prompt-service');

/**
 * 提示词服务类
 * 负责管理提示词相关的所有功能
 */
class PromptService {
    /**
     * 创建提示词服务实例
     */
    constructor() {
        this.currentPrompt = null;
    }

    /**
     * 更新提示词列表
     * @param {Object} prompts - 提示词对象
     */
    updatePromptList(prompts) {
        const promptList = document.getElementById('promptList');
        promptList.innerHTML = '';

        Object.entries(prompts).forEach(([promptId, prompt]) => {
            const div = document.createElement('div');
            div.className = 'model-item';

            // 如果是当前选中的提示词，添加active类
            if (window.currentPromptId === promptId) {
                div.classList.add('active');
            }

            // 显示提示词名称及类型
            const nameSpan = document.createElement('span');
            nameSpan.textContent = prompt.name;

            const typeSpan = document.createElement('span');
            typeSpan.className = 'prompt-type-badge';
            typeSpan.textContent = prompt.type || 'system';  // 默认为system

            div.appendChild(nameSpan);
            div.appendChild(typeSpan);

            div.dataset.promptId = promptId;
            div.onclick = () => this.selectPrompt(promptId);
            promptList.appendChild(div);
        });
    }

    /**
     * 选择提示词
     * @param {string} promptId - 提示词ID
     */
    selectPrompt(promptId) {
        // 移除所有列表项的active类
        document.querySelectorAll('#promptList .model-item').forEach(item => {
            item.classList.remove('active');
        });

        // 为当前选中的项添加active类
        const selectedItem = document.querySelector(`#promptList .model-item[data-prompt-id="${promptId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active');
        }

        window.currentPromptId = promptId;
        const prompts = window.prompts || {};
        if (prompts[promptId]) {
            const prompt = prompts[promptId];
            document.getElementById('promptName').value = prompt.name;
            document.getElementById('promptContent').value = prompt.content;

            // 设置提示词类型
            if (prompt.type) {
                document.getElementById('promptType').value = prompt.type;
            } else {
                document.getElementById('promptType').value = 'system'; // 默认为系统提示词
            }

            // 显示删除按钮和复制按钮
            document.querySelector('#deletePromptBtn').classList.remove('hidden');
            document.querySelector('#copyPromptBtn').classList.remove('hidden');
        }
    }

    /**
     * 保存当前提示词
     * @returns {Promise<boolean>}
     */
    async saveCurrentPrompt() {
        try {
            log.info('开始保存提示词...');
            const prompt = {
                name: document.getElementById('promptName').value,
                content: document.getElementById('promptContent').value,
                type: document.getElementById('promptType').value
            };

            let success;

            if (window.currentPromptId) {
                success = await window.ipcRenderer.invoke('update-prompt', {
                    promptId: window.currentPromptId,
                    prompt
                });
            } else {
                const promptId = await window.ipcRenderer.invoke('add-prompt', prompt);
                success = !!promptId;
            }

            log.info('保存操作结果:', success);
            if (success) {
                log.info('刷新提示词列表...');
                const prompts = await window.ipcRenderer.invoke('get-all-prompts');
                log.info('获取到的提示词列表:', JSON.stringify(prompts, null, 2));
                window.prompts = prompts;
                this.updatePromptList(prompts);
                this.resetPromptForm();
                return true;
            } else {
                log.error('保存失败');
                return false;
            }
        } catch (error) {
            log.error('保存提示词时出错:', error.message);
            return false;
        }
    }

    /**
     * 重置提示词表单
     */
    resetPromptForm() {
        document.getElementById('promptForm').reset();
        window.currentPromptId = null;
        document.querySelector('#deletePromptBtn').classList.add('hidden');
        document.querySelector('#copyPromptBtn').classList.add('hidden');

        // 确保表单元素的父容器不阻止交互
        const formContainer = document.getElementById('promptForm').parentElement;
        if (formContainer) {
            formContainer.style.pointerEvents = 'auto';
            formContainer.style.visibility = 'visible';
        }

        // 确保所有输入框和文本域可编辑
        document.querySelectorAll('#promptForm input, #promptForm textarea, #promptForm select').forEach(element => {
            element.readOnly = false;
            element.disabled = false;
            element.style.pointerEvents = 'auto'; // 确保CSS不阻止交互
            element.style.opacity = '1'; // 确保元素是可见的
            element.tabIndex = 0; // 确保元素可以通过Tab键访问
        });
    }

    /**
     * 初始化提示词相关事件监听器
     */
    initPromptEventListeners() {
        document.getElementById('addPromptBtn').addEventListener('click', () => {
            this.resetPromptForm();
        });

        document.getElementById('savePromptBtn').addEventListener('click', () => {
            const nameInput = document.getElementById('promptName');
            if (nameInput && !nameInput.value.trim()) {
                nameInput.focus();
                return;
            }

            this.saveCurrentPrompt();
        });

        document.getElementById('cancelPromptBtn').addEventListener('click', () => {
            this.resetPromptForm();
        });

        document.getElementById('deletePromptBtn').addEventListener('click', async () => {
            if (window.currentPromptId && confirm(i18n.t('prompts.confirmDelete'))) {
                try {
                    const success = await window.ipcRenderer.invoke('delete-prompt', window.currentPromptId);
                    if (success) {
                        const prompts = await window.ipcRenderer.invoke('get-all-prompts');
                        window.prompts = prompts;
                        this.updatePromptList(prompts);

                        // 记录删除操作
                        log.info('提示词已删除，准备重置表单');

                        // 先重置基本的表单状态
                        window.currentPromptId = null;
                        document.querySelector('#deletePromptBtn').classList.add('hidden');
                        document.querySelector('#copyPromptBtn').classList.add('hidden');
                        document.getElementById('promptForm').reset();

                        // 确保所有输入框和文本域可编辑
                        document.querySelectorAll('#promptForm input, #promptForm textarea, #promptForm select')
                            .forEach(element => {
                                element.readOnly = false;
                                element.disabled = false;
                            });

                        // 通过IPC重置窗口焦点
                        ipcRenderer.invoke('reset-window-focus').then((success) => {
                            log.info(`窗口焦点重置${success ? '成功' : '失败'}`);

                            requestAnimationFrame(() => {
                                const firstInput = document.getElementById('promptName');
                                if (firstInput) {
                                    log.info('尝试设置焦点到提示词名称输入框');
                                    firstInput.focus();
                                    firstInput.click();
                                } else {
                                    log.error('未找到提示词名称输入框元素');
                                }
                            });
                        }).catch(err => {
                            log.error('重置窗口焦点时出错:', err.message);
                        });
                    }
                } catch (err) {
                    log.error('删除失败:', err.message);
                }
            }
        });

        // 复制提示词按钮处理
        document.getElementById('copyPromptBtn').addEventListener('click', async () => {
            try {
                if (!window.currentPromptId) return;

                const prompts = window.prompts || {};
                const currentPrompt = prompts[window.currentPromptId];
                if (!currentPrompt) return;

                // 创建一个复制的提示词对象
                const copiedPrompt = {
                    name: `${currentPrompt.name} (复制)`,
                    content: currentPrompt.content,
                    type: currentPrompt.type || 'system'
                };

                // 保存新复制的提示词
                const promptId = await window.ipcRenderer.invoke('add-prompt', copiedPrompt);
                if (promptId) {
                    // 刷新提示词列表
                    const prompts = await window.ipcRenderer.invoke('get-all-prompts');
                    window.prompts = prompts;
                    window.currentPromptId = promptId;
                    this.updatePromptList(prompts);
                    this.selectPrompt(promptId);
                } else {
                    throw new Error('复制提示词失败');
                }
            } catch (error) {
                log.error('复制提示词时出错:', error.message);
            }
        });
    }

    /**
     * 从主进程获取所有提示词并加载到界面
     * @param {HTMLElement} statusElement - 状态显示元素（可选）
     * @returns {Promise<Object>} - 提示词列表
     */
    async fetchPrompts(statusElement = null) {
        try {
            if (statusElement) {
                statusElement.textContent = i18n.t('ui.status.loadingPrompts') || '加载提示词列表...';
            }

            const prompts = await ipcRenderer.invoke('get-prompts');
            this.prompts = prompts;
            // 同步更新window.prompts，确保全局状态一致
            window.prompts = prompts;

            if (statusElement) {
                statusElement.textContent = i18n.t('ui.status.ready');
            }

            return prompts;
        } catch (error) {
            log.error('获取提示词列表失败:', error.message);
            if (statusElement) {
                statusElement.textContent = i18n.t('prompts.loadingFailed', { error: error.message }) || `加载提示词失败: ${error.message}`;
            }
            return {};
        }
    }
}

// 创建并导出PromptService实例
const promptService = new PromptService();
module.exports = promptService;