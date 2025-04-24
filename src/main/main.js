const { app, ipcMain, Menu, BrowserWindow, nativeTheme, shell, dialog } = require('electron');
const { OpenAI } = require('openai');
require('dotenv').config();
const i18n = require('../locales/i18n');
const fs = require('fs');
const { createWindow } = require('./mainWindow');
const { configManager, createConfigWindow, registerConfigIPC, promptConfigManager: promptManager, modelConfigManager: modelManager, openConfigWindowWithTab } = require('./config');
const { sessionManager, registerSessionIPC } = require('./session');
const Logger = require('./logger');
const log = new Logger('main');
const path = require('path');
const os = require('os');

let modelClient = null;

// 全局MCP实例
const mcp = require('./mcpClient');

// 创建大模型client
function createModelClient() {
    try {
        const modelConfig = modelManager.getModelConfig();

        if (!modelConfig.currentModel) {
            throw new Error(i18n.t('errors.noModelSelected'));
        }

        if (!modelConfig.models || !modelConfig.models[modelConfig.currentModel]) {
            throw new Error(i18n.t('errors.modelConfigNotExist'));
        }

        const currentModel = modelConfig.models[modelConfig.currentModel];

        // 创建OpenAI客户端实例
        modelClient = new OpenAI({
            apiKey: currentModel.apiKey,
            baseURL: currentModel.apiBaseUrl
        });

        return modelClient;
    } catch (error) {
        log.error(i18n.t('errors.createModelClientFailed'), error);
        throw error;
    }
}

// 监听配置更新事件，当模型配置变更时，重置Client
modelManager.on('model-config-updated', (config) => {
    log.info(i18n.t('logs.modelConfigUpdated'));
    modelClient = createModelClient();
});

function createMenu() {
    // 确保使用当前配置的语言
    const configLanguage = configManager.getLanguage();
    if (configLanguage) {
        i18n.loadFromConfig(configLanguage);
    }

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
                { label: i18n.t('menu.view.zoomIn'), role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus' },
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
        {
            label: i18n.t('menu.help.label'),
            submenu: [
                {
                    label: i18n.t('menu.help.about'),
                    click: () => {
                        const aboutWindow = new BrowserWindow({
                            width: 400,
                            height: 300,
                            parent: mainWindow,
                            modal: true,
                            show: false
                        });
                        aboutWindow.loadFile('about.html');
                        aboutWindow.setMenuBarVisibility(false);
                        aboutWindow.once('ready-to-show', () => {
                            aboutWindow.show();
                        });
                    }
                },
                {
                    label: i18n.t('menu.help.checkForUpdates'),
                    click: async () => {
                        try {
                            const { mainWindow } = require('./mainWindow');

                            // 显示检查更新中状态
                            if (mainWindow && mainWindow.webContents) {
                                mainWindow.webContents.send('checking-for-updates');
                            }

                            // 强制检查更新
                            const updateInfo = await configManager.checkForUpdates(true);

                            // 显示检查结果
                            if (mainWindow && mainWindow.webContents) {
                                mainWindow.webContents.send('update-check-result', updateInfo);
                            }
                        } catch (error) {
                            log.error('手动检查更新失败:', error);
                            const { mainWindow } = require('./mainWindow');
                            if (mainWindow && mainWindow.webContents) {
                                mainWindow.webContents.send('update-check-error', error.message);
                            }
                        }
                    }
                }
            ]
        }
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
    const configLanguage = configManager.getLanguage();
    if (configLanguage) {
        i18n.loadFromConfig(configLanguage);
    }

    // 初始化窗口
    createWindow();

    const { mainWindow } = require('./mainWindow');

    // 将配置管理器注册到主窗口
    if (mainWindow && mainWindow.webContents) {
        configManager.registerWindow(mainWindow.webContents);
    }

    // 创建菜单
    createMenu();

    // 初始化提示词管理器
    promptManager.init();

    // 初始化MCP服务，连接所有活跃的MCP
    mcp.initialize();

    // 检查更新
    checkForUpdates();

    // 确保创建一个默认会话
    if (!sessionManager.getActiveSessionId()) {
        const sessions = sessionManager.getSessions();
        if (sessions.length > 0) {
            // 加载最近的会话
            sessionManager.loadSession(sessions[0].id);
        } else {
            // 创建新会话
            sessionManager.createSession();
        }
    }

    // 注册主题切换IPC事件
    ipcMain.on('theme-changed', (event, theme) => {
        // 保存主题设置到通用配置
        configManager.setTheme(theme);

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
        const theme = configManager.getTheme();
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
});

// 应用启动时检查更新
async function checkForUpdates() {
    try {
        const { mainWindow } = require('./mainWindow');

        // 检查更新
        log.info('应用启动时自动检查更新');
        const updateInfo = await configManager.checkForUpdates();

        // 如果有更新，通知用户
        if (updateInfo.hasUpdate && mainWindow && mainWindow.webContents) {
            log.info('发现新版本:', updateInfo.version);
            // 发送更新信息到渲染进程，渲染进程会显示更新通知
            mainWindow.webContents.send('update-available', updateInfo);
        }
    } catch (error) {
        log.error('自动检查更新失败:', error);
    }
}

// 添加IPC通道供渲染进程调用
ipcMain.handle('check-for-updates', async (event, force = false) => {
    try {
        return await configManager.checkForUpdates(force);
    } catch (error) {
        log.error('IPC检查更新失败:', error);
        throw error;
    }
});

// 设置稍后提醒时间的IPC处理程序
ipcMain.handle('set-remind-later', async (event) => {
    try {
        return configManager.setRemindLaterTime();
    } catch (error) {
        log.error('设置稍后提醒失败:', error);
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
        createWindow();
    }
});

// 获取当前语言设置
ipcMain.handle('get-language', () => {
    return configManager.getLanguage();
});

// 获取当前主题设置
ipcMain.handle('get-theme', () => {
    return configManager.getTheme();
});

// 处理语言切换
ipcMain.handle('set-locale', (event, locale) => {
    // 保存语言设置到通用配置
    configManager.setLanguage(locale);

    i18n.setLocale(locale);
    const { mainWindow } = require('./mainWindow');

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

// 处理工具调用的逻辑，抽取为函数以提高可读性
/**
 * 处理AI模型生成的工具调用，执行每个工具，并生成最终回复
 * 
 * @param {Object} event - Electron IPC事件对象，用于与前端通信
 * @param {Array} toolCalls - AI模型生成的工具调用数组，每个元素包含工具名称和参数
 * @param {Object} client - AI模型客户端，用于发送API请求
 * @param {Object} currentModel - 当前使用的AI模型配置
 * @returns {String} 工具处理后生成的完整回复文本
 */
async function handleToolCalls(event, toolCalls, client, currentModel) {
    // 初始化最终回复文本和消息历史数组
    let fullResponse = '';
    const messages = [{
        role: 'assistant', // 第一条消息是助手发出的工具调用请求
        tool_calls: toolCalls
    }];

    // 依次处理每个工具调用
    for (const toolCall of toolCalls) {
        // 确保工具调用包含有效的名称和参数
        if (toolCall.function.name && toolCall.function.arguments) {
            let toolMessage = "";

            try {
                // 解析工具名称和参数
                const toolName = toolCall.function.name;
                let args = JSON.parse(toolCall.function.arguments);

                // 向前端发送当前正在执行的工具信息
                event.sender.send('new-mcp-tool-message', `${i18n.t('toolCalls.tool', { name: toolName })}\n\n`);

                toolMessage += `${i18n.t('toolCalls.tool', { name: toolName })}\n\n`;

                // 向前端显示工具参数
                event.sender.send('mcp-tool-message-chunk', i18n.t('toolCalls.parameters', { args: JSON.stringify(args, null, 2) }));
                toolMessage += i18n.t('toolCalls.parameters', { args: JSON.stringify(args, null, 2) });

                // 调用工具执行器(mcp)执行工具
                const result = await mcp.executeTool({
                    name: toolName,
                    arguments: args
                });

                // 通知前端工具正在处理中
                event.sender.send('mcp-tool-message-chunk', `${i18n.t('toolCalls.processing')}\n\n`);
                toolMessage += i18n.t('toolCalls.processing') + "\n\n";
                // 处理工具执行结果
                if (result && typeof result === 'object') {
                    // 向前端发送执行结果
                    event.sender.send('mcp-tool-message-chunk', i18n.t('toolCalls.result', { result: JSON.stringify(result, null, 2) }));
                    toolMessage += i18n.t('toolCalls.result', { result: JSON.stringify(result, null, 2) });

                    // 汇总工具结果 完成后再次发送给ai
                    result.role = "tool";
                    messages.push(result);
                } else {
                    // 如果结果不是有效对象，记录错误
                    const errorMsg = i18n.t('toolCalls.invalidResult', { type: typeof result });
                    log.error(errorMsg, result);
                    event.sender.send('mcp-tool-message-chunk', errorMsg);
                    toolMessage += errorMsg;
                }

                // 将工具调用结果添加到会话历史
                sessionManager.addMessage({ role: 'mcpTool', name: toolName, content: toolMessage });
            } catch (toolError) {
                // 捕获并处理工具执行过程中的错误
                const errorMsg = i18n.t('toolCalls.error', { message: toolError.message });
                log.error('Tool execution error:', toolError);
                event.sender.send('mcp-tool-message-chunk', errorMsg);
            }
        }
    }

    try {
        // 创建第二次API请求，将工具调用结果发送给AI模型生成最终回复
        const secondStream = await client.chat.completions.create({
            model: currentModel.type,
            messages: [
                {
                    role: 'assistant',
                    tool_calls: toolCalls
                },
                ...messages.slice(1) // 跳过第一条消息，因为它已包含在上面的tool_calls中
            ],
            stream: true // 启用流式响应，便于逐步显示生成内容
        });

        // 处理流式响应的每个数据块
        for await (const chunk of secondStream) {
            // 从响应中提取文本内容
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                if (fullResponse === "") {
                    fullResponse = content;
                    event.sender.send('new-ai-message', content);
                } else {
                    fullResponse += content;
                    event.sender.send('ai-message-chunk', content);
                }
            }
        }
    } catch (apiError) {
        // 处理API调用过程中的错误
        const errorMsg = i18n.t('toolCalls.responseFailed', { message: apiError.message });
        log.error('API error during final response:', apiError);
        event.sender.send('ai-message-chunk', errorMsg);
    }

    // 返回处理工具调用后AI生成的完整回复文本
    return fullResponse;
}

// 修改send-message处理函数，使用选定的提示词作为system message
ipcMain.handle('send-message', async (event, message) => {
    try {
        const modelConfig = modelManager.getModelConfig();
        log.info("modelConfig: ", modelConfig);

        if (!modelConfig.currentModel || !modelConfig.models[modelConfig.currentModel]) {
            throw new Error(i18n.t('errors.noModelSelected'));
        }

        const currentModel = modelConfig.models[modelConfig.currentModel];

        // 获取或创建client 
        let client = modelClient;
        if (!client) {
            try {
                client = createModelClient();
            } catch (clientError) {
                log.error(i18n.t('errors.createModelClientFailed'), clientError);
                throw new Error(i18n.t('errors.connectToModelApiFailed', { error: clientError.message }));
            }
        }

        // 添加日志，检查MCP工具是否正确加载
        let tools = [];
        try {
            tools = await mcp.getTools();
            log.info(i18n.t('logs.mcpToolList'), tools);
        } catch (mcpError) {
            log.error(i18n.t('logs.getMcpToolFailed'), mcpError);
            // 继续执行，但不使用MCP工具
            tools = [];
        }

        // 获取当前会话历史
        let messages = [];

        // 使用promptManager获取当前提示词
        const currentPrompt = promptManager.getCurrentPrompt();

        // 如果有选定的提示词，使用提示词内容作为相应类型的消息
        if (currentPrompt && currentPrompt.content) {
            // 使用提示词类型，默认为 'system'
            const promptType = currentPrompt.type || 'system';
            messages.push({
                role: promptType,
                content: currentPrompt.content
            });
        } else {
            // 使用默认的system message
            messages.push({
                role: 'system',
                content: i18n.t('defaultSystemMessage')
            });
        }

        // 如果有活动会话，加载会话历史
        const currentSession = sessionManager.getCurrentSession();
        if (currentSession && currentSession.id && currentSession.messages.length > 0) {
            // 将会话历史添加到消息列表
            messages = messages.concat(currentSession.messages);
        }

        // 添加当前用户消息
        messages.push({ role: 'user', content: message });
        sessionManager.addMessage({ role: 'user', content: message });

        try {
            // 构建API请求参数
            const requestParams = {
                model: currentModel.type,
                messages: messages,
                temperature: currentModel.temperature || 0.7,
                max_tokens: currentModel.contextWindowSize || 4096,
                stream: true
            };

            // 只有当工具列表不为空时，才添加tools参数
            if (tools && tools.length > 0) {
                requestParams.tools = tools;
                requestParams.tool_choice = "auto";
                log.info("使用 " + tools.length + " 个工具进行请求");
            } else {
                log.info("没有可用的工具，发送不带工具的请求");
            }

            const stream = await client.chat.completions.create(requestParams);

            let fullResponse = '';
            let toolCalls = [];
            let currentToolCallIndexes = {};

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    if (fullResponse === "") {
                        fullResponse = content;
                        event.sender.send('new-ai-message', content);
                    } else {
                        fullResponse += content;
                        event.sender.send('ai-message-chunk', content);
                    }
                }

                const toolCallChunks = chunk.choices[0]?.delta?.tool_calls || [];
                if (toolCallChunks.length > 0) {
                    // 添加详细的工具调用日志
                    log.info("收到工具调用块:", JSON.stringify(toolCallChunks, null, 2));

                    for (const toolCallChunk of toolCallChunks) {
                        const index = toolCallChunk.index;

                        // 初始化工具调用对象
                        if (!currentToolCallIndexes[index]) {
                            currentToolCallIndexes[index] = true;
                            toolCalls[index] = {
                                id: toolCallChunk.id || `call_${index}`,
                                type: "function",
                                function: {
                                    name: "",
                                    arguments: ""
                                }
                            };
                        }

                        // 更新工具调用名称
                        if (toolCallChunk.function?.name) {
                            toolCalls[index].function.name =
                                (toolCalls[index].function.name || "") + toolCallChunk.function.name;
                        }

                        // 更新工具调用参数
                        if (toolCallChunk.function?.arguments) {
                            toolCalls[index].function.arguments =
                                (toolCalls[index].function.arguments || "") + toolCallChunk.function.arguments;
                        }
                    }
                }
            }

            // 如果有工具调用，处理它
            if (toolCalls.length > 0) {
                // 处理工具调用
                const finalResponse = await handleToolCalls(event, toolCalls, client, currentModel);
                sessionManager.addMessage({ role: 'assistant', content: finalResponse });
                return { content: finalResponse, toolCalls };
            } else {
                sessionManager.addMessage({ role: 'assistant', content: fullResponse });
                return { content: fullResponse };
            }
        } catch (apiError) {
            log.error('API调用失败:', apiError);
            // 向用户显示友好的错误消息
            if (apiError.status === 401) {
                throw new Error(i18n.t('errors.invalidApiKey'));
            } else if (apiError.status === 429) {
                throw new Error(i18n.t('errors.apiRequestLimit'));
            } else if (apiError.status >= 500) {
                throw new Error(i18n.t('errors.modelServerError'));
            } else {
                throw new Error(i18n.t('errors.apiCallFailed', { error: apiError.message }));
            }
        }
    } catch (error) {
        log.error('发送消息失败:', error);
        // 确保在UI中显示错误消息
        event.sender.send('new-ai-message', `\n\n**❌ 错误:** ${error.message}\n\n`);
        throw error;
    }
});

// 添加文件系统相关的 IPC 处理
ipcMain.handle('read-file', async (event, path) => {
    try {
        return fs.readFileSync(path, 'utf8');
    } catch (error) {
        log.error('Error reading file:', error);
        throw error;
    }
});

ipcMain.handle('write-file', async (event, { path, data }) => {
    try {
        fs.writeFileSync(path, data);
        return true;
    } catch (error) {
        log.error('Error writing file:', error);
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
        log.error('创建目录失败:', error);
        throw error;
    }
});

// 直接测试mcp工具是否能调用成功
ipcMain.handle('direct-test-mcp-tool', async (event, serverConfig) => {
    try {
        log.info('接收到测试MCP服务配置:', serverConfig);

        // 如果没有传递服务配置或路径为空，则返回错误
        if (!serverConfig || !serverConfig.path) {
            return { success: false, error: i18n.t('errors.serverConfigIncomplete') };
        }

        // 规范化路径，确保使用系统正确的路径分隔符
        let execPath = path.normalize(serverConfig.path);

        // 检查是否只有文件名而没有路径
        if (!path.isAbsolute(execPath) && !execPath.includes(path.sep)) {
            log.info(`MCP可执行文件未指定完整路径, 尝试从PATH环境变量中搜索: ${execPath}`);

            // 获取MCP实例并使用其内部的findExecutableInPath函数
            const mcp = require('./mcpClient');
            const pathExecPath = mcp.findExecutableInPath ? mcp.findExecutableInPath(execPath) : null;

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
        const mcp = require('./mcpClient');
        const testServerName = serverConfig.name || "临时测试服务";

        // 使用临时配置直接测试连接
        try {
            const testResult = await mcp.connectToServer(testServerName, {
                path: execPath,
                args: serverConfig.args || [],
                env: serverConfig.env || {}
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
        log.error('测试MCP服务失败:', err);
        return { success: false, error: i18n.t('errors.testMcpServerFailed', { error: err.message }) };
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
    aboutWindow.loadFile('src/renderer/about.html');
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
        log.error('打开外部链接失败:', error);
        throw error;
    }
});

// 处理工具授权请求
mcp.on('tool-authorization-request', async (request) => {
    const { toolName, serverId, serverName } = request;
    log.info(`收到工具授权请求: ${toolName}, 服务: ${serverId}`);

    try {
        // 创建授权确认对话框
        const { mainWindow } = require('./mainWindow');
        const { response } = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: [
                i18n.t('mcp.authorization.onetime'),
                i18n.t('mcp.authorization.auto'),
                i18n.t('mcp.authorization.deny')
            ],
            defaultId: 0,
            title: i18n.t('mcp.authorization.title'),
            message: i18n.t('mcp.authorization.message', { name: toolName }),
            detail: `服务: ${serverName || serverId}`,
            cancelId: 2,
        });

        // 处理用户选择
        let result = {
            toolName,
            serverId,
            authorized: response < 2,  // 0或1为授权，2为拒绝
            permanent: response === 1  // 1为永久授权
        };

        // 发送授权结果
        mcp.emit('tool-authorization-result', result);
    } catch (error) {
        log.error(`处理工具授权请求时出错:`, error);
        // 发送授权失败结果
        mcp.emit('tool-authorization-result', {
            toolName,
            serverId,
            authorized: false,
            error: error.message
        });
    }
});