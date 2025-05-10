/**
 * ui-init.js - UI初始化和事件处理
 * 处理DOM初始化、国际化设置和系统菜单功能
 */

// DOM就绪事件，用于初始化多语言支持和UI元素
document.addEventListener('DOMContentLoaded', () => {
    // 设置页面标题
    document.getElementById('app-title').textContent = i18n.t('app.title');

    // 设置侧边栏文本
    document.getElementById('sidebar-toggle').title = i18n.t('sidebar.collapse');
    document.getElementById('session-list-title').textContent = i18n.t('sidebar.sessionList');
    document.getElementById('settings-text').textContent = i18n.t('sidebar.settings');
    document.getElementById('settings-btn').title = i18n.t('sidebar.settings');
    document.querySelector('.sidebar-collapse-icon').title = i18n.t('sidebar.expand');

    // 设置系统按钮文本
    document.getElementById('system-text').textContent = i18n.t('sidebar.system');
    document.getElementById('system-btn').title = i18n.t('sidebar.system');

    // 设置系统菜单项文本
    const aboutItem = document.getElementById('about-item').querySelector('.system-item-text');
    if (aboutItem) {
        aboutItem.textContent = i18n.t('sidebar.about');
    }

    const checkUpdateItem = document.getElementById('check-update-item').querySelector('.system-item-text');
    if (checkUpdateItem) {
        checkUpdateItem.textContent = i18n.t('sidebar.checkUpdate');
    }

    // 设置主界面文本
    document.getElementById('theme-toggle').title = i18n.t('header.toggleTheme');
    document.getElementById('prompt-select').title = i18n.t('modelSelector.promptTitle');
    document.getElementById('mcp-dropdown-btn').textContent = i18n.t('modelSelector.mcpServer');
    document.getElementById('new-session-btn').textContent = i18n.t('session.newSession');
    document.getElementById('new-session-btn').title = i18n.t('session.newSession');
    document.getElementById('message-input').placeholder = i18n.t('chat.inputPlaceholder');
    document.getElementById('status').textContent = i18n.t('ui.status.ready');

    // 设置重命名对话框文本
    document.getElementById('rename-title').textContent = i18n.t('session.renameTitle');
    document.getElementById('new-name-input').placeholder = i18n.t('session.newNamePlaceholder');
    document.getElementById('rename-cancel-btn').textContent = i18n.t('session.cancel');
    document.getElementById('rename-confirm-btn').textContent = i18n.t('session.confirm');
});

/**
 * 初始化系统和设置菜单的事件处理程序
 */
function initEventHandlers() {
    // 设置按钮点击事件
    document.getElementById('settings-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        window.openSettingsWindow();
    });

    // 系统按钮点击事件
    document.getElementById('system-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        toggleSystemMenu();
    });

    // 关于按钮点击事件
    document.getElementById('about-item').addEventListener('click', function () {
        window.openAboutWindow();
    });

    // 检查更新按钮点击事件
    document.getElementById('check-update-item').addEventListener('click', function () {
        window.checkForUpdates(true);
    });

    // 点击其他地方时关闭系统菜单
    document.addEventListener('click', function (e) {
        const systemItemsContainer = document.getElementById('system-items-container');
        if (!e.target.closest('#system-btn') &&
            !e.target.closest('#system-items-container') &&
            systemItemsContainer.style.display === 'block') {
            hideSystemMenu();
        }
    });
}

/**
 * 切换系统菜单的可见性
 */
function toggleSystemMenu() {
    const systemItemsContainer = document.getElementById('system-items-container');
    const sessionsContainer = document.getElementById('sessions-container');
    const sidebarLower = document.getElementById('sidebar-footer');

    // 检查侧边栏是否折叠
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('collapsed')) {
        window.toggleSidebar(); // 先展开侧边栏

        // 等待侧边栏动画完成后再显示系统菜单
        setTimeout(() => {
            systemItemsContainer.style.display = 'block';
            // 添加菜单打开标记类
            sidebarLower.classList.add('menu-open');
            sessionsContainer.classList.add('menu-open');
        }, 300);
    } else {
        // 如果侧边栏已经展开，则切换系统菜单的可见性
        systemItemsContainer.style.display =
            systemItemsContainer.style.display === 'none' ? 'block' : 'none';

        // 添加或移除菜单标记类
        if (systemItemsContainer.style.display === 'block') {
            sidebarLower.classList.add('menu-open');
            sessionsContainer.classList.add('menu-open');
        } else {
            // 轻微延迟以确保平滑过渡
            setTimeout(() => {
                sidebarLower.classList.remove('menu-open');
                sessionsContainer.classList.remove('menu-open');
            }, 50);
        }
    }
}

/**
 * 隐藏系统菜单
 */
function hideSystemMenu() {
    const systemItemsContainer = document.getElementById('system-items-container');
    systemItemsContainer.style.display = 'none';

    // 移除菜单打开标记类
    setTimeout(() => {
        const sidebarLower = document.getElementById('sidebar-footer');
        sidebarLower.classList.remove('menu-open');
        document.getElementById('sessions-container').classList.remove('menu-open');
    }, 50);
}

// 脚本加载时初始化事件处理程序
document.addEventListener('DOMContentLoaded', initEventHandlers); 