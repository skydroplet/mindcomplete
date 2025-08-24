/**
 * shortcutsService.js
 * 快捷键服务模块
 *
 * 该模块负责管理应用程序的快捷键功能，包括：
 * - 快捷键数据管理
 * - 快捷键对话框的显示和隐藏
 * - 快捷键列表的生成和渲染
 */

const Logger = require('../main/logger');
const log = new Logger('shortcutsService');
const i18n = require('../locales/i18n');

class ShortcutsService {
    constructor() {
        this.shortcutsDialog = null;
        this.shortcutsData = this.getShortcutsData();
    }

    /**
     * 获取所有快捷键数据
     * @returns {Object} 按分类组织的快捷键数据
     */
    getShortcutsData() {
        return {
            chat: [
                {
                    key: 'Enter',
                    description: 'shortcuts.chat.send'
                },
                {
                    key: 'Ctrl+Enter',
                    description: 'shortcuts.chat.newLine'
                },
                {
                    key: '↑/↓',
                    description: 'shortcuts.chat.history'
                },
                {
                    key: 'Ctrl+P',
                    description: 'shortcuts.chat.selectPrompt'
                },
                {
                    key: 'Ctrl+N',
                    description: 'shortcuts.chat.resetSession'
                }
            ],
            menu: [
                {
                    key: 'Ctrl+,',
                    description: 'shortcuts.menu.settings'
                },
                {
                    key: 'Ctrl+Q',
                    description: 'shortcuts.menu.quit'
                },
                {
                    key: 'Ctrl+R',
                    description: 'shortcuts.menu.reload'
                },
                {
                    key: 'Ctrl+Shift+R',
                    description: 'shortcuts.menu.forceReload'
                },
                {
                    key: 'Ctrl+Shift+I',
                    description: 'shortcuts.menu.devTools'
                },
                {
                    key: 'F11',
                    description: 'shortcuts.menu.fullscreen'
                }
            ],
            navigation: [
                {
                    key: 'Ctrl+0',
                    description: 'shortcuts.navigation.resetZoom'
                },
                {
                    key: 'Ctrl+=',
                    description: 'shortcuts.navigation.zoomIn'
                },
                {
                    key: 'Ctrl+-',
                    description: 'shortcuts.navigation.zoomOut'
                },
                {
                    key: 'Ctrl+M',
                    description: 'shortcuts.navigation.minimize'
                }
            ]
        };
    }

    /**
     * 初始化快捷键服务
     */
    init() {
        this.shortcutsDialog = document.getElementById('shortcuts-dialog');
        if (!this.shortcutsDialog) {
            log.error('快捷键对话框元素未找到');
            return;
        }

        this.setupEventListeners();
        this.renderShortcuts();
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 快捷键按钮点击事件
        const shortcutsBtn = document.getElementById('shortcuts-btn');
        if (shortcutsBtn) {
            shortcutsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showDialog();
            });
        }

        // 关闭按钮点击事件
        const closeBtn = document.getElementById('shortcuts-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hideDialog();
            });
        }

        // 点击对话框外部关闭
        if (this.shortcutsDialog) {
            this.shortcutsDialog.addEventListener('click', (e) => {
                if (e.target === this.shortcutsDialog) {
                    this.hideDialog();
                }
            });
        }

        // ESC键关闭对话框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isDialogVisible()) {
                this.hideDialog();
            }
        });
    }

    /**
     * 显示快捷键对话框
     */
    showDialog() {
        if (!this.shortcutsDialog) return;

        log.info('显示快捷键对话框');
        this.shortcutsDialog.style.display = 'flex';

        // 添加动画效果
        requestAnimationFrame(() => {
            this.shortcutsDialog.classList.add('show');
        });
    }

    /**
     * 隐藏快捷键对话框
     */
    hideDialog() {
        if (!this.shortcutsDialog) return;

        log.info('隐藏快捷键对话框');
        this.shortcutsDialog.classList.remove('show');

        // 延迟隐藏，等待动画完成
        setTimeout(() => {
            this.shortcutsDialog.style.display = 'none';
        }, 300);
    }

    /**
     * 检查对话框是否可见
     * @returns {boolean} 对话框是否可见
     */
    isDialogVisible() {
        return this.shortcutsDialog &&
            this.shortcutsDialog.style.display !== 'none' &&
            this.shortcutsDialog.classList.contains('show');
    }

    /**
     * 渲染快捷键列表
     */
    renderShortcuts() {
        this.renderShortcutSection('chat', 'chat-shortcuts-list');
        this.renderShortcutSection('menu', 'menu-shortcuts-list');
        this.renderShortcutSection('navigation', 'navigation-shortcuts-list');
    }

    /**
     * 渲染特定分类的快捷键
     * @param {string} category 快捷键分类
     * @param {string} containerId 容器元素ID
     */
    renderShortcutSection(category, containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            log.error(`快捷键容器未找到: ${containerId}`);
            return;
        }

        const shortcuts = this.shortcutsData[category] || [];
        container.innerHTML = '';

        shortcuts.forEach(shortcut => {
            const item = document.createElement('div');
            item.className = 'shortcut-item';

            const keyElement = document.createElement('div');
            keyElement.className = 'shortcut-key';
            keyElement.textContent = shortcut.key;

            const descElement = document.createElement('div');
            descElement.className = 'shortcut-description';
            descElement.setAttribute('data-i18n', shortcut.description);
            descElement.textContent = i18n.t(shortcut.description);

            item.appendChild(keyElement);
            item.appendChild(descElement);
            container.appendChild(item);
        });
    }

    /**
     * 更新国际化文本
     */
    updateI18nText() {
        if (!this.shortcutsDialog) return;

        // 更新对话框标题
        const title = document.getElementById('shortcuts-title');
        if (title) {
            title.textContent = i18n.t('shortcuts.title');
        }

        // 更新分类标题
        const sections = this.shortcutsDialog.querySelectorAll('[data-i18n]');
        sections.forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (key) {
                element.textContent = i18n.t(key);
            }
        });

        // 重新渲染快捷键列表以更新描述文本
        this.renderShortcuts();
    }
}

// 创建并导出快捷键服务实例
const shortcutsService = new ShortcutsService();
module.exports = shortcutsService;
