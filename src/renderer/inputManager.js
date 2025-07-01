/**
 * inputManager.js
 * 输入框管理服务模块
 *
 * 该模块负责处理输入框相关的所有功能，包括：
 * - 输入框的自动调整高度
 * - 回车键的处理
 * - 输入框的样式管理
 * - 提示词快捷键功能
 * - 历史消息切换功能
 */

const Logger = require('../main/logger');
const log = new Logger('inputManager');
const { ipcRenderer } = require('electron');

class InputManagerService {
    constructor() {
        this.initTextareaAutoResize();
        this.initInputHandlers();
        this.initPromptSelector();
        this.currentPromptIndex = 0; // 当前选中的提示词索引
        this.boundHandlePromptSelectorKeydown = null; // 存储绑定的事件处理函数

        // 历史消息相关 - 全局共享历史记录
        this.messageHistory = []; // 全局历史消息列表，所有标签页共享
        this.historyIndex = -1; // 当前历史索引，-1表示不在历史记录中
        this.tempInput = ''; // 临时存储当前输入内容
    }

    /**
     * 初始化提示词选择器
     */
    initPromptSelector() {
        // 获取DOM元素
        this.promptSelector = document.getElementById('promptSelector');
        this.promptList = this.promptSelector.querySelector('.prompt-list');
        this.promptClose = this.promptSelector.querySelector('.prompt-selector-close');

        // 绑定事件
        this.promptClose.addEventListener('click', () => this.hidePromptSelector());

        // 点击外部关闭
        document.addEventListener('click', (e) => {
            if (e.target === this.promptSelector) {
                this.hidePromptSelector();
            }
        });
    }

    /**
     * 显示提示词选择器
     * @param {HTMLTextAreaElement} textarea 当前输入框
     */
    async showPromptSelector(textarea) {
        try {
            // 获取所有提示词
            const prompts = await ipcRenderer.invoke('get-prompts', 'user');

            // 清空并填充提示词列表
            this.promptList.innerHTML = '';
            Object.entries(prompts || {}).forEach(([promptId, prompt], index) => {
                const div = document.createElement('div');
                div.className = 'prompt-item';
                div.dataset.index = index;
                div.dataset.content = prompt.content;
                div.innerHTML = ` <span>${prompt.name}</span> `;
                div.addEventListener('click', () => {
                    this.selectPrompt(prompt, textarea);
                });
                this.promptList.appendChild(div);
            });

            // 显示选择器
            this.promptSelector.classList.add('show');

            // 移除可能存在的旧事件监听器
            if (this.boundHandlePromptSelectorKeydown) {
                this.promptSelector.removeEventListener('keydown', this.boundHandlePromptSelectorKeydown);
            }

            // 创建新的绑定事件处理函数
            this.boundHandlePromptSelectorKeydown = (e) => this.handlePromptSelectorKeydown(e, textarea);

            // 添加键盘事件监听
            this.promptSelector.addEventListener('keydown', this.boundHandlePromptSelectorKeydown);

            // 自动选中第一个选项
            const items = this.promptList.querySelectorAll('.prompt-item');
            if (items.length > 0) {
                this.currentPromptIndex = 0;
                this.updatePromptSelection(items);
            }

            // 确保提示词选择框获得焦点
            this.promptSelector.setAttribute('tabindex', '0');
            this.promptSelector.focus();
        } catch (error) {
            log.error('加载提示词列表失败:', error.message);
        }
    }

    /**
     * 处理提示词选择器的键盘事件
     * @param {KeyboardEvent} e 键盘事件
     * @param {HTMLTextAreaElement} textarea 当前输入框
     */
    handlePromptSelectorKeydown(e, textarea) {
        const items = this.promptList.querySelectorAll('.prompt-item');

        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault();
                log.info("up index:", this.currentPromptIndex);
                if (this.currentPromptIndex > 0) {
                    this.currentPromptIndex--;
                    this.updatePromptSelection(items);
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                log.info("down index:", this.currentPromptIndex);
                if (this.currentPromptIndex < items.length - 1) {
                    this.currentPromptIndex++;
                    this.updatePromptSelection(items);
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (this.currentPromptIndex >= 0 && this.currentPromptIndex < items.length) {
                    const promptItem = items[this.currentPromptIndex];
                    const prompt = {
                        name: promptItem.querySelector('span').textContent,
                        content: promptItem.dataset.content
                    };
                    this.selectPrompt(prompt, textarea);
                }
                break;
            case 'Escape':
                e.preventDefault();
                this.hidePromptSelector();
                // 重新聚焦到输入框
                textarea.focus();
                break;
        }
    }

    /**
     * 更新提示词选择状态
     * @param {Array<HTMLElement>} visibleItems 可见的提示词项
     */
    updatePromptSelection(visibleItems) {
        visibleItems.forEach((item, index) => {
            if (index === this.currentPromptIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }

    /**
     * 选择提示词
     * @param {Object} prompt 提示词对象
     * @param {HTMLTextAreaElement} textarea 当前输入框
     */
    selectPrompt(prompt, textarea) {
        // 在光标位置插入提示词内容
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        textarea.value = value.substring(0, start) + prompt.content + value.substring(end);

        // 调整光标位置
        textarea.selectionStart = textarea.selectionEnd = start + prompt.content.length;

        // 调整输入框高度
        this.adjustTextareaHeight(textarea);

        // 隐藏选择器
        this.hidePromptSelector();

        // 重新聚焦到输入框
        textarea.focus();
    }

    /**
     * 初始化文本区域自动调整高度
     */
    initTextareaAutoResize() {
        document.addEventListener('input', (e) => {
            if (e.target.matches('textarea[id^="message-input-"]')) {
                this.adjustTextareaHeight(e.target);
            }
        });
    }

    /**
     * 初始化输入框事件处理器
     * 处理所有类型的输入框，包括标签特定的和全局的
     */
    initInputHandlers() {
        // 处理回车键 - 使用keydown事件处理所有输入框
        document.addEventListener('keydown', (e) => {
            // 标签特定的输入框处理
            if (e.target.matches('textarea[id^="message-input-"]')) {
                // 检查是否在输入法编辑状态
                if (e.isComposing) {
                    return;
                }

                if (e.key === 'Enter') {
                    if (e.ctrlKey) {
                        // Ctrl+Enter 插入换行
                        const start = e.target.selectionStart;
                        const end = e.target.selectionEnd;
                        const value = e.target.value;
                        e.target.value = value.substring(0, start) + '\n' + value.substring(end);
                        e.target.selectionStart = e.target.selectionEnd = start + 1;
                        this.adjustTextareaHeight(e.target);
                    } else {
                        // Enter 发送消息
                        e.preventDefault();

                        // 在发送消息前，将消息添加到历史记录
                        const message = e.target.value.trim();
                        if (message) {
                            this.addToHistory(message);
                        }

                        // 直接调用sendMessage函数
                        if (typeof window.sendMessage === 'function') {
                            window.sendMessage();
                            // 发送消息后重置高度为一行
                            e.target.style.height = '36px';
                        }
                    }
                } else if (e.key === 'ArrowUp') {
                    // 上箭头键：切换到上一条历史消息
                    if (e.target.selectionStart === 0 && e.target.selectionEnd === 0) {
                        e.preventDefault();
                        this.navigateHistory('up', e.target);
                    }
                } else if (e.key === 'ArrowDown') {
                    // 下箭头键：切换到下一条历史消息
                    const textLength = e.target.value.length;
                    if (e.target.selectionStart === textLength && e.target.selectionEnd === textLength) {
                        e.preventDefault();
                        this.navigateHistory('down', e.target);
                    }
                } else if (e.key === 'p' && e.ctrlKey) {
                    // Ctrl+P 显示提示词选择器
                    e.preventDefault();
                    this.showPromptSelector(e.target);
                }
            }
        });
    }

    /**
     * 将消息添加到全局历史记录
     * @param {string} message 消息内容
     */
    addToHistory(message) {
        if (!message || !message.trim()) {
            return;
        }

        // 避免连续重复的消息
        if (this.messageHistory.length === 0 || this.messageHistory[this.messageHistory.length - 1] !== message.trim()) {
            this.messageHistory.push(message.trim());

            // 限制历史记录数量，保留最近的500条
            if (this.messageHistory.length > 500) {
                this.messageHistory.shift(); // 移除最老的记录
            }
        }

        // 重置历史索引
        this.historyIndex = -1;
        this.tempInput = ''; // 清除临时输入

        log.info(`添加全局历史消息: "${message.trim()}", 历史记录总数: ${this.messageHistory.length}`);
    }

    /**
     * 在历史消息中导航
     * @param {string} direction 导航方向，'up' 或 'down'
     * @param {HTMLTextAreaElement} textarea 输入框元素
     */
    navigateHistory(direction, textarea) {
        if (this.messageHistory.length === 0) {
            return; // 没有历史记录
        }

        if (direction === 'up') {
            // 向上导航：显示更早的消息
            if (this.historyIndex === -1) {
                // 首次向上导航，保存当前输入
                if (textarea.value.trim()) {
                    this.tempInput = textarea.value;
                }
                this.historyIndex = this.messageHistory.length - 1;
            } else if (this.historyIndex > 0) {
                this.historyIndex--;
            }

            textarea.value = this.messageHistory[this.historyIndex];
            this.adjustTextareaHeight(textarea);

            // 将光标移到末尾
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);

            log.info(`历史导航向上，索引: ${this.historyIndex}, 消息: "${this.messageHistory[this.historyIndex]}"`);
        } else if (direction === 'down') {
            // 向下导航：显示更新的消息或恢复输入
            if (this.historyIndex < this.messageHistory.length - 1) {
                this.historyIndex++;
                textarea.value = this.messageHistory[this.historyIndex];
                log.info(`历史导航向下，索引: ${this.historyIndex}, 消息: "${this.messageHistory[this.historyIndex]}"`);
            } else if (this.historyIndex === this.messageHistory.length - 1) {
                // 已到达历史记录末尾，恢复临时输入
                this.historyIndex = -1;
                textarea.value = this.tempInput || '';
                this.tempInput = '';
                log.info(`历史导航到末尾，恢复输入: "${textarea.value}"`);
            }

            this.adjustTextareaHeight(textarea);

            // 将光标移到末尾
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
    }

    /**
     * 清除历史记录
     */
    clearHistory() {
        this.messageHistory = [];
        this.historyIndex = -1;
        this.tempInput = '';
        log.info('已清除全局历史记录');
    }

    /**
     * 调整文本区域高度
     * @param {HTMLTextAreaElement} textarea 文本区域元素
     */
    adjustTextareaHeight(textarea) {
        // 重置高度以获取正确的滚动高度
        textarea.style.height = 'auto';

        // 计算新高度，但不超过最大高度
        const newHeight = Math.min(textarea.scrollHeight, 180);
        textarea.style.height = `${newHeight}px`;
    }

    /**
     * 创建输入框HTML
     * @param {string} tabId 标签ID
     * @returns {string} 输入框HTML
     */
    createInputHTML(tabId) {
        return `
            <div class="input-group">
                <textarea 
                    id="message-input-${tabId}" 
                    placeholder="输入消息，按Enter发送，Ctrl+Enter换行，↑↓切换历史消息，Ctrl+P选择用户提示词..." 
                    rows="1"
                ></textarea>
            </div>
        `;
    }

    /**
     * 隐藏提示词选择器
     */
    hidePromptSelector() {
        this.promptSelector.classList.remove('show');
        this.currentPromptIndex = 0;

        // 移除键盘事件监听
        if (this.boundHandlePromptSelectorKeydown) {
            this.promptSelector.removeEventListener('keydown', this.boundHandlePromptSelectorKeydown);
            this.boundHandlePromptSelectorKeydown = null;
        }
    }
}

// 创建并导出输入框管理服务实例
module.exports = new InputManagerService(); 