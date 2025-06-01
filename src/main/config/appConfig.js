/**
 * 配置管理器
 * 负责整合模型配置、MCP服务配置以及通用配置，并提供统一的接口
 */

const Logger = require('../logger');
const log = new Logger('config');
const EventEmitter = require('events');
const modelManager = require('./modelConfig');
const mcpManager = require('./mcpConfig');
const fs = require('fs');
const path = require('path');
const { app, ipcMain } = require('electron');
const axios = require('axios');
const os = require('os');

class AppConfig extends EventEmitter {
    constructor() {
        super();
        log.info('初始化ConfigManager');

        // 存储所有窗口的WebContents以便更新
        this.registeredWindows = new Set();

        // 配置文件路径
        const userDataPath = app.getPath('userData');
        const configDir = path.join(userDataPath, 'user-data', 'config');
        fs.mkdirSync(configDir, { recursive: true });
        this.configPath = path.join(configDir, 'config.json');

        // 默认配置
        this.defaultConfig = {
            language: 'zh-CN',
            theme: 'auto',
            updateUrls: [
                "https://api.github.com/repos/skydroplet/mindcomplete/releases/latest",
                "https://api.mindcomplete.me/v1/latest"
            ],
            lastUpdateCheck: null,
            latestVersion: null,
        };

        // 加载通用配置
        this.generalConfig = this.loadGeneralConfig();

        // 监听子管理器的配置更新事件
        modelManager.on('model-config-updated', () => {
            this.notifyAllWindows();
        });

        mcpManager.on('mcp-config-updated', () => {
            this.notifyAllWindows();
        });

        // 当前应用版本
        this.appVersion = app.getVersion();

        // 兼容旧版本配置
        this.migrateOldConfig();
    }

    // 兼容旧版本配置
    migrateOldConfig() {
        if (this.generalConfig.updateUrl && !this.generalConfig.updateUrls) {
            this.generalConfig.updateUrls = [
                "https://api.github.com/repos/skydroplet/mindcomplete/releases/latest",
                this.generalConfig.updateUrl
            ];
            delete this.generalConfig.updateUrl;
            this.saveGeneralConfig();
            log.info('已将旧版本updateUrl配置迁移到updateUrls');
        }
    }

    // 加载通用配置
    loadGeneralConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                fs.writeFileSync(this.configPath, JSON.stringify(this.defaultConfig, null, 2));
                return this.defaultConfig;
            }
            const data = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            log.error('加载通用配置失败:', error.message);
            return this.defaultConfig;
        }
    }

    // 保存通用配置
    saveGeneralConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.generalConfig, null, 2));
            this.notifyAllWindows();
            this.emit('general-config-updated', this.generalConfig);
            return true;
        } catch (error) {
            log.error('保存通用配置失败:', error.message);
            return false;
        }
    }

    // 获取通用配置
    getGeneralConfig() {
        return this.generalConfig;
    }

    // 更新语言设置
    setLanguage(language) {
        this.generalConfig = this.loadGeneralConfig();
        this.generalConfig.language = language;
        return this.saveGeneralConfig();
    }

    // 获取语言设置
    getLanguage() {
        return this.generalConfig.language;
    }

    // 更新主题设置
    setTheme(theme) {
        this.generalConfig = this.loadGeneralConfig();
        this.generalConfig.theme = theme;
        return this.saveGeneralConfig();
    }

    // 获取主题设置
    getTheme() {
        return this.generalConfig.theme;
    }

    /**
     * 获取要下载的文件后缀
     */
    getDownloadFileSuffix() {
        const platform = os.platform();
        if (platform === 'win32') {
            return '.exe';
        } else if (platform === 'darwin') {
            return '.dmg';
        } else if (platform === 'linux') {
            return '.AppImage';
        } else {
            return '';
        }
    }

    /**
     * 检查应用更新
     * 支持多接口查询，第一个不成功时查询第二个
     * @param {boolean} force 是否强制检查，忽略上次检查时间
     * @returns {Promise<object>} 更新信息对象
     */
    async checkForUpdates(force = false) {
        try {
            // 检查是否需要更新（默认每24小时检查一次）
            const now = Date.now();
            const lastCheck = this.generalConfig.lastUpdateCheck;
            const remindLaterTime = this.generalConfig.remindLaterTime || 0;

            // 如果用户选择了稍后提醒，并且还在24小时内，则不检查更新
            if (!force && remindLaterTime && (now - remindLaterTime < 24 * 60 * 60 * 1000)) {
                log.info('用户选择了稍后提醒，24小时内不再检查更新');
                return {
                    hasUpdate: false,
                    version: this.generalConfig.latestVersion?.version || this.appVersion
                };
            }

            // 如果不是强制检查且上次检查时间在24小时内，则使用缓存的结果
            if (!force && lastCheck && (now - lastCheck < 24 * 60 * 60 * 1000)) {
                log.info('使用缓存的更新信息');

                if (this.generalConfig.latestVersion) {
                    const hasUpdate = this.hasNewVersion(this.appVersion, this.generalConfig.latestVersion.version);

                    // 即使使用缓存的结果，也要通知所有窗口更新信息
                    if (hasUpdate && !this.generalConfig.latestVersion.ignored) {
                        this.notifyWindowsAboutUpdate({
                            hasUpdate,
                            ...this.generalConfig.latestVersion
                        });
                    }

                    return {
                        hasUpdate,
                        ...this.generalConfig.latestVersion
                    };
                }
            }

            // 获取更新URL列表
            const updateUrls = this.generalConfig.updateUrls || [
                "https://api.github.com/repos/skydroplet/mindcomplete/releases/latest",
                "https://api.mindcomplete.me/v1/releases/latest"
            ];

            // 依次尝试每个更新源
            for (let i = 0; i < updateUrls.length; i++) {
                const url = updateUrls[i];
                log.info(`尝试从 ${url} 获取更新信息 (${i + 1}/${updateUrls.length})...`);

                try {
                    const response = await axios.get(url);
                    const responseData = response.data;
                    log.info('获取更新信息:', responseData);
                    const updateInfo = {
                        version: responseData.name,
                        releaseDate: new Date(responseData.published_at).toLocaleString(),
                        releaseNotes: responseData.body || ''
                    };

                    // 根据操作系统获取要下载的文件后缀
                    const fileSuffix = this.getDownloadFileSuffix();
                    for (const asset of responseData.assets) {
                        if (asset.name.endsWith(fileSuffix)) {
                            updateInfo.downloadUrl = asset.browser_download_url;
                            break;
                        }
                    }

                    if (url.includes('api.mindcomplete.me')) {
                        updateInfo.downloadUrl = updateInfo.downloadUrl.replace('github.com/skydroplet/mindcomplete/releases/download', 'download.mindcomplete.me/v1');
                    }

                    // 判断是否有新版本
                    const hasUpdate = this.hasNewVersion(this.appVersion, updateInfo.version);
                    updateInfo.hasUpdate = hasUpdate;

                    if (hasUpdate) {
                        // 找到新版本，更新缓存并通知
                        log.info(`发现新版本: ${updateInfo.version}`);

                        // 更新最后检查时间和最新版本信息
                        this.generalConfig.lastUpdateCheck = now;
                        updateInfo.ignored = false;
                        this.generalConfig.latestVersion = updateInfo;
                        this.saveGeneralConfig();

                        // 通知所有窗口更新信息
                        this.notifyWindowsAboutUpdate(updateInfo);

                        return updateInfo;
                    } else {
                        // 没有新版本，但更新检查成功，缓存结果
                        log.info(`当前版本 ${this.appVersion} 已是最新版本`);

                        // 更新最后检查时间和最新版本信息
                        this.generalConfig.lastUpdateCheck = now;
                        this.generalConfig.latestVersion = updateInfo;
                        this.saveGeneralConfig();

                        return updateInfo;
                    }
                } catch (error) {
                    // 当前更新源失败，记录错误并继续尝试下一个
                    log.warn(`从 ${url} 获取更新失败: ${error.message}`);

                    // 如果是最后一个更新源，则抛出错误
                    if (i === updateUrls.length - 1) {
                        throw new Error('所有更新源均检查失败');
                    }
                    // 否则继续尝试下一个更新源
                }
            }

            // 所有更新源都尝试过，但没有找到更新
            log.info('所有更新源均已检查，未找到新版本');
            return {
                hasUpdate: false,
                version: this.appVersion
            };
        } catch (error) {
            log.error('检查更新失败:', error.message);
            throw error;
        }
    }

    /**
     * 比较版本号，判断是否有新版本
     * @param {string} currentVersion 当前版本号
     * @param {string} latestVersion 最新版本号
     * @returns {boolean} 是否有新版本
     */
    hasNewVersion(currentVersion, latestVersion) {
        if (!currentVersion || !latestVersion) return false;

        const current = currentVersion.split('.').map(Number);
        const latest = latestVersion.split('.').map(Number);

        for (let i = 0; i < Math.max(current.length, latest.length); i++) {
            const a = current[i] || 0;
            const b = latest[i] || 0;
            if (b > a) return true;
            if (a > b) return false;
        }

        return false; // 版本相同
    }

    // 窗口注册系统，确保所有窗口保持配置一致
    registerWindow(webContents) {
        if (webContents && !webContents.isDestroyed()) {
            this.registeredWindows.add(webContents);
            // 同时注册到子管理器
            modelManager.registerWindow(webContents);
            mcpManager.registerWindow(webContents);

            // 当窗口关闭时，移除它
            webContents.on('destroyed', () => {
                this.unregisterWindow(webContents);
            });
        }
    }

    unregisterWindow(webContents) {
        this.registeredWindows.delete(webContents);
        modelManager.unregisterWindow(webContents);
        mcpManager.unregisterWindow(webContents);
    }

    notifyAllWindows() {
        const config = {
            models: modelManager.getConfig(),
            mcpConfig: mcpManager.getConfig(),
            generalConfig: this.generalConfig
        };

        for (const webContents of this.registeredWindows) {
            if (!webContents.isDestroyed()) {
                webContents.send('config-updated', config);
            }
        }

        this.emit('config-updated', config);
    }

    /**
     * 通知所有已注册窗口有关更新的信息
     * @param {object} updateInfo 更新信息对象
     */
    notifyWindowsAboutUpdate(updateInfo) {
        log.info('向所有窗口发送更新通知:', updateInfo);
        for (const webContents of this.registeredWindows) {
            if (!webContents.isDestroyed()) {
                webContents.send('update-available', updateInfo);
            }
        }
    }

    /**
     * 设置稍后提醒时间
     * 当用户点击"稍后提醒"按钮时调用此方法
     */
    setRemindLaterTime() {
        this.generalConfig.remindLaterTime = Date.now();
        this.saveGeneralConfig();
        log.info('已设置稍后提醒时间:', new Date(this.generalConfig.remindLaterTime).toLocaleString());
        return true;
    }

    /**
     * 忽略新版本
     */
    setIgnoreUpdate() {
        this.generalConfig.latestVersion.ignored = true;
        this.saveGeneralConfig();
    }
}

// 创建并导出单例实例
const appConfig = new AppConfig();
module.exports = appConfig;

// 设置稍后提醒时间的IPC处理程序
ipcMain.handle('set-remind-later', async (event) => {
    try {
        return appConfig.setRemindLaterTime();
    } catch (error) {
        log.error('设置稍后提醒失败:', error.message);
        throw error;
    }
});

// 设置忽略新版本
ipcMain.handle('set-ignore-update', async (event) => {
    try {
        return appConfig.setIgnoreUpdate();
    } catch (error) {
        log.error('设置忽略版本失败:', error.message);
        throw error;
    }
});
