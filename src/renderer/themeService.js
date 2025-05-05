/**
 * themeService.js
 * 主题管理服务模块
 *
 * 该模块负责管理应用程序的主题功能，包括：
 * - 主题切换
 * - 主题样式应用
 * - 代码高亮主题更新
 * - 系统主题变化监听
 */

const { ipcRenderer } = require('electron');
const Logger = require('../main/logger');
const hljs = require('highlight.js');

/**
 * ThemeService 类
 * 封装了所有与主题相关的功能
 */
class ThemeService {
    /**
     * 构造函数
     * 初始化主题服务所需的属性
     */
    constructor() {
        this.log = new Logger('themeService');
        this.themeMenu = null;
        this.systemThemeMediaQuery = null;
        this.themeCache = {}; // 替代window对象上的缓存属性
    }

    /**
     * 初始化主题切换功能
     * 包括创建主题菜单、设置事件监听器和初始化主题
     */
    initThemeToggle() {
        const themeToggle = document.getElementById('theme-toggle');

        // 检查theme-toggle元素是否存在
        if (!themeToggle) {
            this.log.error('主题切换按钮未找到！主题切换功能初始化失败。');
            return; // 提前返回，避免在undefined上添加事件监听器
        }

        // 从后端获取主题设置
        ipcRenderer.invoke('get-theme').then(theme => {
            if (theme) {
                localStorage.setItem('theme', theme);
                this.applyTheme(theme);
            } else {
                // 如果后端没有设置，则使用本地存储的主题
                const savedTheme = localStorage.getItem('theme') || 'light';
                this.applyTheme(savedTheme);
            }
        }).catch(error => {
            // 如果获取失败，使用本地存储
            const savedTheme = localStorage.getItem('theme') || 'light';
            this.applyTheme(savedTheme);
        });

        // 创建主题菜单
        this.themeMenu = document.createElement('div');
        this.themeMenu.className = 'theme-menu';
        this.themeMenu.innerHTML = `
            <div class="theme-menu-item" data-theme-option="light">浅色</div>
            <div class="theme-menu-item" data-theme-option="dark">深色</div>
            <div class="theme-menu-item" data-theme-option="auto">自动</div>
        `;
        this.themeMenu.style.display = 'none';
        document.body.appendChild(this.themeMenu);

        // 系统主题变化监听器
        this.systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.systemThemeMediaQuery.addEventListener('change', (e) => {
            if (localStorage.getItem('theme') === 'auto') {
                const newTheme = e.matches ? 'dark' : 'light';
                this.log.info(`系统主题变化，新主题: ${newTheme}`);
                this.applyTheme('auto', newTheme);
            }
        });

        // 切换主题菜单显示
        themeToggle.addEventListener('click', (e) => {
            e.stopPropagation();

            // 显示或隐藏菜单
            if (this.themeMenu.style.display === 'none') {
                const rect = themeToggle.getBoundingClientRect();
                this.themeMenu.style.top = (rect.bottom + 5) + 'px';
                this.themeMenu.style.right = (window.innerWidth - rect.right) + 'px';
                this.themeMenu.style.display = 'block';

                // 标记当前选中的主题
                const currentTheme = localStorage.getItem('theme') || 'light';
                this.themeMenu.querySelectorAll('.theme-menu-item').forEach(item => {
                    item.classList.toggle('active', item.dataset.themeOption === currentTheme);
                });
            } else {
                this.themeMenu.style.display = 'none';
            }
        });

        // 点击菜单项切换主题
        this.themeMenu.addEventListener('click', (e) => {
            if (e.target.classList.contains('theme-menu-item')) {
                const newTheme = e.target.dataset.themeOption;
                localStorage.setItem('theme', newTheme);

                if (newTheme === 'auto') {
                    // 自动模式下，根据系统主题设置
                    const systemTheme = this.systemThemeMediaQuery.matches ? 'dark' : 'light';
                    this.applyTheme(newTheme, systemTheme);
                } else {
                    this.applyTheme(newTheme);
                }

                // 通知主进程当前主题更改，以便更新配置
                ipcRenderer.send('theme-changed', newTheme);
                this.themeMenu.style.display = 'none';
            }
        });

        // 点击页面其他区域关闭菜单
        document.addEventListener('click', () => {
            this.themeMenu.style.display = 'none';
        });
    }

    /**
     * 应用主题
     * @param {string} themeMode - 主题模式：'light', 'dark', 或 'auto'
     * @param {string} actualTheme - 在自动模式下，实际应用的主题
     */
    applyTheme(themeMode, actualTheme = null) {
        // 更新主题类
        document.body.classList.remove('light-theme', 'dark-theme', 'system-theme');
        document.body.classList.add(`${themeMode}-theme`);

        // 同时设置data-theme属性，这是CSS样式实际使用的选择器
        const actualThemeToApply = themeMode === 'auto'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : themeMode;
        document.documentElement.setAttribute('data-theme', actualThemeToApply);

        // 更新代码高亮主题
        this.updateCodeHighlightTheme(actualTheme || themeMode);

        // 更新主题图标
        this.updateThemeIcon(themeMode);

        this.log.info(`主题应用完成: ${themeMode}`);
    }

    /**
     * 更新主题切换按钮图标
     * @param {string} themeMode - 主题模式
     */
    updateThemeIcon(themeMode) {
        const themeToggleIcon = document.getElementById('theme-toggle-icon');
        if (themeToggleIcon) {
            if (themeMode === 'dark') {
                themeToggleIcon.textContent = '☀️';
            } else if (themeMode === 'light') {
                themeToggleIcon.textContent = '🌒';
            } else if (themeMode === 'auto') {
                themeToggleIcon.textContent = '🌓';
            }
        }
    }

    /**
     * 更新代码高亮主题
     * @param {string} theme - 主题名称
     */
    updateCodeHighlightTheme(theme) {
        this.log.info(`开始更新代码高亮主题: ${theme}`);

        // 记录当前DOM状态
        const totalCodeBlocks = document.querySelectorAll('pre code').length;
        this.log.info(`当前页面共有 ${totalCodeBlocks} 个代码块需要处理`);

        // 确定主题样式文件的路径
        let stylePath = theme === 'dark'
            ? '../assets/highlight.js/styles/dracula.min.css'
            : '../assets/highlight.js/styles/github.min.css';

        // 预加载新的样式表，避免切换时的闪烁

        // 优化: 缓存已加载过的主题，避免重复加载
        const cacheKey = `theme_cache_${theme}`;
        if (!this.themeCache[cacheKey]) {
            this.log.info(`主题 ${theme} 未缓存，开始加载和缓存`);
            // 使用fetch API预加载CSS内容
            fetch(stylePath)
                .then(response => response.text())
                .then(cssContent => {
                    // 缓存CSS内容
                    this.themeCache[cacheKey] = cssContent;

                    // 创建新样式元素并立即应用
                    const styleElement = document.createElement('style');
                    styleElement.id = 'highlight-theme';
                    styleElement.textContent = cssContent;

                    // 替换旧样式表
                    const highlightTheme = document.getElementById('highlight-theme');
                    if (highlightTheme) {
                        highlightTheme.parentNode.replaceChild(styleElement, highlightTheme);
                    } else {
                        document.head.appendChild(styleElement);
                    }

                    this.log.info('高亮样式内容加载并应用完成');

                    // 仅处理可见区域内的代码块
                    this.applyHighlightToVisibleBlocks(totalCodeBlocks);
                })
                .catch(error => {
                    this.log.error(`加载主题 ${theme} 失败:`, error.message);
                });
        } else {
            this.log.info(`使用缓存的主题 ${theme}`);
            // 直接使用缓存的CSS内容
            const styleElement = document.createElement('style');
            styleElement.id = 'highlight-theme';
            styleElement.textContent = this.themeCache[cacheKey];

            // 替换旧样式表
            const highlightTheme = document.getElementById('highlight-theme');
            if (highlightTheme) {
                highlightTheme.parentNode.replaceChild(styleElement, highlightTheme);
            } else {
                document.head.appendChild(styleElement);
            }

            this.log.info('缓存的高亮样式内容已应用');

            // 仅处理可见区域内的代码块
            this.applyHighlightToVisibleBlocks(totalCodeBlocks);
        }
    }

    /**
     * 应用高亮样式到可见的代码块
     * @param {number} totalCodeBlocks - 代码块总数
     */
    applyHighlightToVisibleBlocks(totalCodeBlocks) {
        if (totalCodeBlocks <= 0) return;

        const visibleCodeBlocks = Array.from(document.querySelectorAll('pre code'))
            // 过滤出可见区域内的代码块
            .filter(block => {
                const rect = block.getBoundingClientRect();
                return (
                    rect.top >= -window.innerHeight &&
                    rect.bottom <= window.innerHeight * 2
                );
            });

        this.log.info(`过滤出 ${visibleCodeBlocks.length} 个可见区域内的代码块进行立即处理`);

        // 立即处理可见区域内的代码块
        visibleCodeBlocks.forEach(block => {
            try {
                // 检查hljs是否可用
                if (typeof hljs !== 'undefined') {
                    hljs.highlightElement(block);
                }
            } catch (error) {
                this.log.error('高亮显示代码块失败:', error.message);
            }
        });

        // 如果有额外的不可见代码块，使用 IntersectionObserver 延迟处理
        if (visibleCodeBlocks.length < totalCodeBlocks) {
            this.log.info(`还有 ${totalCodeBlocks - visibleCodeBlocks.length} 个不可见代码块将延迟处理`);

            // 使用 IntersectionObserver 处理剩余代码块
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const block = entry.target;
                        try {
                            if (typeof hljs !== 'undefined') {
                                hljs.highlightElement(block);
                            }
                        } catch (error) {
                            this.log.error('延迟高亮显示代码块失败:', error.message);
                        }
                        // 处理完毕后取消观察
                        observer.unobserve(block);
                    }
                });
            }, {
                root: null,
                rootMargin: '100px', // 在元素进入可视区域前100px开始处理
                threshold: 0.1        // 元素有10%进入可视区域时处理
            });

            // 获取所有不可见代码块并开始观察
            const hiddenCodeBlocks = Array.from(document.querySelectorAll('pre code'))
                .filter(block => !visibleCodeBlocks.includes(block));

            hiddenCodeBlocks.forEach(block => observer.observe(block));
        }
    }

    /**
     * 设置主题相关事件监听器
     * 用于响应主题更改和系统主题变化
     */
    setupThemeListeners() {
        // 监听主题变化
        ipcRenderer.on('apply-theme', (event, theme) => {
            document.documentElement.setAttribute('data-theme', theme === 'auto' ?
                (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme);
            localStorage.setItem('theme', theme);
            this.updateThemeIcon(theme);
            this.updateCodeHighlightTheme(theme === 'auto' ?
                (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme);
        });

        // 监听系统主题变化
        ipcRenderer.on('system-theme-changed', (event, isDarkMode) => {
            if (localStorage.getItem('theme') === 'auto') {
                const newTheme = isDarkMode ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newTheme);
                this.updateCodeHighlightTheme(newTheme);
            }
        });
    }

    /**
     * 获取当前主题
     * 用于其他模块需要知道当前主题时
     * @returns {Object} 包含主题模式和实际主题的对象
     */
    getCurrentTheme() {
        const themeMode = localStorage.getItem('theme') || 'light';
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const actualTheme = themeMode === 'auto' ? (isSystemDark ? 'dark' : 'light') : themeMode;

        return {
            mode: themeMode,
            actual: actualTheme,
            isDark: actualTheme === 'dark'
        };
    }
}

// 创建单例实例
const themeService = new ThemeService();

// 导出单例实例
module.exports = themeService; 