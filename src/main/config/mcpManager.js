/**
 * MCP服务配置管理模块
 * 负责MCP服务的添加、删除、更新和管理活跃MCP服务
 */

const Logger = require('../logger');
const log = new Logger('mcpManager');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');
const { app } = require('electron');

class McpConfigManager extends EventEmitter {
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

    // 生成不重复的随机MCP服务ID
    generateMcpServerId() {
        const randomId = 'mcp-' + crypto.randomBytes(5).toString('hex');
        // 确保ID不重复
        if (this.config.servers && this.config.servers[randomId]) {
            return this.generateMcpServerId(); // 递归重新生成
        }
        return randomId;
    }

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
            log.error('加载MCP服务配置失败:', error);
            return {
                servers: {},
                activeMcps: []
            };
        }
    }

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
            log.error('保存MCP服务配置失败:', error);
            return false;
        }
    }

    // 兼容旧版本的 API（已废弃，保留兼容性）
    saveMcpServers() {
        return this.saveConfig();
    }

    // 兼容旧版本的 API（已废弃，保留兼容性）
    loadMcpServers() {
        return this.config.servers || {};
    }

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
                path: serverData.path,
                args: serverData.args || [],
                env: serverData.envVars ? serverData.envVars.reduce((acc, env) => {
                    if (env.key && env.value) acc[env.key] = env.value;
                    return acc;
                }, {}) : (serverData.env || {}),
                disabled: serverData.disabled !== undefined ? serverData.disabled : !serverData.enabled,
                autoApprove: serverData.autoApprove || [],
                toolDescriptions: serverData.toolDescriptions || []
            };

            // 更新内存中的配置
            this.config.servers[serverId] = serverConfig;

            return this.saveConfig();
        } catch (err) {
            log.error('添加MCP服务配置失败:', err);
            return false;
        }
    }

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
                    path: config.path,
                    args: config.args || [],
                    env: config.env || {},
                    disabled: config.disabled !== undefined ? config.disabled : this.config.servers[serverId].disabled,
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
            log.error('更新MCP服务配置失败:', err);
            return false;
        }
    }

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

    getMcpServers() {
        return this.config.servers || {};
    }

    getMcpConfig() {
        return this.config;
    }

    // 添加或移除活跃的MCP
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

    // 设置活跃MCPs（可一次设置多个）
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

    // 获取活跃MCPs
    getActiveMcps() {
        return this.config.activeMcps || [];
    }

    // 窗口注册系统，确保所有窗口保持配置一致
    registerWindow(webContents) {
        if (webContents && !webContents.isDestroyed()) {
            this.registeredWindows.add(webContents);

            // 当窗口关闭时，移除它
            webContents.on('destroyed', () => {
                this.unregisterWindow(webContents);
            });
        }
    }

    unregisterWindow(webContents) {
        this.registeredWindows.delete(webContents);
    }

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