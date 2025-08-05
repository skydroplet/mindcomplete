/**
 * markdownRenderer.js
 * Markdown渲染工具模块
 * 
 * 提供统一的Markdown渲染功能，包括：
 * - Markdown配置
 * - 内容渲染
 * - 代码高亮
 */

const marked = require('marked');
const hljs = require('highlight.js');
const Logger = require('../../main/logger');

const log = new Logger('markdownRenderer');

/**
 * Markdown渲染器类
 */
class MarkdownRenderer {
    constructor() {
        this.configureMarked();
    }

    /**
     * 配置 marked 使用 highlight.js
     */
    configureMarked() {
        marked.setOptions({
            highlight: function (code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            langPrefix: 'hljs language-',
            breaks: true,      // 启用换行符转换为 <br>
            gfm: true,         // 启用 GitHub 风格的 Markdown
            mangle: false,     // 禁用自动转义 HTML
            headerIds: true,   // 为标题生成 ID
            smartLists: true   // 使用更智能的列表行为
        });
    }

    /**
     * 渲染Markdown内容
     * @param {string} content - 要渲染的Markdown内容
     * @param {HTMLElement} container - 容器元素
     * @param {string} className - 容器的CSS类名
     * @returns {boolean} 是否渲染成功
     */
    renderContent(content, container, className = 'message-content') {
        if (!content || !container) {
            log.warn('Invalid content or container for Markdown rendering');
            return false;
        }

        try {
            // 使用marked渲染Markdown内容
            const renderedContent = marked.parse(content);
            container.innerHTML = `<div class="${className}">${renderedContent}</div>`;

            // 对渲染后的内容应用代码高亮
            this.highlightCodeBlocks(container);

            log.info('Markdown content rendered successfully');
            return true;
        } catch (error) {
            log.error('Failed to render Markdown content:', error.message);
            return false;
        }
    }

    /**
     * 对容器中的代码块应用语法高亮
     * @param {HTMLElement} container - 容器元素
     */
    highlightCodeBlocks(container) {
        const codeBlocks = container.querySelectorAll('pre code');
        codeBlocks.forEach(block => {
            hljs.highlightElement(block);
        });
    }

    /**
     * 渲染Markdown内容到指定容器，失败时回退到纯文本
     * @param {string} content - 要渲染的Markdown内容
     * @param {HTMLElement} container - 容器元素
     * @param {string} className - 容器的CSS类名
     * @param {string} fallbackClassName - 回退时的CSS类名
     */
    renderWithFallback(content, container, className = 'message-content', fallbackClassName = 'plain-text') {
        const success = this.renderContent(content, container, className);

        if (!success) {
            // 回退到纯文本显示
            container.innerHTML = `<pre class="${fallbackClassName}">${content}</pre>`;
            log.warn('Markdown rendering failed, falling back to plain text');
        }
    }
}

// 创建单例实例
const markdownRenderer = new MarkdownRenderer();

module.exports = markdownRenderer; 