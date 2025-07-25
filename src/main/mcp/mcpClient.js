const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const Logger = require('../logger');
const log = new Logger('mcp');
const path = require('path');
const fs = require('fs');
const { mcpConfig: mcpConfigManager } = require('../config');
const EventEmitter = require('events');
const mcpRuntimeManager = require("./mcpRuntimeManager");

class MCPClientManager extends EventEmitter {
    constructor() {
        super();
        this.mcpClients = new Map();
    }

    // 初始化MCP客户端
    initialize() {
        // 获取配置中的MCP服务列表和活跃MCP
        const mcpConfig = mcpConfigManager.getConfig();
        this.activeServers = mcpConfig.activeMcps || [];

        log.info("初始化MCP Clients, 活跃MCP列表:", this.activeServers);

        // 连接上次对话使用的mcp
        this.connectToActiveServers();

        // 监听配置变更事件
        mcpConfigManager.on('mcp-config-updated', (config) => {
            log.info("MCP配置更新，重新连接服务:", config.activeMcps);
            this.activeServers = config.activeMcps || [];
            this.connectToActiveServers();
        });
    }

    // 连接到所有活跃的MCP服务
    async connectToActiveServers() {
        const mcpConfig = mcpConfigManager.getConfig();
        const servers = mcpConfig.servers || {};

        for (const serverId of this.activeServers) {
            log.info(`连接到MCP: ${serverId}`);
            await this.connectToServer(serverId, servers[serverId]);
        }

        // 如果没有活跃的MCP，也要触发事件通知
        if (this.activeServers.length === 0) {
            this.emit('mcp-status-changed', { connected: false, message: "没有活跃的MCP服务" });
        }
    }

    /**
     * 获取当前活跃的MCP服务器ID列表
     * @returns {Array} 活跃MCP服务器ID数组
     */
    getActiveMcpServerIds() {
        return this.activeServers || [];
    }

    async connectToServer(serverId, serverConfig) {
        try {
            log.info(`尝试连接MCP服务: ${serverId}`, JSON.stringify(serverConfig, null, 2));

            // 检查配置是否有效
            if (!serverConfig || !serverConfig.command) {
                throw new Error(`MCP服务配置不完整: ${serverId}`);
            }

            // 获取服务名称
            const serverName = serverConfig.name || serverId;

            // 规范化路径
            let execPath = path.normalize(serverConfig.command);

            // 检查是否只有文件名而没有路径
            if (!path.isAbsolute(execPath) && !execPath.includes(path.sep)) {
                log.info(`MCP可执行文件未指定完整路径, 尝试从PATH环境变量中搜索: ${execPath}`);
                const pathExecPath = mcpRuntimeManager.findExecutablePath(execPath);
                if (pathExecPath) {
                    execPath = pathExecPath;
                }
            }

            // 检查可执行文件是否存在
            if (!fs.existsSync(execPath)) {
                throw new Error(`MCP可执行文件不存在: ${execPath}`);
            }

            log.info(`使用MCP可执行文件: ${execPath}`);

            // 创建传输对象
            const transport = new StdioClientTransport({
                command: execPath,
                args: serverConfig.args || [],
                env: { ...process.env, ...(serverConfig.envs || {}) },
                onStdout: (data) => {
                    log.info(`[${serverName}] stdout:`, data.toString().trim());
                },
                onStderr: (data) => {
                    log.error(`[${serverName}] stderr:`, data.toString().trim());
                }
            });

            // 创建客户端对象
            const client = new Client(
                {
                    name: `mcp-client-${serverName}`,
                    version: "1.0.0",
                },
                {
                    capabilities: {},
                }
            );

            // 连接到服务器
            log.info(`开始连接到MCP服务 ${serverName}...`);
            await client.connect(transport);
            log.info(`MCP服务 ${serverName} 连接成功`);

            // 获取工具列表
            const toolsResult = await client.listTools();
            let toolNames = [];


            // 处理工具列表，转换为特定格式
            const tools = toolsResult.tools.map((tool) => {
                toolNames.push(tool.name);

                // 确保工具有合法的JSON Schema
                let parameters = tool.inputSchema;

                // 为没有参数的工具创建一个空的参数对象
                if (!parameters || Object.keys(parameters).length === 0) {
                    parameters = {
                        type: "object",
                        properties: {},
                        required: []
                    };
                }

                // 确保有type字段
                if (!parameters.type) {
                    parameters.type = "object";
                }

                // 如果没有properties字段，添加空的properties
                if (!parameters.properties) {
                    parameters.properties = {};
                }

                return {
                    type: "function",
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: parameters,
                        serverId: serverId, // 使用serverId替代serverName
                        serverName: serverName // 保留服务名称用于显示
                    }
                };
            });
            log.info(`服务 ${serverName} 工具数量:`, toolsResult.tools.length);

            // 保存客户端实例
            this.mcpClients.set(serverId, {
                client,
                transport,
                tools,
                isConnected: true,
                serverId,
                serverName
            });

            log.info(`成功连接到MCP服务 ${serverName}，获取到 ${tools.length} 个工具: ${toolNames.join(', ')}`);

            // 发送连接状态变更事件
            this.emit('mcp-status-changed', {
                connected: true,
                serverId,
                serverName,
                toolCount: tools.length,
                message: `已连接到 ${serverName}`
            });

            return tools;
        } catch (error) {
            log.error(`连接MCP服务失败 ${serverId}:`, error.message);

            // 获取服务名称
            const serverName = serverConfig?.name || serverId;

            // 记录失败状态
            this.mcpClients.set(serverId, {
                isConnected: false,
                error: error.message,
                serverId,
                serverName,
                tools: []
            });

            // 发送连接状态变更事件
            this.emit('mcp-status-changed', {
                connected: false,
                serverId,
                serverName,
                error: error.message,
                message: `连接 ${serverName} 失败: ${error.message}`
            });

            return [];
        }
    }

    getToolsForServer(serverIds) {
        let tools = [];

        const mcpConfig = mcpConfigManager.getConfig();
        const servers = mcpConfig.servers || {};

        for (const serverId of serverIds) {
            const serverName = servers[serverId].name;

            let client = this.mcpClients.get(serverId);
            if (!client || !client.isConnected) {
                this.connectToServer(serverId, servers[serverId])
            }

            client = this.mcpClients.get(serverId);
            if (!client || !client.isConnected) {
                log.error(`MCP服务连接失败 ${serverId} ${serverName}`);
                continue;
            }

            if (client.tools && client.tools.length > 0) {
                // 将工具名称转换为serverId:name格式
                const convertedTools = client.tools.map(tool => ({
                    ...tool,
                    function: {
                        ...tool.function,
                        name: serverId + ":" + tool.function.name
                    }
                }));
                tools.push(...convertedTools);
            }

            log.info(`${serverId} 共 ${client.tools.length} 个工具`);
        }

        return tools;
    }

    // 获取所有可用工具，合并来自不同MCP服务的工具
    getTools() {
        const allTools = [];

        for (const [serverId, client] of this.mcpClients.entries()) {
            if (client.isConnected && client.tools && client.tools.length > 0) {
                allTools.push(...client.tools);
            }
        }

        log.info(`获取工具列表，共 ${allTools.length} 个工具`);
        return allTools;
    }

    // 检查工具是否已授权
    isToolAuthorized(toolName, serverId) {
        const config = mcpConfigManager.getConfig();
        if (!config || !config.servers || !config.servers[serverId]) {
            log.error(`无法获取MCP服务 ${serverId} 的配置，无法检查工具授权状态`);
            return false;
        }

        const serverConfig = config.servers[serverId];
        if (!serverConfig.autoApprove || !Array.isArray(serverConfig.autoApprove)) {
            log.info(`服务 ${serverId} 没有自动授权列表，工具 ${toolName} 未授权`);
            return false;
        }

        const isAuthorized = serverConfig.autoApprove.includes(toolName);
        log.info(`检查工具 ${toolName} 的授权状态: ${isAuthorized ? '已授权' : '未授权'}`);
        return isAuthorized;
    }

    async updateToolAuthorizationStatus(toolName, serverId, isAuthorized) {
        try {
            const config = mcpConfigManager.getConfig();
            if (!config || !config.servers || !config.servers[serverId]) {
                log.error(`无法获取服务 ${serverId} 的配置，无法更新工具授权状态`);
                return false;
            }

            const serverConfig = config.servers[serverId];
            if (!serverConfig.autoApprove || !Array.isArray(serverConfig.autoApprove)) {
                serverConfig.autoApprove = [];
            }

            // 如果已授权且不在列表中，添加到列表
            if (isAuthorized && !serverConfig.autoApprove.includes(toolName)) {
                serverConfig.autoApprove.push(toolName);
                log.info(`已将工具 ${toolName} 添加到自动授权列表`);
            }

            // 保存配置
            return mcpConfigManager.saveConfig();
        } catch (error) {
            log.error(`更新工具 ${toolName} 授权状态时出错:`, error.message);
            return false;
        }
    }


    /**
     * 
     * @param {string} message 错误消息
     * @param {string} serverId 服务ID
     * @returns 
     */
    createToolResultError(message, serverId) {
        let serverName = '';

        // 尝试从客户端信息中获取服务名称
        if (serverId) {
            const clientInfo = this.mcpClients.get(serverId);
            if (clientInfo && clientInfo.serverName) {
                serverName = clientInfo.serverName;
            } else {
                // 尝试从配置中获取服务名称
                const mcpConfig = mcpConfigManager.getConfig();
                if (mcpConfig.servers && mcpConfig.servers[serverId]) {
                    serverName = mcpConfig.servers[serverId].name || serverId;
                }
            }
        }

        return {
            content: [{
                type: 'text',
                text: message,
            }],
            serverId, // 添加服务ID到错误结果中
            serverName // 添加服务名称到错误结果中
        };
    }

    // 执行工具，根据工具的serverId属性确定使用哪个MCP服务
    async executeTool(sessionId, toolInfo) {
        const { name, arguments: args, serverId, serverName } = toolInfo;

        // 如果没有指定服务ID，查找第一个拥有此工具的客户端
        let targetServerId = serverId;
        if (!targetServerId) {
            for (const [srvId, client] of this.mcpClients.entries()) {
                if (client.isConnected && client.tools &&
                    client.tools.some(t => t.function.name === name)) {
                    targetServerId = srvId;
                    break;
                }
            }
        }

        if (!targetServerId) {
            return this.createToolResultError(`找不到提供工具 ${name} 的MCP服务`, targetServerId);
        }

        // 获取对应的MCP客户端
        const clientInfo = this.mcpClients.get(targetServerId);
        if (!clientInfo || !clientInfo.isConnected) {
            return this.createToolResultError(`MCP服务 ${targetServerId} 未连接，无法执行工具 ${name}`, targetServerId);
        }

        log.info(`使用MCP服务 ${targetServerId} 执行工具: ${name}, 参数:`, JSON.stringify(args, null, 2));

        const timeout = 30000;

        try {
            const task = clientInfo.client.callTool({
                name,
                arguments: args
            });

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('执行超时 (30秒)')), timeout);
            });

            const result = await Promise.race([task, timeoutPromise]);
            log.info(`工具执行结果:`, JSON.stringify(result, null, 2));

            // 获取服务名称
            const serverName = clientInfo.serverName;

            // 在结果中添加serverId和serverName
            if (typeof result === 'object') {
                result.serverId = targetServerId;
                result.serverName = serverName;
            } else {
                // 如果结果不是对象，创建一个包装对象
                return {
                    content: result,
                    serverId: targetServerId,
                    serverName: serverName
                };
            }

            return result;
        } catch (error) {
            log.error(`工具执行失败: ${error.message}`);
            return this.createToolResultError(`工具执行失败: ${error.message}`, targetServerId);
        }
    }
}

const mcpClientManager = new MCPClientManager();
module.exports = mcpClientManager;