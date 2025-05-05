/**
 * Highlight.js 初始化模块
 * 此脚本确保所有代码块都正确应用语法高亮
 */

const hljs = require('highlight.js');

// 此函数将对所有代码块应用高亮处理
function applyHighlighting() {
    // 选择所有尚未高亮的pre code块
    document.querySelectorAll('pre code:not(.hljs)').forEach((block) => {
        // 应用高亮
        hljs.highlightElement(block);
    });
}

// 初始化对所有现有代码块的highlight.js
document.addEventListener('DOMContentLoaded', () => {
    // 初始应用
    applyHighlighting();
});

// 创建MutationObserver以检测何时向聊天中添加新消息
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
            // 对任何新代码块应用高亮
            applyHighlighting();
        }
    });
});

// 开始观察聊天消息容器
document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.querySelector('.chat-messages');
    if (chatMessages) {
        observer.observe(chatMessages, { childList: true, subtree: true });
    }
});

// 导出applyHighlighting函数，以便从其他脚本调用
window.applyHighlighting = applyHighlighting; 