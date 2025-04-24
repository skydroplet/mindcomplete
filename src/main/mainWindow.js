const { BrowserWindow } = require('electron');
const path = require('path');
const i18n = require('../locales/i18n');
const { configManager, promptConfigManager } = require('./config');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('src/renderer/index.html');
    mainWindow.setTitle(i18n.t('app.title'));

    // 隐藏菜单栏，但保留快捷键功能
    mainWindow.setMenuBarVisibility(false);

    // 注册主窗口以接收配置更新
    configManager.registerWindow(mainWindow.webContents);

    // 注册主窗口以接收提示词配置更新
    promptConfigManager.registerWindow(mainWindow.webContents);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

module.exports = {
    createWindow,
    get mainWindow() { return mainWindow; }
};
