/**
 * ui-init.js - UI初始化和事件处理
 * 处理DOM初始化、国际化设置和系统菜单功能
 */

// DOM就绪事件，用于初始化多语言支持和UI元素
document.addEventListener('DOMContentLoaded', () => {
    updateUIText();
});

/**
 * 更新界面文本的国际化
 */
function updateUIText() {
    // 设置页面标题
    const appTitle = document.getElementById('app-title');
    if (appTitle) {
        appTitle.textContent = i18n.t('app.title');
    }

    // 处理所有带有data-i18n属性的元素
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = i18n.t(key);
        }
    });

    // 处理所有带有data-i18n-title属性的元素
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key) {
            el.title = i18n.t(key);
        }
    });

    // 处理所有带有data-i18n-placeholder属性的元素
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
            el.placeholder = i18n.t(key);
        }
    });

    // 设置侧边栏文本（为没有data-i18n属性的元素手动设置）
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.title = i18n.t('sidebar.collapse');
    }

    const sessionListTitle = document.getElementById('session-list-title');
    if (sessionListTitle) {
        sessionListTitle.textContent = i18n.t('sidebar.sessionList');
    }

    const settingsText = document.getElementById('settings-text');
    if (settingsText) {
        settingsText.textContent = i18n.t('sidebar.settings');
    }

    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.title = i18n.t('sidebar.settings');
    }

    const sidebarCollapseIcon = document.querySelector('.sidebar-collapse-icon');
    if (sidebarCollapseIcon) {
        sidebarCollapseIcon.title = i18n.t('sidebar.expand');
    }

    // 设置系统按钮文本
    const systemText = document.getElementById('system-text');
    if (systemText) {
        systemText.textContent = i18n.t('sidebar.system');
    }

    const systemBtn = document.getElementById('system-btn');
    if (systemBtn) {
        systemBtn.title = i18n.t('sidebar.system');
    }

    // 设置系统菜单项文本
    const aboutItem = document.getElementById('about-item')?.querySelector('.system-item-text');
    if (aboutItem) {
        aboutItem.textContent = i18n.t('sidebar.about');
    }

    const checkUpdateItem = document.getElementById('check-update-item')?.querySelector('.system-item-text');
    if (checkUpdateItem) {
        checkUpdateItem.textContent = i18n.t('sidebar.checkUpdate');
    }

    // 设置主界面文本
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.title = i18n.t('header.toggleTheme');
    }

    const promptSelect = document.getElementById('prompt-select');
    if (promptSelect) {
        promptSelect.title = i18n.t('modelSelector.promptTitle');
    }

    const mcpDropdownBtn = document.getElementById('mcp-dropdown-btn');
    if (mcpDropdownBtn) {
        mcpDropdownBtn.textContent = i18n.t('modelSelector.mcpServer');
    }

    const promptSelectorDiv = document.querySelector('.prompt-selector-title');
    if (promptSelectorDiv) {
        promptSelectorDiv.textContent = i18n.t('prompts.selectPrompt');
    }
}

/**
 * 初始化系统和设置菜单的事件处理程序
 * 设置系统菜单的显示/隐藏逻辑和点击事件
 */
function initMenuEventHandlers() {
    // 设置按钮点击事件
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            window.openSettingsWindow();
        });
    }

    // 系统按钮点击事件
    const systemBtn = document.getElementById('system-btn');
    if (systemBtn) {
        systemBtn.addEventListener('click', toggleSystemMenu);
    }

    // 关于按钮点击事件
    const aboutItem = document.getElementById('about-item');
    if (aboutItem) {
        aboutItem.addEventListener('click', () => {
            window.aboutService.openAboutWindow();
        });
    }

    // 检查更新按钮点击事件
    const checkUpdateItem = document.getElementById('check-update-item');
    if (checkUpdateItem) {
        checkUpdateItem.addEventListener('click', () => {
            window.checkForUpdates();
        });
    }

    // 点击其他地方时关闭系统菜单
    document.addEventListener('click', (event) => {
        const systemBtn = document.getElementById('system-btn');
        const systemMenu = document.getElementById('system-items-container');

        if (systemBtn && systemMenu &&
            !systemBtn.contains(event.target) &&
            !systemMenu.contains(event.target)) {
            hideSystemMenu();
        }
    });
}

/**
 * 切换系统菜单的可见性
 * 如果侧边栏被折叠，先展开侧边栏
 */
function toggleSystemMenu() {
    const sidebar = document.getElementById('sidebar');
    const systemMenu = document.getElementById('system-items-container');

    // 检查侧边栏是否折叠
    if (sidebar && sidebar.classList.contains('collapsed')) {
        // 如果侧边栏折叠，先展开
        window.toggleSidebar(); // 先展开侧边栏

        // 等待侧边栏动画完成后再显示系统菜单
        setTimeout(() => {
            if (systemMenu) {
                systemMenu.style.display = 'block';
                // 添加菜单打开标记类
                sidebar.classList.add('system-menu-open');
            }
        }, 300); // 等待侧边栏动画完成
    } else {
        // 如果侧边栏已经展开，则切换系统菜单的可见性
        if (systemMenu) {
            const isVisible = systemMenu.style.display === 'block';
            systemMenu.style.display = isVisible ? 'none' : 'block';
            // 添加或移除菜单标记类
            if (sidebar) {
                if (isVisible) {
                    sidebar.classList.remove('system-menu-open');
                } else {
                    sidebar.classList.add('system-menu-open');
                }
            }
        }
    }

    // 轻微延迟以确保平滑过渡
    setTimeout(() => {
        const systemMenu = document.getElementById('system-items-container');
        if (systemMenu && systemMenu.style.display === 'block') {
            systemMenu.style.opacity = '1';
        }
    }, 50);
}

/**
 * 隐藏系统菜单
 */
function hideSystemMenu() {
    const systemMenu = document.getElementById('system-items-container');
    const sidebar = document.getElementById('sidebar');

    if (systemMenu) {
        systemMenu.style.display = 'none';
        // 移除菜单打开标记类
        if (sidebar) {
            sidebar.classList.remove('system-menu-open');
        }
    }
}

// 脚本加载时初始化事件处理程序
initMenuEventHandlers();

// 导出updateUIText函数供其他模块使用
window.updateUIText = updateUIText; 