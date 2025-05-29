/**
 * promptService.js
 * 提示词服务模块
 * 
 * 该模块负责处理与提示词相关的功能，包括：
 * - 从主进程获取提示词列表
 * - 更新提示词选择下拉框
 * - 处理提示词选择事件
 */

const { ipcRenderer } = require('electron');
const Logger = require('../main/logger');
const i18n = require('../locales/i18n');

/**
 * 提示词服务类
 * 负责管理提示词相关的所有功能
 */
class PromptService {
    /**
     * 创建提示词服务实例
     */
    constructor() {
        this.log = new Logger('prompt-service');
        this.promptSelect = document.getElementById('prompt-select');
        this.currentPrompt = null;
    }

    /**
     * 加载提示词列表
     * 
     * 从主进程获取提示词列表，并填充到提示词选择下拉框中
     * 
     * @param {HTMLElement} statusElement - 状态显示元素
     * @returns {Promise<void>}
     */
    async loadPrompts(statusElement) {
        try {
            const prompts = await ipcRenderer.invoke('get-prompts');
            this.log.info('提示词列表:', prompts);

            // 获取当前选择的提示词
            const currentPromptObj = await ipcRenderer.invoke('get-current-prompt');

            // 清空并重新填充下拉列表
            this.promptSelect.innerHTML = `<option value="add_new">${i18n.t('prompts.addNew')}</option>`;

            Object.entries(prompts || {}).forEach(([promptId, prompt]) => {
                const option = document.createElement('option');
                option.value = promptId;
                option.textContent = prompt.name;
                this.promptSelect.appendChild(option);
            });

            // 设置当前选中的提示词
            if (currentPromptObj) {
                this.promptSelect.value = currentPromptObj.id;
                this.currentPrompt = currentPromptObj.id;
            } else {
                this.promptSelect.value = '';
                this.currentPrompt = null;
            }
        } catch (error) {
            this.log.error('加载提示词列表失败:', error.message);
            if (statusElement) {
                statusElement.textContent = i18n.t('prompts.loadingFailed', { error: error.message });
            }
        }
    }

    /**
     * 设置当前提示词
     * @param {string} promptId - 提示词ID
     */
    setCurrentPrompt(promptId) {
        this.currentPrompt = promptId;
    }

    /**
     * 获取当前提示词
     * @returns {string} - 当前提示词ID
     */
    getCurrentPrompt() {
        return this.currentPrompt;
    }

    /**
     * 处理提示词选择事件
     * 
     * @param {HTMLElement} statusElement - 状态显示元素
     * @param {Function} openSettingsWindowWithTab - 打开设置窗口的函数
     * @returns {Promise<void>}
     */
    async handlePromptSelect(statusElement, openSettingsWindowWithTab) {
        try {
            const promptId = this.promptSelect.value || null;

            // 处理选择添加提示词的情况
            if (promptId === 'add_new') {
                // 重置选择框
                const currentPromptObj = await ipcRenderer.invoke('get-current-prompt');
                this.promptSelect.value = currentPromptObj ? currentPromptObj.id : '';

                // 打开配置窗口
                openSettingsWindowWithTab('prompts');
                return;
            }

            // 更新当前提示词
            this.currentPrompt = promptId;

            const success = await ipcRenderer.invoke('set-current-prompt', promptId);

            if (success && statusElement) {
                let message = promptId ? i18n.t('ui.status.promptSelected') : i18n.t('ui.status.promptCleared');
                statusElement.textContent = message;
            }
        } catch (error) {
            this.log.error('设置提示词失败:', error.message);
            if (statusElement) {
                statusElement.textContent = i18n.t('prompts.loadingFailed', { error: error.message });
            }
        }
    }

    /**
     * 为提示词选择下拉框设置事件监听器
     * 
     * @param {HTMLElement} statusElement - 状态显示元素
     * @param {Function} openSettingsWindowWithTab - 打开设置窗口的函数
     */
    setupPromptSelectListeners(statusElement, openSettingsWindowWithTab) {
        this.promptSelect.addEventListener('change', async () => {
            await this.handlePromptSelect(statusElement, openSettingsWindowWithTab);
        });
    }

    /**
     * 获取提示词选择下拉框
     * 
     * @returns {HTMLElement} - 提示词选择下拉框
     */
    getPromptSelect() {
        return this.promptSelect;
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
     * @returns {Promise<void>}
     */
    async saveCurrentPrompt() {
        try {
            this.log.info('开始保存提示词...');
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
                success = await window.ipcRenderer.invoke('add-prompt', prompt);
            }

            this.log.info('保存操作结果:', success);
            if (success) {
                this.log.info('刷新提示词列表...');
                const prompts = await window.ipcRenderer.invoke('get-all-prompts');
                this.log.info('获取到的提示词列表:', JSON.stringify(prompts, null, 2));
                window.prompts = prompts;
                this.updatePromptList(prompts);
                this.resetPromptForm();
            } else {
                throw new Error(i18n.t('errors.saveFailed'));
            }
        } catch (error) {
            this.log.error('保存提示词时出错:', error.message);
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
                        this.log.info('提示词已删除，准备重置表单');

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
                            this.log.info(`窗口焦点重置${success ? '成功' : '失败'}`);

                            requestAnimationFrame(() => {
                                const firstInput = document.getElementById('promptName');
                                if (firstInput) {
                                    this.log.info('尝试设置焦点到提示词名称输入框');
                                    firstInput.focus();
                                    firstInput.click();
                                } else {
                                    this.log.error('未找到提示词名称输入框元素');
                                }
                            });
                        }).catch(err => {
                            this.log.error('重置窗口焦点时出错:', err.message);
                        });
                    }
                } catch (err) {
                    this.log.error('删除失败:', err.message);
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
                    this.updatePromptList(prompts);

                    // 清除当前选中状态
                    window.currentPromptId = null;
                    document.querySelector('#deletePromptBtn').classList.add('hidden');
                    document.querySelector('#copyPromptBtn').classList.add('hidden');

                    // 填充复制的提示词数据
                    document.getElementById('promptName').value = copiedPrompt.name;
                    document.getElementById('promptContent').value = copiedPrompt.content;
                    document.getElementById('promptType').value = copiedPrompt.type;

                    // 确保所有输入框和文本域可编辑
                    document.querySelectorAll('#promptForm input, #promptForm textarea, #promptForm select').forEach(element => {
                        element.readOnly = false;
                        element.disabled = false;
                        element.style.pointerEvents = 'auto'; // 确保CSS不阻止交互
                        element.style.opacity = '1'; // 确保元素是可见的
                        element.tabIndex = 0; // 确保元素可以通过Tab键访问
                    });
                } else {
                    throw new Error('复制提示词失败');
                }
            } catch (error) {
                this.log.error('复制提示词时出错:', error.message);
            }
        });
    }

    /**
     * 设置提示词选择下拉框的值
     * 
     * @param {string} promptId - 要选择的提示词ID
     */
    setPromptSelection(promptId) {
        if (promptId && this.promptSelect) {
            // 更新下拉框选择
            this.promptSelect.value = promptId;
            // 更新当前提示词ID
            this.currentPrompt = promptId;
            this.log.info('从会话加载提示词设置:', promptId);

            // 通知主进程更新当前提示词
            ipcRenderer.invoke('set-current-prompt', promptId).catch(error => {
                this.log.error('设置提示词失败:', error.message);
            });
        }
    }
}

// 创建并导出PromptService实例
const promptService = new PromptService();
module.exports = promptService;