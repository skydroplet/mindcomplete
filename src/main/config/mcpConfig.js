/**
 * mcpManager.js
 * MCP服务配置管理模块
 *
 * 负责Model Context Protocol(MCP)服务的配置管理，包括：
 * - MCP服务的添加、删除和更新
 * - 活跃MCP服务的管理
 * - MCP服务配置的持久化存储
 * - 向所有窗口通知MCP配置变更
 */

const Logger = require('../logger');
const log = new Logger('mcpManager');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');
const { app } = require('electron');

/**
 * MCP配置管理器类
 *
 * 负责管理MCP服务配置，提供添加、删除、更新服务的功能
 * 继承自EventEmitter，可以发出配置变更事件
 */
class McpConfigManager extends EventEmitter {
    /**
     * 创建MCP配置管理器实例
     *
     * 初始化配置文件路径，加载现有配置
     * 设置窗口注册系统，用于通知配置变更
     */
    constructor() {
        super();
        const userDataPath = app.getPath('userData');
        // 创建 user-data/config 目录结构
        const configDir = path.join(userDataPath, 'user-data', 'config');
        fs.mkdirSync(configDir, { recursive: true });

        this.configPath = path.join(configDir, 'mcp-servers.json');
        log.info('初始化McpManager，MCP服务配置文件:', this.configPath);
        this.config = this.loadConfig();

        // 存储所有窗口的WebContents以便更新
        this.registeredWindows = new Set();
    }

    /**
     * 生成不重复的随机MCP服务ID
     *
     * 使用加密随机数生成唯一标识符，确保在现有服务中不重复
     *
     * @returns {string} 生成的唯一服务ID
     */
    generateMcpServerId() {
        const randomId = 'mcp-' + crypto.randomBytes(5).toString('hex');
        // 确保ID不重复
        if (this.config.servers && this.config.servers[randomId]) {
            return this.generateMcpServerId(); // 递归重新生成
        }
        return randomId;
    }

    /**
     * 加载MCP服务配置
     *
     * 从配置文件中读取MCP服务配置，如果文件不存在或读取失败，返回默认配置
     * 支持兼容旧版配置格式，自动转换为新格式
     *
     * @returns {Object} MCP服务配置对象
     */
    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                return {
                    servers: {},
                    activeMcps: [] // 支持多个活跃的MCP
                };
            }
            const data = fs.readFileSync(this.configPath, 'utf8');
            log.info('加载MCP服务配置成功:', data);

            const config = JSON.parse(data);

            // 兼容旧版配置格式
            if (!config.servers && !config.activeMcps) {
                // 如果是旧版格式（直接是servers对象），则转换为新格式
                return {
                    servers: config,
                    activeMcps: []
                };
            }

            return config;
        } catch (error) {
            log.error('加载MCP服务配置失败:', error.message);
            return {
                servers: {},
                activeMcps: []
            };
        }
    }

    /**
     * 保存MCP服务配置
     *
     * 将当前MCP服务配置保存到配置文件，并通知所有注册的窗口配置已更新
     *
     * @returns {boolean} 保存是否成功
     */
    saveConfig() {
        try {
            log.info('保存MCP服务配置:', this.config);
            const configDir = path.dirname(this.configPath);
            fs.mkdirSync(configDir, { recursive: true });
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            this.notifyAllWindows();
            this.emit('mcp-config-updated', this.config);
            return true;
        } catch (error) {
            log.error('保存MCP服务配置失败:', error.message);
            return false;
        }
    }

    /**
     * 保存MCP服务配置（兼容旧版本API）
     *
     * 已废弃，保留兼容性，调用saveConfig方法
     *
     * @returns {boolean} 保存是否成功
     * @deprecated 使用saveConfig代替
     */
    saveMcpServers() {
        return this.saveConfig();
    }

    /**
     * 加载MCP服务配置（兼容旧版本API）
     *
     * 已废弃，保留兼容性，返回当前配置中的servers对象
     *
     * @returns {Object} MCP服务配置对象
     * @deprecated 使用getMcpConfig代替
     */
    loadMcpServers() {
        return this.config.servers || {};
    }

    /**
     * 添加新的MCP服务
     *
     * 创建新的MCP服务配置并保存，自动生成唯一ID
     * 支持从不同格式的输入数据转换为标准配置格式
     *
     * @param {string} name - MCP服务名称
     * @param {Object} serverData - MCP服务配置数据
     * @returns {boolean} 添加是否成功
     */
    addMcpServer(name, serverData) {
        try {
            log.info('添加MCP服务配置:', name, serverData);

            if (!this.config.servers) {
                this.config.servers = {};
            }

            // 确保 activeMcps 存在
            if (!this.config.activeMcps) {
                this.config.activeMcps = [];
            }

            // 生成唯一ID
            const serverId = this.generateMcpServerId();

            // 转换数据结构
            const serverConfig = {
                id: serverId,
                name: name,
                command: serverData.command,
                args: serverData.args || [],
                envs: serverData.envVars ? serverData.envVars.reduce((acc, env) => {
                    if (env.key && env.value) acc[env.key] = env.value;
                    return acc;
                }, {}) : (serverData.env || {}),
                autoApprove: serverData.autoApprove || [],
                toolDescriptions: serverData.toolDescriptions || []
            };

            // 更新内存中的配置
            this.config.servers[serverId] = serverConfig;

            return this.saveConfig();
        } catch (err) {
            log.error('添加MCP服务配置失败:', err.message);
            return false;
        }
    }

    /**
     * 更新现有MCP服务
     *
     * 更新指定ID的MCP服务配置并保存
     * 保留原有配置中未明确更新的字段
     *
     * @param {string} serverId - 要更新的MCP服务ID
     * @param {Object} config - 新的MCP服务配置对象
     * @returns {boolean} 更新是否成功
     */
    updateMcpServer(serverId, config) {
        try {
            log.info('更新MCP服务配置:', serverId, config);

            if (!this.config.servers) {
                this.config.servers = {};
            }

            if (this.config.servers[serverId]) {
                // 转换数据结构，确保格式一致性
                const updatedConfig = {
                    id: serverId, // 确保ID保持不变
                    name: config.name,
                    command: config.command,
                    args: config.args || [],
                    envs: config.env || {},
                    autoApprove: config.autoApprove || this.config.servers[serverId].autoApprove || [],
                    toolDescriptions: config.toolDescriptions || this.config.servers[serverId].toolDescriptions || []
                };

                // 更新服务配置，保留id和其他未明确更新的字段
                this.config.servers[serverId] = {
                    ...this.config.servers[serverId],
                    ...updatedConfig
                };

                return this.saveConfig();
            }
            return false;
        } catch (err) {
            log.error('更新MCP服务配置失败:', err.message);
            return false;
        }
    }

    /**
     * 删除MCP服务
     *
     * 删除指定ID的MCP服务配置，如果删除的是当前活跃的MCP服务，则从活跃列表中移除
     *
     * @param {string} serverId - 要删除的MCP服务ID
     * @returns {boolean} 删除是否成功
     */
    deleteMcpServer(serverId) {
        if (!this.config.servers) {
            return false;
        }

        if (this.config.servers[serverId]) {
            const server = this.config.servers[serverId];
            delete this.config.servers[serverId];

            // 如果删除的MCP是当前活跃的MCP之一，从活跃列表中移除
            if (this.config.activeMcps && this.config.activeMcps.includes(serverId)) {
                this.config.activeMcps = this.config.activeMcps.filter(id => id !== serverId);
            }

            return this.saveConfig();
        }
        return false;
    }

    /**
     * 获取所有MCP服务
     *
     * 返回当前配置中的所有MCP服务
     *
     * @returns {Object} MCP服务配置对象
     */
    getMcpServers() {
        return this.config.servers || {};
    }

    /**
     * 获取MCP配置
     *
     * 返回当前的MCP配置对象，包含所有服务和活跃服务列表
     *
     * @returns {Object} MCP配置对象
     */
    getMcpConfig() {
        return this.config;
    }

    /**
     * 添加或移除活跃的MCP服务
     *
     * 根据isActive参数，将指定ID的MCP服务添加到活跃列表或从活跃列表中移除
     *
     * @param {string} serverId - MCP服务ID
     * @param {boolean} isActive - 是否激活该服务
     * @returns {boolean} 操作是否成功
     */
    toggleActiveMcp(serverId, isActive) {
        if (!this.config.servers || !this.config.servers[serverId]) {
            return false;
        }

        if (!this.config.activeMcps) {
            this.config.activeMcps = [];
        }

        const isCurrentlyActive = this.config.activeMcps.includes(serverId);

        if (isActive && !isCurrentlyActive) {
            // 添加到活跃列表
            this.config.activeMcps.push(serverId);
            return this.saveConfig();
        } else if (!isActive && isCurrentlyActive) {
            // 从活跃列表移除
            this.config.activeMcps = this.config.activeMcps.filter(id => id !== serverId);
            return this.saveConfig();
        }

        return true; // 状态没变，视为成功
    }

    /**
     * 设置活跃MCP服务列表
     *
     * 一次性设置多个活跃的MCP服务，替换当前的活跃列表
     *
     * @param {string|string[]} mcpServerIds - 要设置为活跃的MCP服务ID或ID数组
     * @returns {boolean} 设置是否成功
     */
    setActiveMcps(mcpServerIds) {
        if (!Array.isArray(mcpServerIds)) {
            mcpServerIds = [mcpServerIds].filter(Boolean);
        }

        // 过滤掉不存在的MCP服务
        const validServerIds = mcpServerIds.filter(id =>
            this.config.servers && this.config.servers[id]
        );

        this.config.activeMcps = validServerIds;
        return this.saveConfig();
    }

    /**
     * 获取活跃MCP服务列表
     *
     * 返回当前活跃的MCP服务ID数组
     *
     * @returns {string[]} 活跃MCP服务ID数组
     */
    getActiveMcps() {
        return this.config.activeMcps || [];
    }

    /**
     * 注册窗口以接收配置更新
     *
     * 将窗口的WebContents添加到注册列表，以便在配置变更时通知
     *
     * @param {Electron.WebContents} webContents - 要注册的窗口WebContents
     */
    registerWindow(webContents) {
        if (webContents && !webContents.isDestroyed()) {
            this.registeredWindows.add(webContents);

            // 当窗口关闭时，移除它
            webContents.on('destroyed', () => {
                this.unregisterWindow(webContents);
            });
        }
    }

    /**
     * 取消注册窗口
     *
     * 从注册列表中移除窗口的WebContents
     *
     * @param {Electron.WebContents} webContents - 要取消注册的窗口WebContents
     */
    unregisterWindow(webContents) {
        this.registeredWindows.delete(webContents);
    }

    /**
     * 通知所有注册的窗口配置已更新
     *
     * 向所有注册的窗口发送配置更新事件
     */
    notifyAllWindows() {
        for (const webContents of this.registeredWindows) {
            if (!webContents.isDestroyed()) {
                webContents.send('mcp-config-updated', this.config);
            }
        }
    }
}

// 创建并导出单例实例
const mcpConfigManager = new McpConfigManager();
module.exports = mcpConfigManager;