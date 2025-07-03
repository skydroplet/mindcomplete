/**
 * main.js
 * 主进程入口文件
 *
 * 负责应用程序的初始化、窗口管理、IPC通信和AI模型交互
 */

const { app, ipcMain, Menu, BrowserWindow, nativeTheme, shell, clipboard, dialog } = require('electron');
require('dotenv').config();
const i18n = require('../locales/i18n');
const fs = require('fs');
const { createWindow } = require('./mainWindow');
const { appConfig, createConfigWindow, registerConfigIPC, openConfigWindowWithTab } = require('./config');
const { registerSessionIPC } = require('./session');
const Logger = require('./logger');
const log = new Logger('main');
const path = require('path');

// 全局MCP实例
const mcp = require('./mcp/mcpClient');
const { closeConfigWindow } = require('./config/configWindow');

// 引入各个配置管理器
const modelConfig = require('./config/modelConfig');
const promptConfig = require('./config/promptConfig');
const mcpConfig = require('./config/mcpConfig');
const mcpRuntimeManager = require('./mcp/mcpRuntimeManager');
const agentConfig = require('./config/agentConfig');

let mainWindow = null;

/**
 * 创建应用程序菜单
 *
 * 根据当前语言设置创建应用程序的菜单栏
 * 包含文件、编辑、视图、窗口和帮助等标准菜单项
 * 设置菜单项的快捷键和点击事件处理
 */
function createMenu() {
    // 确保使用当前配置的语言
    const configLanguage = appConfig.getLanguage();
    i18n.loadFromConfig(configLanguage);

    // 定义菜单模板
    const template = [
        {
            label: i18n.t('menu.file'),
            submenu: [
                {
                    label: i18n.t('menu.settings'),
                    accelerator: 'CmdOrCtrl+,',
                    click: () => createConfigWindow()
                },
                { type: 'separator' },
                {
                    label: i18n.t('menu.quit'),
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: i18n.t('menu.edit.label'),
            submenu: [
                { label: i18n.t('menu.edit.cut'), role: 'cut' },
                { label: i18n.t('menu.edit.copy'), role: 'copy' },
                { label: i18n.t('menu.edit.paste'), role: 'paste' },
                { type: 'separator' },
                { label: i18n.t('menu.edit.selectAll'), role: 'selectAll' }
            ]
        },
        {
            label: i18n.t('menu.view.label'),
            submenu: [
                { label: i18n.t('menu.view.reload'), role: 'reload', accelerator: 'CmdOrCtrl+R' },
                { label: i18n.t('menu.view.forceReload'), role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
                { label: i18n.t('menu.view.toggleDevTools'), role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
                { type: 'separator' },
                { label: i18n.t('menu.view.resetZoom'), role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
                { label: i18n.t('menu.view.zoomIn'), role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
                { label: i18n.t('menu.view.zoomOut'), role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
                { type: 'separator' },
                { label: i18n.t('menu.view.toggleFullscreen'), role: 'toggleFullscreen', accelerator: 'F11' }
            ]
        },
        {
            label: i18n.t('menu.window.label'),
            submenu: [
                { label: i18n.t('menu.window.minimize'), role: 'minimize', accelerator: 'CmdOrCtrl+M' },
                { label: i18n.t('menu.window.zoom'), role: 'zoom' },
                { type: 'separator' },
                { label: i18n.t('menu.window.front'), role: 'front' }
            ]
        },
    ];

    // 创建并设置应用程序菜单（仅保留快捷键功能）
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    // 获取所有窗口并移除菜单栏
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
        win.setMenuBarVisibility(false);
    }
}

app.whenReady().then(() => {
    // 从配置加载语言设置
    const configLanguage = appConfig.getLanguage();
    if (configLanguage) {
        i18n.loadFromConfig(configLanguage);
    }

    // 初始化窗口
    mainWindow = createWindow();
    // 将配置管理器注册到主窗口
    if (mainWindow && mainWindow.webContents) {
        appConfig.registerWindow(mainWindow.webContents);
    }

    // 创建菜单
    createMenu();

    // 初始化MCP服务，连接所有活跃的MCP
    mcp.initialize();

    // 检查更新
    setTimeout(() => {
        log.info('checking for updates...');
        appConfig.checkForUpdates();
    }, 5000);

    // 注册主题切换IPC事件
    ipcMain.on('theme-changed', (event, theme) => {
        // 保存主题设置到通用配置
        appConfig.setTheme(theme);

        // 获取所有窗口
        const windows = BrowserWindow.getAllWindows();
        // 向所有窗口发送主题更改事件
        for (const win of windows) {
            if (win.webContents !== event.sender) {
                win.webContents.send('apply-theme', theme);
            }
        }
    });

    // 设置系统主题变化监听
    nativeTheme.on('updated', () => {
        // 获取当前主题设置
        const theme = appConfig.getTheme();
        // 如果是自动模式，通知所有窗口系统主题变化
        if (theme === 'auto') {
            // 获取所有窗口
            const windows = BrowserWindow.getAllWindows();
            // 通知所有窗口系统主题变化
            for (const win of windows) {
                win.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors);
            }
        }
    });

    // 监听新窗口创建事件
    app.on('browser-window-created', (_, window) => {
        // 对每个新创建的窗口隐藏菜单栏，但保留快捷键功能
        window.setMenuBarVisibility(false);
    });

    ipcMain.on('model-selection-changed', (event, modelId) => {
        modelConfig.selectModel(modelId);
    });

    ipcMain.on('prompt-selection-changed', (event, promptId) => {
        promptConfig.setCurrentPrompt(promptId);
    });

    ipcMain.on('mcp-selection-changed', (event, mcpServerIds) => {
        if (Array.isArray(mcpServerIds)) {
            mcp.setActiveMcps(mcpServerIds);
        }
    });
});

// 添加IPC通道供渲染进程调用
ipcMain.handle('check-for-updates', async (event, force = false) => {
    try {
        return await appConfig.checkForUpdates(force);
    } catch (error) {
        log.error('IPC检查更新失败:', error.message);
        throw error;
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
    }
});

// 获取当前语言设置
ipcMain.handle('get-language', () => {
    return appConfig.getLanguage();
});

// 获取当前主题设置
ipcMain.handle('get-theme', () => {
    return appConfig.getTheme();
});

// 处理语言切换
ipcMain.handle('set-locale', (event, locale) => {
    // 保存语言设置到通用配置
    appConfig.setLanguage(locale);
    i18n.setLocale(locale);

    // 更新所有窗口的标题和语言
    const allWindows = BrowserWindow.getAllWindows();
    for (const window of allWindows) {
        // 更新窗口标题
        if (window === mainWindow) {
            window.setTitle(i18n.t('app.title'));
        } else if (window.getTitle().includes('配置') || window.getTitle().includes('Settings')) {
            window.setTitle(i18n.t('settings.title'));
        }

        // 通知所有窗口语言已更新
        window.webContents.send('locale-updated');
    }

    createMenu(); // 重新创建菜单
    return true;
});

// 处理标签页状态保存和恢复
ipcMain.handle('save-tab-state', (event, tabState) => {
    try {
        return appConfig.saveTabState(tabState);
    } catch (error) {
        log.error('保存标签页状态失败:', error.message);
        return false;
    }
});

ipcMain.handle('get-tab-state', (event) => {
    try {
        return appConfig.getTabState();
    } catch (error) {
        log.error('获取标签页状态失败:', error.message);
        return null;
    }
});

// 处理输入历史记录的保存和加载
ipcMain.handle('save-input-history', (event, history) => {
    try {
        const userDataPath = app.getPath('userData');
        const historyFilePath = path.join(userDataPath, 'user-data', 'input-history.json');

        // 确保目录存在
        const dirPath = path.dirname(historyFilePath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // 将历史记录保存到文件
        fs.writeFileSync(historyFilePath, JSON.stringify(history), 'utf8');
        log.info(`保存输入历史记录成功，共 ${history.length} 条记录`);
        return true;
    } catch (error) {
        log.error('保存输入历史记录失败:', error.message);
        return false;
    }
});

ipcMain.handle('load-input-history', (event) => {
    try {
        const userDataPath = app.getPath('userData');
        const historyFilePath = path.join(userDataPath, 'user-data', 'input-history.json');

        // 如果文件不存在，返回空数组
        if (!fs.existsSync(historyFilePath)) {
            log.info('输入历史记录文件不存在，返回空数组');
            return [];
        }

        // 从文件加载历史记录
        const historyData = fs.readFileSync(historyFilePath, 'utf8');
        const history = JSON.parse(historyData);
        log.info(`加载输入历史记录成功，共 ${history.length} 条记录`);
        return history;
    } catch (error) {
        log.error('加载输入历史记录失败:', error.message);
        return [];
    }
});

// 添加文件系统相关的 IPC 处理
ipcMain.handle('read-file', async (event, path) => {
    try {
        return fs.readFileSync(path, 'utf8');
    } catch (error) {
        log.error('Error reading file:', error.message);
        throw error;
    }
});

ipcMain.handle('write-file', async (event, { path, data }) => {
    try {
        fs.writeFileSync(path, data);
        return true;
    } catch (error) {
        log.error('Error writing file:', error.message);
        throw error;
    }
});

ipcMain.handle('exists-sync', async (event, path) => {
    return fs.existsSync(path);
});

ipcMain.handle('mkdir-sync', async (event, { path, options }) => {
    try {
        fs.mkdirSync(path, options);
        return true;
    } catch (error) {
        log.error('创建目录失败:', error.message);
        throw error;
    }
});

// 直接测试mcp工具是否能调用成功
ipcMain.handle('connect-mcp-server', async (event, serverConfig) => {
    try {
        log.info('接收到测试MCP服务配置:', serverConfig);

        // 如果没有传递服务配置或路径为空，则返回错误
        if (!serverConfig || !serverConfig.command) {
            return { success: false, error: i18n.t('errors.serverConfigIncomplete') };
        }

        // 规范化路径，确保使用系统正确的路径分隔符
        let execPath = path.normalize(serverConfig.command);

        // 检查是否只有文件名而没有路径
        if (!path.isAbsolute(execPath) && !execPath.includes(path.sep)) {
            log.info(`MCP可执行文件未指定完整路径, 尝试从PATH环境变量中搜索: ${execPath}`);
            const pathExecPath = mcpRuntimeManager.findExecutablePath(execPath);
            if (pathExecPath) {
                execPath = pathExecPath;
                log.info(`在PATH中找到可执行文件: ${execPath}`);
            }
        }

        // 检查可执行文件是否存在
        if (!fs.existsSync(execPath)) {
            log.error(`路径不存在: ${execPath}`);
            return { success: false, error: i18n.t('errors.executablePathNotFound', { path: execPath }) };
        }

        log.info(`使用规范化后的路径: ${execPath}`);

        // 获取mcp实例
        const mcp = require('./mcp/mcpClient');
        const testServerName = serverConfig.name || "临时测试服务";

        // 使用临时配置直接测试连接
        try {
            const testResult = await mcp.connectToServer(testServerName, {
                command: execPath,
                args: serverConfig.args || [],
                envs: serverConfig.envs || {}
            });

            return {
                success: true,
                serverName: testServerName,
                tools: testResult.length,
                toolNames: testResult.map(t => t.function.name),
                toolDescriptions: testResult.map(t => ({
                    name: t.function.name,
                    description: t.function.description || '无描述'
                }))
            };
        } catch (connectError) {
            log.error('连接MCP服务失败:', connectError);
            return {
                success: false,
                serverName: testServerName,
                error: i18n.t('errors.connectMcpServerFailed', { error: connectError.message })
            };
        }
    } catch (err) {
        log.error('测试MCP服务失败:', err.message);
        return { success: false, error: i18n.t('errors.testMcpServerFailed', { error: err.message }) };
    }
});

// 检查MCP服务连接状态
ipcMain.handle('check-mcp-connection', async (event, serverId) => {
    try {
        log.info('检查MCP连接状态:', serverId);

        const mcp = require('./mcp/mcpClient');
        const clientInfo = mcp.mcpClients.get(serverId);

        if (!clientInfo) {
            return { connected: false, error: '服务未找到' };
        }

        if (!clientInfo.isConnected) {
            return { connected: false, error: clientInfo.error || '服务已断开' };
        }

        // 可以在这里添加更复杂的连接状态检查，比如ping操作
        return { connected: true };
    } catch (error) {
        log.error('检查MCP连接状态失败:', error.message);
        return { connected: false, error: error.message };
    }
});

// 重置MCP客户端
ipcMain.handle('reset-mcp-client', async (event, serverId) => {
    try {
        log.info('重置MCP客户端:', serverId);

        const mcp = require('./mcp/mcpClient');
        const clientInfo = mcp.mcpClients.get(serverId);

        if (clientInfo) {
            // 关闭现有连接
            if (clientInfo.client && clientInfo.transport) {
                try {
                    await clientInfo.client.close();
                } catch (closeError) {
                    log.error('关闭MCP客户端时出错:', closeError.message);
                }
            }

            // 从Map中移除客户端
            mcp.mcpClients.delete(serverId);
            log.info(`已重置MCP客户端: ${serverId}`);
        }

        return { success: true };
    } catch (error) {
        log.error('重置MCP客户端失败:', error.message);
        return { success: false, error: error.message };
    }
});

// 重新连接MCP服务
ipcMain.handle('reconnect-mcp-server', async (event, { serverId, serverData }) => {
    try {
        log.info('重新连接MCP服务:', serverId);

        const mcp = require('./mcp/mcpClient');

        // 先重置客户端
        await mcp.mcpClients.delete(serverId);

        // 重新连接
        const tools = await mcp.connectToServer(serverId, serverData);

        return {
            success: true,
            serverName: serverData.name || serverId,
            tools: tools.length,
            toolDescriptions: tools.map(t => ({
                name: t.function.name,
                description: t.function.description || '无描述'
            }))
        };
    } catch (error) {
        log.error('重新连接MCP服务失败:', error.message);
        return { success: false, error: error.message };
    }
});

// 注册配置相关的IPC处理程序
registerConfigIPC();

// 注册会话相关的IPC处理函数
registerSessionIPC(ipcMain);

// 添加打开特定标签页配置窗口的IPC处理
ipcMain.handle('open-config-window-with-tab', (event, tabName) => {
    log.info('处理打开指定标签页配置窗口请求, 标签页:', tabName);
    return openConfigWindowWithTab(tabName);
});

ipcMain.handle('close-config-window', (event) => {
    log.info('关闭配置窗口');
    closeConfigWindow();
});

// 处理打开关于窗口的请求
ipcMain.handle('open-about-window', () => {
    log.info('处理打开关于窗口请求');
    const aboutWindow = new BrowserWindow({
        width: 400,
        height: 300,
        parent: BrowserWindow.getAllWindows()[0],
        modal: true,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    aboutWindow.loadFile('src/renderer/pages/about.html');
    aboutWindow.setMenuBarVisibility(false);
    aboutWindow.once('ready-to-show', () => {
        aboutWindow.show();
    });
    return true;
});

// 添加IPC处理函数，用于打开外部URL
ipcMain.handle('open-external-url', async (event, url) => {
    try {
        // 检查URL是否合法，避免安全风险
        const validUrl = url.startsWith('https://') || url.startsWith('http://');
        if (!validUrl) {
            throw new Error('不安全的URL格式');
        }

        // 在默认浏览器中打开URL
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        log.error('打开外部链接失败:', error.message);
        throw error;
    }
});

// 添加IPC处理函数，用于重置窗口焦点
ipcMain.handle('reset-window-focus', (event) => {
    try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            log.info('重置窗口焦点');
            // 先让窗口失去焦点
            win.blur();

            // 短暂延迟后重新获取焦点
            setTimeout(() => {
                win.focus();
                // 通知渲染进程焦点已重置
                win.webContents.send('window-focus-reset');
            }, 50);

            return true;
        }
        return false;
    } catch (err) {
        log.error('重置窗口焦点失败:', err.message);
        return false;
    }
});

// 处理工具授权请求
mcp.on('tool-authorization-request', async (request) => {
    const { sessionId, toolName, serverId, serverName } = request;
    log.info(`收到工具授权请求: ${toolName}, 服务: ${serverId}`);

    try {
        // 发送授权请求到渲染进程，在工具消息中显示按钮
        mainWindow.webContents.send('tool-authorization-request-' + sessionId, {
            toolName,
            serverId,
            serverName: serverName || serverId
        });

        // 等待授权结果
        const result = await new Promise((resolve) => {
            // 监听授权结果
            ipcMain.once('tool-authorization-response', (event, response) => {
                resolve(response);
            });
        });

        // 发送授权结果
        mcp.emit('tool-authorization-result', result);
    } catch (error) {
        log.error(`处理工具授权请求时出错:`, error.message);
        // 发送授权失败结果
        mcp.emit('tool-authorization-result', {
            toolName,
            serverId,
            authorized: false,
            error: error.message
        });
    }
});

// 导出配置处理函数
ipcMain.handle('export-config', async (event, configData, defaultFileName) => {
    try {
        log.info('导出配置请求:', Object.keys(configData));

        // 打开保存文件对话框
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: '导出配置',
            defaultPath: path.join(app.getPath('downloads'), defaultFileName),
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (canceled) {
            log.info('用户取消了导出配置');
            return false;
        }

        // 将配置数据写入文件
        fs.writeFileSync(filePath, JSON.stringify(configData, null, 2), 'utf8');
        log.info('配置成功导出到:', filePath);

        return true;
    } catch (error) {
        log.error('导出配置失败:', error.message);
        return false;
    }
});

// 导入配置处理函数
ipcMain.handle('import-config', async (event, importData) => {
    try {
        log.info('导入配置请求:', Object.keys(importData));

        // 记录导入的项目数量和ID映射关系
        const result = {
            success: true,
            imported: {
                models: 0,
                prompts: 0,
                mcpServers: 0,
                agents: 0,
                modelMappings: {},   // 旧ID -> 新ID 映射
                promptMappings: {},  // 旧ID -> 新ID 映射
                mcpServerMappings: {} // 旧ID -> 新ID 映射
            }
        };

        // 记录导入的项目数量
        const importCount = {
            models: 0,
            prompts: 0,
            mcpServers: 0,
            agents: 0
        };

        const now = new Date();
        const suffix = now.toLocaleString();
        let index = 1;

        // 导入模型配置 - 使用addModel方法
        if (importData.models && typeof importData.models === 'object') {
            // 为每个导入的模型生成新配置
            Object.entries(importData.models).forEach(([id, model]) => {
                if (!model.name) {
                    model.name = id;
                }

                if (!model.name) {
                    model.name = "import-" + suffix + "-" + index;
                    index++;
                }

                // 如果模型名称已存在，添加导入标识
                const existingModels = modelConfig.getConfig().models || {};
                const existingNames = Object.values(existingModels).map(m => m.name);
                if (existingNames.includes(model.name)) {
                    model.name = `${model.name} (导入)`;
                }

                // 使用添加模型方法
                const newModelId = modelConfig.addModel(model);
                if (newModelId) {
                    importCount.models++;
                    result.imported.models++;

                    // 直接使用返回的ID建立映射关系
                    result.imported.modelMappings[id] = newModelId;
                    log.info(`模型ID映射: ${id} -> ${newModelId}`);
                }
            });

            log.info(`导入了 ${importCount.models} 个模型配置`);
        }

        index = 1;
        // 导入提示词配置 - 使用addPrompt方法
        if (importData.prompts && typeof importData.prompts === 'object') {
            // 获取现有提示词
            const existingPrompts = promptConfig.getPrompts() || {};
            const existingNames = Object.values(existingPrompts).map(p => p.name);

            // 为每个导入的提示词生成新ID
            Object.entries(importData.prompts).forEach(([id, prompt]) => {
                if (!prompt.name) {
                    prompt.name = id;
                }

                if (!prompt.name) {
                    prompt.name = "import-" + suffix + "-" + index;
                    index++;
                }

                // 如果提示词名称已存在，添加导入标识
                if (existingNames.includes(prompt.name)) {
                    prompt.name = `${prompt.name} (导入)`;
                }

                // 使用添加提示词方法
                const newPromptId = promptConfig.addPrompt(prompt);
                if (newPromptId) {
                    importCount.prompts++;
                    result.imported.prompts++;

                    // 记录ID映射关系
                    result.imported.promptMappings[id] = newPromptId;
                    log.info(`提示词ID映射: ${id} -> ${newPromptId}`);
                }
            });

            log.info(`导入了 ${importCount.prompts} 个提示词`);
        }

        // 导入MCP服务配置 - 使用addMcpServer方法
        index = 1;
        if (importData.mcpServers && typeof importData.mcpServers === 'object') {
            // 获取现有MCP服务
            const mcpConfigs = mcpConfig.getConfig();
            const existingServers = mcpConfigs.servers || {};
            const existingNames = Object.values(existingServers).map(s => s.name);

            // 为每个导入的MCP服务生成新的配置
            Object.entries(importData.mcpServers).forEach(([id, server]) => {
                if (!server.name) {
                    server.name = id;
                }

                if (!server.name) {
                    server.name = "import-" + suffix + "-" + index;
                    index++;
                }

                // 如果服务名称已存在，添加导入标识
                if (existingNames.includes(server.name)) {
                    server.name = `${server.name} (导入)`;
                }

                // 使用添加MCP服务方法
                const newServerId = mcpConfig.addMcpServer(server.name, server);
                if (newServerId) {
                    importCount.mcpServers++;
                    result.imported.mcpServers++;

                    // 直接使用返回的ID建立映射关系
                    result.imported.mcpServerMappings[id] = newServerId;
                    log.info(`MCP服务ID映射: ${id} -> ${newServerId}`);
                }
            });

            log.info(`导入了 ${importCount.mcpServers} 个MCP服务配置`);
        }

        // 导入Agent配置 - 使用addAgent方法
        index = 1;
        if (importData.agents && typeof importData.agents === 'object') {
            // 获取现有Agent配置
            const existingAgents = agentConfig.getAgents() || {};
            const existingNames = Object.values(existingAgents).map(a => a.name);

            // 创建ID映射关系，用于更新Agent中的引用
            const idMappings = {
                models: {},    // 旧模型ID -> 新模型ID
                prompts: {},   // 旧提示词ID -> 新提示词ID
                mcpServers: {} // 旧MCP服务ID -> 新MCP服务ID
            };

            // 如果导入了模型，建立模型ID映射
            if (importData.models && result.imported && result.imported.modelMappings) {
                idMappings.models = result.imported.modelMappings;
            }

            // 如果导入了提示词，建立提示词ID映射
            if (importData.prompts && result.imported && result.imported.promptMappings) {
                idMappings.prompts = result.imported.promptMappings;
            }

            // 如果导入了MCP服务，建立MCP服务ID映射
            if (importData.mcpServers && result.imported && result.imported.mcpServerMappings) {
                idMappings.mcpServers = result.imported.mcpServerMappings;
            }

            log.info('ID映射关系:', idMappings);

            // 为每个导入的Agent生成新的配置
            Object.entries(importData.agents).forEach(([id, agent]) => {
                if (!agent.name) {
                    agent.name = id;
                }

                if (!agent.name) {
                    agent.name = "import-" + suffix + "-" + index;
                    index++;
                }

                // 如果Agent名称已存在，添加导入标识
                if (existingNames.includes(agent.name)) {
                    agent.name = `${agent.name} (导入)`;
                }

                // 更新Agent中引用的模型ID
                if (agent.modelId && idMappings.models[agent.modelId]) {
                    log.info(`更新Agent "${agent.name}" 中的模型引用: ${agent.modelId} -> ${idMappings.models[agent.modelId]}`);
                    agent.modelId = idMappings.models[agent.modelId];
                }

                // 更新Agent中引用的提示词ID
                if (agent.promptId && idMappings.prompts[agent.promptId]) {
                    log.info(`更新Agent "${agent.name}" 中的提示词引用: ${agent.promptId} -> ${idMappings.prompts[agent.promptId]}`);
                    agent.promptId = idMappings.prompts[agent.promptId];
                }

                // 更新Agent中引用的MCP服务ID列表
                if (agent.mcpServers && Array.isArray(agent.mcpServers)) {
                    const updatedMcpServers = agent.mcpServers.map(serverId => {
                        const newServerId = idMappings.mcpServers[serverId];
                        if (newServerId) {
                            log.info(`更新Agent "${agent.name}" 中的MCP服务引用: ${serverId} -> ${newServerId}`);
                            return newServerId;
                        }
                        return serverId;
                    });
                    agent.mcpServers = updatedMcpServers;
                }

                // 使用添加Agent方法
                const newAgentId = agentConfig.addAgent(agent);
                if (newAgentId) {
                    importCount.agents++;
                    result.imported.agents++;
                    log.info(`Agent导入成功: ${id} -> ${newAgentId}`);
                }
            });

            log.info(`导入了 ${importCount.agents} 个Agent配置`);
        }

        // 更新导入数量统计
        result.imported.models = importCount.models;
        result.imported.prompts = importCount.prompts;
        result.imported.mcpServers = importCount.mcpServers;
        result.imported.agents = importCount.agents;

        return result;
    } catch (error) {
        log.error('导入配置失败:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
});