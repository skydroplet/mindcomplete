/**
 * inputManager.js
 * 输入框管理服务模块
 *
 * 该模块负责处理输入框相关的所有功能，包括：
 * - 输入框的自动调整高度
 * - 回车键的处理
 * - 输入框的样式管理
 */

const Logger = require('../main/logger');
const log = new Logger('inputManager');

class InputManagerService {
    constructor() {
        this.initTextareaAutoResize();
        this.initInputHandlers();
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
                    placeholder="输入消息，按Enter发送，Ctrl+Enter换行..." 
                    rows="1"
                ></textarea>
            </div>
        `;
    }
}

// 创建并导出输入框管理服务实例
module.exports = new InputManagerService(); 