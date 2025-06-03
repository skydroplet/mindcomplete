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

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const BaseConfigManager = require('./baseConfigManager');
const Logger = require('../logger');
const log = new Logger('mcpManager');

/**
 * MCP配置管理器类
 *
 * 负责管理MCP服务配置，提供添加、删除、更新服务的功能
 * 继承自BaseConfigManager，可以发出配置变更事件
 */
class McpConfig extends BaseConfigManager {
    /**
     * 创建MCP配置管理器实例
     */
    constructor() {
        const userDataPath = app.getPath('userData');
        const tempDir = path.join(userDataPath, 'user-data', 'temp');
        fs.mkdirSync(tempDir, { recursive: true });

        const defaultMcp = [
            {
                name: '命令行执行',
                command: 'npx',
                args: ['-y', 'mcp-server-commands'],
            },
            {
                name: '本地文件操作',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', tempDir],
            },
            {
                name: 'bing中文搜索',
                command: 'npx',
                args: ['-y', 'bing-cn-mcp'],
            },
            {
                name: '网页信息获取',
                command: 'uvx',
                args: ['mcp-server-fetch'],
            },
        ]

        const defaultConfig = {
            servers: {},
            activeMcps: []
        };

        for (let i = 0; i < defaultMcp.length; i++) {
            let id = 'default-mcp-' + (i + 1);
            defaultConfig.servers[id] = {
                name: defaultMcp[i].name,
                command: defaultMcp[i].command,
                args: defaultMcp[i].args,
            }
            defaultConfig.activeMcps.push(id);
        }

        super('mcp-servers.json', defaultConfig);
    }

    /**
     * 添加新的MCP服务
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
            const serverId = this.generateUniqueId('mcp', this.config.servers);

            // 转换数据结构
            const serverConfig = {
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

            this.saveConfig();
            return serverId;
        } catch (err) {
            log.error('添加MCP服务配置失败:', err.message);
            return null;
        }
    }

    /**
     * 更新现有MCP服务
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
     * @param {string} serverId - 要删除的MCP服务ID
     * @returns {boolean} 删除是否成功
     */
    deleteMcpServer(serverId) {
        if (!this.config.servers) {
            return false;
        }

        if (this.config.servers[serverId]) {
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
     * @returns {Object} MCP服务配置对象
     */
    getMcpServers() {
        return this.config.servers || {};
    }

    /**
     * 添加或移除活跃的MCP服务
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
     * @returns {string[]} 活跃MCP服务ID数组
     */
    getActiveMcps() {
        return this.config.activeMcps || [];
    }
}

// 创建并导出单例实例
const mcpConfig = new McpConfig();
module.exports = mcpConfig;