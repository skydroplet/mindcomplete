/**
 * Agent配置管理器
 * 负责管理Agent配置的存储、加载和更新
 * Agent配置包括：名称、模型、提示词、MCP服务列表
 */

const BaseConfigManager = require('./baseConfigManager');
const Logger = require('../logger');
const log = new Logger('AgentConfig');

class AgentConfig extends BaseConfigManager {
    /**
     * 创建Agent配置管理器实例
     */
    constructor() {
        // 默认配置
        const defaultConfig = {
            agents: {},
            currentAgent: null
        };

        super('agents.json', defaultConfig);
        log.info('Agent配置管理器初始化完成');
    }

    /**
     * 获取所有Agent配置
     * @returns {Object} Agent配置对象
     */
    getAgents() {
        if (!this.config.agents) {
            this.config.agents = {};
        }
        return this.config.agents;
    }

    /**
     * 获取指定Agent配置
     * @param {string} agentId - Agent ID
     * @returns {Object|null} Agent配置对象，如果不存在则返回null
     */
    getAgent(agentId) {
        if (!this.config.agents) {
            return null;
        }
        return this.config.agents[agentId] || null;
    }

    /**
     * 添加新的Agent配置
     * @param {Object} agent - Agent配置对象
     * @param {string} agent.name - Agent名称
     * @param {string} agent.modelId - 关联的模型ID
     * @param {string} agent.promptId - 关联的提示词ID
     * @param {Array} agent.mcpServers - MCP服务ID列表
     * @returns {string} 新创建的Agent ID
     */
    addAgent(agent) {
        if (!this.config.agents) {
            this.config.agents = {};
        }

        // 验证必需字段
        if (!agent.name) {
            throw new Error('Agent名称不能为空');
        }

        // 生成唯一ID
        const agentId = this.generateUniqueId('agent', this.config.agents);

        // 创建Agent配置
        const newAgent = {
            id: agentId,
            name: agent.name,
            modelId: agent.modelId || null,
            promptId: agent.promptId || null,
            mcpServers: agent.mcpServers || [],
            createdAt: new Date().toLocaleString(),
            updatedAt: new Date().toLocaleString()
        };

        this.config.agents[agentId] = newAgent;

        // 如果是第一个Agent，设置为当前Agent
        if (Object.keys(this.config.agents).length === 1) {
            this.config.currentAgent = agentId;
        }

        if (this.saveConfig()) {
            log.info('添加Agent配置成功:', agentId, newAgent);
            return agentId;
        } else {
            throw new Error('保存Agent配置失败');
        }
    }

    /**
     * 更新Agent配置
     * @param {string} agentId - Agent ID
     * @param {Object} agent - 更新的Agent配置对象
     * @returns {boolean} 更新是否成功
     */
    updateAgent(agentId, agent) {
        if (!this.config.agents || !this.config.agents[agentId]) {
            log.error('要更新的Agent不存在:', agentId);
            return false;
        }

        // 验证必需字段
        if (!agent.name) {
            throw new Error('Agent名称不能为空');
        }

        // 更新Agent配置
        const existingAgent = this.config.agents[agentId];
        this.config.agents[agentId] = {
            ...existingAgent,
            name: agent.name,
            modelId: agent.modelId || null,
            promptId: agent.promptId || null,
            mcpServers: agent.mcpServers || [],
            updatedAt: new Date().toLocaleString()
        };

        if (this.saveConfig()) {
            log.info('更新Agent配置成功:', agentId, this.config.agents[agentId]);
            return true;
        } else {
            log.error('保存Agent配置失败');
            return false;
        }
    }

    /**
     * 删除Agent配置
     * @param {string} agentId - 要删除的Agent ID
     * @returns {boolean} 删除是否成功
     */
    deleteAgent(agentId) {
        if (!this.config.agents || !this.config.agents[agentId]) {
            log.error('要删除的Agent不存在:', agentId);
            return false;
        }

        // 如果删除的是当前Agent，需要重新选择当前Agent
        if (this.config.currentAgent === agentId) {
            const remainingAgents = Object.keys(this.config.agents).filter(id => id !== agentId);
            this.config.currentAgent = remainingAgents.length > 0 ? remainingAgents[0] : null;
        }

        delete this.config.agents[agentId];

        if (this.saveConfig()) {
            log.info('删除Agent配置成功:', agentId);
            return true;
        } else {
            log.error('保存Agent配置失败');
            return false;
        }
    }

    /**
     * 复制Agent配置
     * @param {string} agentId - 要复制的Agent ID
     * @returns {string|null} 新创建的Agent ID，失败时返回null
     */
    copyAgent(agentId) {
        const sourceAgent = this.getAgent(agentId);
        if (!sourceAgent) {
            log.error('要复制的Agent不存在:', agentId);
            return null;
        }

        try {
            const newAgent = {
                name: sourceAgent.name + ' (副本)',
                modelId: sourceAgent.modelId,
                promptId: sourceAgent.promptId,
                mcpServers: [...(sourceAgent.mcpServers || [])]
            };

            const newAgentId = this.addAgent(newAgent);
            log.info('复制Agent配置成功:', agentId, '->', newAgentId);
            return newAgentId;
        } catch (error) {
            log.error('复制Agent配置失败:', error.message);
            return null;
        }
    }
}

// 创建单例实例
const agentConfig = new AgentConfig();

module.exports = agentConfig; 