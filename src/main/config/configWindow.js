/**
 * configWindow.js
 * 配置窗口管理模块
 *
 * 负责创建和管理应用程序的配置窗口，处理配置相关的IPC通信
 * 包括模型配置、MCP服务配置、提示词配置和Agent配置的界面交互
 */

const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Logger = require('../logger');
const log = new Logger('config');
const appConfig = require('./appConfig');
const modelManager = require('./modelConfig');
const mcpManager = require('./mcpConfig');
const promptManager = require('./promptConfig');
const agentManager = require('./agentConfig');
const modelMarketConfig = require('./modelMarketConfig');

// 配置窗口实例引用
let configWindow;

/**
 * 创建配置窗口
 *
 * 创建一个新的配置窗口，并加载配置界面
 * 支持指定初始激活的标签页
 *
 * @param {string} activeTab - 可选，初始激活的标签页名称
 * @returns {BrowserWindow} 创建的配置窗口实例
 */
function createConfigWindow(activeTab) {
    configWindow = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    configWindow.loadFile('src/renderer/pages/config.html');

    // 隐藏菜单栏，但保留快捷键功能
    configWindow.setMenuBarVisibility(false);

    // 注册配置窗口以接收配置更新
    appConfig.registerWindow(configWindow.webContents);

    // 注册配置窗口以接收提示词更新
    promptManager.registerWindow(configWindow.webContents);

    // 注册配置窗口以接收模型市场数据更新
    modelMarketConfig.registerWindow(configWindow.webContents);

    // 如果指定了激活的标签页，在窗口加载完成后切换到该标签页
    if (activeTab) {
        configWindow.webContents.once('did-finish-load', () => {
            configWindow.webContents.send('switch-tab', activeTab);
        });
    }

    // 窗口关闭时清除引用
    configWindow.on('closed', () => {
        configWindow = null;
    });

    return configWindow;
}

/**
 * 打开配置窗口并切换到特定标签页
 *
 * 如果配置窗口已存在，则聚焦并切换到指定标签页
 * 如果配置窗口不存在，则创建新窗口并初始化为指定标签页
 *
 * @param {string} tabName - 要切换到的标签页名称
 * @returns {boolean} 操作是否成功
 */
function openConfigWindowWithTab(tabName) {
    if (configWindow) {
        log.info('重新加载指定标签页配置窗口:', tabName);
        configWindow.focus();
        configWindow.webContents.send('switch-tab', tabName);
    } else {
        log.info('打开指定标签页配置窗口:', tabName);
        createConfigWindow(tabName);
    }

    return true;
}

/**
 * 关闭配置窗口
 *
 * 清除配置窗口引用，允许垃圾回收
 *
 * @returns {boolean} 操作是否成功
 */
function closeConfigWindow() {
    if (configWindow) {
        configWindow = null
    }

    return true;
}

/**
 * 注册配置相关的IPC处理函数
 *
 * 设置所有与配置相关的IPC通信处理程序，包括：
 * - 模型配置管理
 * - MCP服务配置管理
 * - 提示词配置管理
 * - Agent配置管理
 */
function registerConfigIPC() {
    // 配置相关IPC处理
    ipcMain.handle('get-models', () => {
        const modelConfig = modelManager.getConfig();
        const models = modelConfig.models || {};
        return models;
    });

    // 添加禁用窗口关闭的处理函数
    ipcMain.handle('disable-window-close', () => {
        log.info('禁用配置窗口关闭功能');
        if (configWindow) {
            configWindow.setClosable(false);
        }
    });

    // 添加启用窗口关闭的处理函数
    ipcMain.handle('enable-window-close', () => {
        log.info('启用配置窗口关闭功能');
        if (configWindow) {
            configWindow.setClosable(true);
        }
    });

    // 添加打开配置窗口的处理函数
    ipcMain.handle('open-config-window', () => {
        log.info('处理打开配置窗口请求');
        if (configWindow) {
            configWindow.focus();
        } else {
            createConfigWindow();
        }
        return true;
    });

    ipcMain.handle('get-config', () => {
        log.info('处理获取配置请求');
        return modelManager.getConfig();
    });

    ipcMain.handle('select-model', (event, modelId) => {
        log.info('处理选择模型请求:', modelId);
        return modelManager.selectModel(modelId);
    });

    ipcMain.handle('add-model', async (event, model) => {
        log.info('处理添加模型请求, 模型数据:', JSON.stringify(model, null, 2));
        const modelId = modelManager.addModel(model);
        log.info('添加模型结果:', modelId);
        return !!modelId;
    });

    ipcMain.handle('update-model', async (event, { modelId, model }) => {
        log.info('处理更新模型请求, modelId:', modelId, '模型数据:', JSON.stringify(model, null, 2));
        const result = modelManager.updateModel(modelId, model);
        log.info('更新模型结果:', result);
        return result;
    });

    ipcMain.handle('delete-model', async (event, modelId) => {
        log.info('处理删除模型请求, modelId:', modelId);
        const result = modelManager.deleteModel(modelId);
        log.info('删除模型结果:', result);
        return result;
    });

    // 添加配置数据监听
    ipcMain.on('request-config-data', (event) => {
        const models = modelManager.getConfig();
        const mcpConfig = mcpManager.getConfig();
        event.sender.send('config-data', { models, mcpConfig });
    });

    // MCP服务相关IPC处理
    ipcMain.handle('get-mcp-servers', () => {
        log.info('处理获取MCP服务列表请求');
        return mcpManager.getMcpServers();
    });

    ipcMain.handle('get-mcp-config', () => {
        log.info('处理获取MCP配置请求');
        return mcpManager.getConfig();
    });

    ipcMain.handle('save-mcp-server', async (event, serverData) => {
        log.info('save mcp server:', serverData);
        return mcpManager.addMcpServer(serverData.name, serverData);
    });

    ipcMain.handle('update-mcp-server', async (event, { serverId, serverData }) => {
        log.info('update mcp server:', serverId);
        return mcpManager.updateMcpServer(serverId, serverData);
    });

    ipcMain.handle('delete-mcp-server', async (event, serverId) => {
        log.info('delete mcp server:', serverId);
        return mcpManager.deleteMcpServer(serverId);
    });

    ipcMain.handle('toggle-active-mcp', async (event, { serverId, isActive }) => {
        log.info('处理切换MCP激活状态请求，ID:', serverId, '激活状态:', isActive);
        return mcpManager.toggleActiveMcp(serverId, isActive);
    });

    ipcMain.handle('set-active-mcps', async (event, mcpServerIds) => {
        log.info('处理设置活跃MCP请求，MCP ID列表:', mcpServerIds);
        return mcpManager.setActiveMcps(mcpServerIds);
    });

    ipcMain.handle('get-active-mcps', () => {
        log.info('处理获取活跃MCP列表请求');
        return mcpManager.getActiveMcps();
    });

    // 提示词相关IPC处理
    ipcMain.handle('get-prompts', async (event, promptType = 'system') => {
        log.info('处理获取提示词列表请求 - 只返回系统提示词');
        return promptManager.getPromptsByType(promptType);
    });

    // 专门为配置窗口提供的获取所有提示词的IPC处理
    ipcMain.handle('get-all-prompts', () => {
        log.info('处理获取所有提示词列表请求（配置窗口使用）');
        return promptManager.getPrompts();
    });

    ipcMain.handle('get-current-prompt', () => {
        log.info('处理获取当前提示词请求');
        return promptManager.getCurrentPrompt();
    });

    ipcMain.handle('set-current-prompt', (event, promptId) => {
        log.info('处理设置当前提示词请求:', promptId);
        return promptManager.setCurrentPrompt(promptId);
    });

    ipcMain.handle('add-prompt', (event, prompt) => {
        log.info('处理添加提示词请求, 提示词数据:', JSON.stringify(prompt, null, 2));
        const promptId = promptManager.addPrompt(prompt);
        return promptId;
    });

    ipcMain.handle('update-prompt', (event, { promptId, prompt }) => {
        log.info('处理更新提示词请求, promptId:', promptId, '提示词数据:', JSON.stringify(prompt, null, 2));
        return promptManager.updatePrompt(promptId, prompt);
    });

    ipcMain.handle('delete-prompt', (event, promptId) => {
        log.info('处理删除提示词请求, promptId:', promptId);
        return promptManager.deletePrompt(promptId);
    });

    // Agent配置相关IPC处理
    ipcMain.handle('get-agents', () => {
        log.info('处理获取Agent列表请求');
        return agentManager.getAgents();
    });

    ipcMain.handle('add-agent', async (event, agent) => {
        log.info('处理添加Agent请求, Agent数据:', JSON.stringify(agent, null, 2));
        const result = agentManager.addAgent(agent);
        log.info('添加Agent结果:', result);
        return result;
    });

    ipcMain.handle('update-agent', async (event, { agentId, agent }) => {
        log.info('处理更新Agent请求, agentId:', agentId, 'Agent数据:', JSON.stringify(agent, null, 2));
        const result = agentManager.updateAgent(agentId, agent);
        log.info('更新Agent结果:', result);
        return result;
    });

    ipcMain.handle('delete-agent', async (event, agentId) => {
        log.info('处理删除Agent请求, agentId:', agentId);
        const result = agentManager.deleteAgent(agentId);
        log.info('删除Agent结果:', result);
        return result;
    });

    ipcMain.handle('copy-agent', async (event, agentId) => {
        log.info('处理复制Agent请求, agentId:', agentId);
        const result = agentManager.copyAgent(agentId);
        log.info('复制Agent结果:', result);
        return result;
    });

    // 模型市场相关IPC处理程序
    ipcMain.handle('get-market-models', async (event) => {
        log.info('处理获取模型市场数据请求');
        try {
            const result = modelMarketConfig.getMarketModels();
            log.info('获取模型市场数据成功，共', result.count, '个模型');
            return result;
        } catch (error) {
            log.error('获取模型市场数据失败:', error.message);
            throw error;
        }
    });

    ipcMain.handle('get-market-model-by-id', async (event, modelId) => {
        log.info('处理获取指定模型市场数据请求, modelId:', modelId);
        try {
            const result = modelMarketConfig.getModelById(modelId);
            if (result) {
                log.info('获取模型市场数据成功:', result.name);
            } else {
                log.warn('未找到指定的模型市场数据, modelId:', modelId);
            }
            return result;
        } catch (error) {
            log.error('获取模型市场数据失败:', error.message);
            throw error;
        }
    });

    ipcMain.handle('refresh-market-models', async (event) => {
        log.info('处理刷新模型市场数据请求');
        try {
            const result = await modelMarketConfig.refreshData();
            log.info('刷新模型市场数据结果:', result.success ? '成功' : '失败');
            return result;
        } catch (error) {
            log.error('刷新模型市场数据失败:', error.message);
            return {
                success: false,
                message: error.message,
                models: [],
                lastUpdated: null
            };
        }
    });

    ipcMain.handle('get-market-cache-info', async (event) => {
        log.info('处理获取模型市场缓存信息请求');
        try {
            const result = modelMarketConfig.getCacheInfo();
            log.info('获取模型市场缓存信息成功');
            return result;
        } catch (error) {
            log.error('获取模型市场缓存信息失败:', error.message);
            throw error;
        }
    });
}

module.exports = {
    createConfigWindow,
    registerConfigIPC,
    openConfigWindowWithTab,
    closeConfigWindow,
};