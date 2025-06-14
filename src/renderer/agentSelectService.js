/**
 * Agent选择服务
 * 负责处理主界面中Agent选择框的逻辑
 */

let ipcRenderer;
if (typeof window.ipcRenderer === 'undefined') {
    const electron = require('electron');
    ipcRenderer = electron.ipcRenderer;
    window.ipcRenderer = ipcRenderer;
} else {
    ipcRenderer = window.ipcRenderer;
}

const Logger = require('../main/logger');
const log = new Logger('agentSelectService');
const i18n = require('../locales/i18n');

class AgentSelectService {
    constructor() {
        this.agentSelect = document.getElementById('agent-select');
        this.agents = {};
        this.currentAgentId = null;
    }

    /**
     * 获取Agent选择框元素
     * @returns {HTMLSelectElement}
     */
    getAgentSelect() {
        return this.agentSelect;
    }

    /**
     * 加载Agent列表
     * @returns {Promise<void>}
     */
    async loadAgents() {
        try {
            if (!this.agentSelect) {
                this.agentSelect = document.getElementById('agent-select');
            }

            // 从主进程获取Agent列表
            const agents = await ipcRenderer.invoke('get-agents');
            log.info('Agent列表:', agents);

            this.agents = agents || {};

            // 清空并重新填充Agent选择下拉框
            this.agentSelect.innerHTML = `
                <option value="free-mode">自由组合</option>
                <option value="add_new">添加Agent</option>
            `;

            // 添加分隔线
            if (Object.keys(this.agents).length > 0) {
                const separatorOption = document.createElement('option');
                separatorOption.disabled = true;
                separatorOption.textContent = '───────────';
                separatorOption.style.color = '#ccc';
                this.agentSelect.appendChild(separatorOption);

                // 添加所有Agent
                Object.entries(this.agents).forEach(([agentId, agent]) => {
                    const option = document.createElement('option');
                    option.value = agentId;
                    option.textContent = agent.name;
                    this.agentSelect.appendChild(option);
                });
            }

            // 获取当前选择的Agent
            const currentAgent = await ipcRenderer.invoke('get-current-agent');
            if (currentAgent) {
                this.currentAgentId = currentAgent.id;
                this.agentSelect.value = currentAgent.id;
            } else {
                this.currentAgentId = null;
                this.agentSelect.value = 'free-mode';
            }

            log.info('当前选择的Agent:', this.currentAgentId);
        } catch (error) {
            log.error('加载Agent列表失败:', error.message);
        }
    }

    /**
     * 设置Agent选择监听器
     * @param {Function} openSettingsWindowWithTab - 打开设置窗口的函数
     */
    setupAgentSelectListeners(openSettingsWindowWithTab) {
        if (!this.agentSelect) return;

        // 添加选择事件监听器
        this.agentSelect.addEventListener('change', async (e) => {
            await this.handleAgentSelect(e, openSettingsWindowWithTab);
        });

        // 添加点击事件监听器，在下拉框打开时刷新Agent列表
        this.agentSelect.addEventListener('mousedown', async (event) => {
            await this.loadAgents();
        });

        log.info('Agent选择监听器设置完成');
    }

    /**
     * 处理Agent选择事件
     * @param {Event} e - 事件对象
     * @param {Function} openSettingsWindowWithTab - 打开设置窗口的函数
     */
    async handleAgentSelect(e, openSettingsWindowWithTab) {
        const agentId = e.target.value;

        if (agentId === "add_new") {
            // 重置选择框
            this.agentSelect.value = this.currentAgentId || 'free-mode';
            // 打开配置窗口的Agent标签页
            openSettingsWindowWithTab('agents');
        } else if (agentId === 'free-mode') {
            // 自由组合模式
            this.currentAgentId = null;
            await ipcRenderer.invoke('select-agent', null);
            log.info('选择自由组合模式');
        } else if (agentId) {
            // 选择特定Agent
            this.currentAgentId = agentId;
            await ipcRenderer.invoke('select-agent', agentId);

            // 获取Agent配置并更新其他选择框
            const agent = this.agents[agentId];
            if (agent) {
                // 更新模型选择
                if (agent.model && window.modelService) {
                    await window.modelService.loadModels();
                    const modelSelect = window.modelService.getModelSelect();
                    if (modelSelect) {
                        modelSelect.value = agent.model;
                        await ipcRenderer.invoke('select-model', agent.model);
                    }
                }

                // 更新提示词选择
                if (agent.prompt && window.promptService) {
                    await window.promptService.loadPrompts();
                    const promptSelect = window.promptService.getPromptSelect();
                    if (promptSelect) {
                        promptSelect.value = agent.prompt;
                        await ipcRenderer.invoke('set-current-prompt', agent.prompt);
                    }
                }

                // 更新MCP服务选择
                if (agent.mcpServers && agent.mcpServers.length > 0 && window.mcpServer) {
                    await window.mcpServer.loadMcpServers();
                    window.mcpServer.setActiveMcpServers(agent.mcpServers);
                }
            }

            log.info('选择Agent:', agentId);
        }
    }

    /**
     * 设置Agent选择
     * @param {string} agentId - Agent ID
     */
    setAgentSelection(agentId) {
        this.currentAgentId = agentId;
        if (this.agentSelect) {
            this.agentSelect.value = agentId || 'free-mode';
        }
    }
}

// 创建并导出Agent选择服务实例
const agentSelectService = new AgentSelectService();
module.exports = agentSelectService; 