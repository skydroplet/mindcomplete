/**
 * aboutService.js
 * 关于窗口服务模块
 *
 * 该模块处理"关于"窗口的打开和相关功能
 */

const { ipcRenderer } = require('electron');
const Logger = require('../main/logger');
const log = new Logger('aboutService');
const i18n = require('../locales/i18n');

/**
 * 打开关于窗口
 * 
 * 显示应用程序的关于窗口，包含版本信息、开发者信息等
 */
function openAboutWindow() {
    log.info('Opening about window');
    const statusElement = document.getElementById('status');
    statusElement.textContent = i18n.t('ui.status.openingAboutWindow');

    // 调用后端方法打开关于窗口
    ipcRenderer.invoke('open-about-window')
        .then(() => {
            statusElement.textContent = i18n.t('ui.status.ready');
        })
        .catch(error => {
            log.error('打开关于窗口失败:', error.message);
            statusElement.textContent = i18n.t('errors.openAboutWindowFailed', { error: error.message });
        });
}

/**
 * 初始化关于窗口服务
 * 
 * 注册必要的全局函数，使HTML页面能够调用
 */
function initAboutService() {
    // 将函数在window中暴露，以便HTML中调用
    window.openAboutWindow = openAboutWindow;
}

module.exports = {
    openAboutWindow,
    initAboutService
}; 