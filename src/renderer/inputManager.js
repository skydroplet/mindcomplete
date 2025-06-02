/**
 * inputManager.js
 * 输入框管理服务模块
 *
 * 该模块负责处理输入框相关的所有功能，包括：
 * - 输入框的自动调整高度
 * - 回车键的处理
 * - 输入框的样式管理
 * - 提示词快捷键功能
 */

const Logger = require('../main/logger');
const log = new Logger('inputManager');
const { ipcRenderer } = require('electron');
const i18n = require('../locales/i18n');
const fs = require('fs');
const path = require('path');

class InputManagerService {
    constructor() {
        this.initTextareaAutoResize();
        this.initInputHandlers();
        this.initPromptSelector();
        this.currentPromptIndex = 0; // 当前选中的提示词索引
        this.boundHandlePromptSelectorKeydown = null; // 存储绑定的事件处理函数
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
                        // 直接调用sendMessage函数
                        if (typeof window.sendMessage === 'function') {
                            window.sendMessage();
                            // 发送消息后重置高度为一行
                            e.target.style.height = '36px';
                        }
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
                    placeholder="输入消息，按Enter发送，Ctrl+Enter换行, Ctrl+P选择用户提示词..." 
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