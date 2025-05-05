/**
 * mainWindow.js
 * 主窗口管理模块
 *
 * 负责创建和管理应用程序的主窗口
 * 提供主窗口的引用和创建功能
 */

const { BrowserWindow, app } = require('electron');
const path = require('path');
const os = require('os');
const i18n = require('../locales/i18n');
const { configManager, promptConfig: promptConfigManager } = require('./config');

// 主窗口实例引用
let mainWindow;

/**
 * 创建应用程序主窗口
 *
 * 创建一个新的主窗口，加载主界面，并设置窗口属性
 * 注册窗口以接收配置和提示词更新
 *
 * @returns {BrowserWindow} 创建的主窗口实例
 */
function createWindow() {
    // 根据操作系统选择图标
    const iconPath = os.platform() === 'win32'
        ? path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.ico')
        : path.join(__dirname, '..', '..', 'assets', 'icons', 'icon.png');

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: iconPath
    });

    mainWindow.loadFile('src/renderer/pages/index.html');
    mainWindow.setTitle(i18n.t('app.title'));

    // 隐藏菜单栏，但保留快捷键功能
    mainWindow.setMenuBarVisibility(false);

    // 注册主窗口以接收配置更新
    configManager.registerWindow(mainWindow.webContents);

    // 注册主窗口以接收提示词配置更新
    promptConfigManager.registerWindow(mainWindow.webContents);

    // 窗口关闭时清除引用
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    return mainWindow;
}

/**
 * 导出主窗口模块
 *
 * 提供创建窗口的函数和获取当前主窗口实例的访问器
 */
module.exports = {
    createWindow,
    get mainWindow() { return mainWindow; }
};
