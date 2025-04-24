const { ipcRenderer } = require('electron');
const Logger = require('../main/logger');
const log = new Logger('updateService');
const i18n = require('../locales/i18n');
const themeService = require('./themeService');
const fs = require('fs');
const path = require('path');

class UpdateService {
    constructor() {
        this.statusElement = null;
        this.setupUpdateListeners();
        this.notificationTemplate = null;
        this.notificationStyles = null;

        // 等待DOM准备就绪后再获取状态元素
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.statusElement = document.getElementById('status');
            });
        } else {
            this.statusElement = document.getElementById('status');
        }

        // 将方法绑定到实例
        this.checkForUpdates = this.checkForUpdates.bind(this);
        this.updateStatus = this.updateStatus.bind(this);
    }

    // 安全更新状态文本的辅助方法
    updateStatus(text) {
        if (this.statusElement) {
            this.statusElement.textContent = text;
        }
    }

    loadTemplateFiles() {
        // 加载HTML模板
        this.notificationTemplate = fs.readFileSync(
            path.join(__dirname, 'pages/updateNotification.html'),
            'utf8'
        );

        // 加载CSS样式
        this.notificationStyles = fs.readFileSync(
            path.join(__dirname, 'assets/updateNotification.css'),
            'utf8'
        );
    }

    setupUpdateListeners() {
        // 当有新版本可用时显示通知
        ipcRenderer.on('update-available', (event, updateInfo) => {
            if (updateInfo && updateInfo.hasUpdate) {
                log.info('发现新版本:', updateInfo);
                this.showUpdateNotification(updateInfo);
            }
        });

        // 检查更新状态变化
        ipcRenderer.on('checking-for-updates', (event) => {
            this.updateStatus(i18n.t('ui.status.checkingForUpdates', '正在检查更新...'));
        });

        // 更新检查结果
        ipcRenderer.on('update-check-result', (event, result) => {
            if (result.hasUpdate) {
                this.updateStatus(i18n.t('ui.status.updateAvailable', '发现新版本 {version}', { version: result.version }));
                this.showUpdateNotification(result);
            } else {
                this.updateStatus(i18n.t('ui.status.noUpdateAvailable', '已是最新版本'));
                // 3秒后恢复状态显示
                setTimeout(() => {
                    this.updateStatus(i18n.t('ui.status.ready'));
                }, 3000);
            }
        });

        // 更新检查错误
        ipcRenderer.on('update-check-error', (event, errorMsg) => {
            log.error('检查更新失败:', errorMsg);
            this.updateStatus(i18n.t('ui.status.error', { error: '检查更新失败' }));
            // 3秒后恢复状态显示
            setTimeout(() => {
                this.updateStatus(i18n.t('ui.status.ready'));
            }, 3000);
        });

        log.info('已设置更新检查相关事件监听器');
    }

    checkForUpdates(force = false) {
        log.info('检查应用更新...');
        this.updateStatus(i18n.t('ui.status.checkingForUpdates', '正在检查更新...'));

        // 调用主进程中的检查更新方法
        ipcRenderer.invoke('check-for-updates', force)
            .then(result => {
                if (result.hasUpdate) {
                    // 显示更新通知
                    this.showUpdateNotification(result);
                    this.updateStatus(i18n.t('ui.status.updateAvailable', '发现新版本 {version}', { version: result.version }));
                } else {
                    this.updateStatus(i18n.t('ui.status.noUpdateAvailable', '已是最新版本'));
                    // 3秒后恢复状态显示
                    setTimeout(() => {
                        this.updateStatus(i18n.t('ui.status.ready'));
                    }, 3000);
                }
            })
            .catch(error => {
                log.error('检查更新失败:', error.message);
                this.updateStatus(i18n.t('ui.status.error', { error: '检查更新失败' }));
                // 3秒后恢复状态显示
                setTimeout(() => {
                    this.updateStatus(i18n.t('ui.status.ready'));
                }, 3000);
            });
    }

    showUpdateNotification(updateInfo) {
        // 检查通知是否已存在
        const existingNotification = document.querySelector('.update-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // 确保模板已加载
        if (!this.notificationTemplate) {
            this.loadTemplateFiles();
        }

        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.setAttribute('data-theme', themeService.getCurrentTheme().isDark ? 'dark' : 'light');

        // 注入CSS
        const style = document.createElement('style');
        style.textContent = this.notificationStyles;
        document.head.appendChild(style);

        // 添加HTML模板
        notification.innerHTML = this.notificationTemplate;

        // 填充数据
        this.populateNotificationData(notification, updateInfo);

        // 翻译界面
        this.translateNotification(notification);

        // 添加到文档
        document.body.appendChild(notification);

        // 添加事件监听器
        const closeBtn = notification.querySelector('.close-btn');
        const downloadBtn = notification.querySelector('.download-btn');

        closeBtn.addEventListener('click', () => {
            notification.remove();
            style.remove();
        });

        downloadBtn.addEventListener('click', () => {
            ipcRenderer.send('download-update');
            notification.remove();
            style.remove();
        });

        // 10秒后自动关闭
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.remove();
                style.remove();
            }
        }, 10000);
    }

    // 填充通知数据
    populateNotificationData(notification, updateInfo) {
        notification.querySelector('#update-version').textContent = updateInfo.version;
        notification.querySelector('#update-date').textContent = updateInfo.date;
        notification.querySelector('#update-desc').textContent = updateInfo.desc;
    }

    // 翻译通知内容
    translateNotification(notification) {
        const elements = notification.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const defaultText = element.textContent;
            element.textContent = i18n.t(key, defaultText);
        });
    }
}

module.exports = new UpdateService();