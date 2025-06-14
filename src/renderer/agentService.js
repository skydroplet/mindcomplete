/**
 * Agent配置服务
 * 负责处理Agent配置的前端逻辑，包括列表显示、表单管理和IPC通信
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
const log = new Logger('agentService');
const i18n = require('../locales/i18n');

class AgentService {
    constructor() {
        this.agents = {};
        this.currentAgentId = null;
        this.models = {};
        this.prompts = {};
        this.mcpServers = {};
    }

    /**
     * 初始化Agent配置事件监听器
     */
    async initAgentEventListeners() {
        log.info('初始化Agent配置事件监听器');

        // 添加Agent按钮
        const addAgentBtn = document.getElementById('addAgentBtn');
        if (addAgentBtn) {
            addAgentBtn.addEventListener('click', () => {
                this.clearAgentForm();
                this.showAgentForm();
            });
        }

        // 保存Agent按钮
        const saveAgentBtn = document.getElementById('saveAgentBtn');
        if (saveAgentBtn) {
            saveAgentBtn.addEventListener('click', async () => {
                await this.saveAgent();
            });
        }

        // 取消Agent按钮
        const cancelAgentBtn = document.getElementById('cancelAgentBtn');
        if (cancelAgentBtn) {
            cancelAgentBtn.addEventListener('click', () => {
                this.hideAgentForm();
            });
        }

        // 删除Agent按钮
        const deleteAgentBtn = document.getElementById('deleteAgentBtn');
        if (deleteAgentBtn) {
            deleteAgentBtn.addEventListener('click', async () => {
                if (this.currentAgentId) {
                    await this.deleteAgent(this.currentAgentId);
                }
            });
        }

        // 复制Agent按钮
        const copyAgentBtn = document.getElementById('copyAgentBtn');
        if (copyAgentBtn) {
            copyAgentBtn.addEventListener('click', async () => {
                if (this.currentAgentId) {
                    await this.copyAgent(this.currentAgentId);
                }
            });
        }

        // 添加MCP服务按钮
        const addMcpServiceBtn = document.getElementById('addMcpServiceBtn');
        if (addMcpServiceBtn) {
            addMcpServiceBtn.addEventListener('click', () => {
                this.addMcpServiceRow();
            });
        }
    }

    /**
     * 更新Agent列表
     * @param {Object} agents - Agent配置对象
     */
    updateAgentList(agents) {
        log.info('更新Agent列表:', agents);
        this.agents = agents || {};

        const agentList = document.getElementById('agentList');
        if (!agentList) {
            log.error('agentList元素不存在');
            return;
        }

        agentList.innerHTML = '';

        Object.entries(this.agents).forEach(([agentId, agent]) => {
            const agentItem = document.createElement('div');
            agentItem.className = 'config-item';
            agentItem.dataset.agentId = agentId;

            agentItem.innerHTML = `
                <div class="config-item-content">
                    <div class="config-item-name">${agent.name}</div>
                </div>
            `;

            agentItem.addEventListener('click', () => {
                this.selectAgent(agentId);
            });

            agentList.appendChild(agentItem);
        });

        this.updateDeleteButton();

        // 如果没有Agent或没有选中任何Agent，直接显示空的配置表单
        if (Object.keys(this.agents).length === 0 || !this.currentAgentId) {
            this.clearAgentForm();
            this.showAgentForm();
        }
    }

    /**
     * 获取模型名称
     * @param {string} modelId - 模型ID
     * @returns {string} 模型名称
     */
    getModelName(modelId) {
        if (!modelId || !this.models[modelId]) {
            return '';
        }
        return this.models[modelId].name;
    }

    /**
     * 获取提示词名称
     * @param {string} promptId - 提示词ID
     * @returns {string} 提示词名称
     */
    getPromptName(promptId) {
        if (!promptId || !this.prompts[promptId]) {
            return '';
        }
        return this.prompts[promptId].name;
    }

    /**
     * 获取MCP服务名称
     * @param {string} mcpId - MCP服务ID
     * @returns {string} MCP服务名称
     */
    getMcpServiceName(mcpId) {
        if (!mcpId || !this.mcpServers[mcpId]) {
            return '';
        }
        return this.mcpServers[mcpId].name;
    }

    /**
     * 选择Agent
     * @param {string} agentId - Agent ID
     */
    selectAgent(agentId) {
        log.info('选择Agent:', agentId);
        this.currentAgentId = agentId;

        // 更新列表选中状态
        document.querySelectorAll('.config-item').forEach(item => {
            item.classList.remove('active');
        });

        const selectedItem = document.querySelector(`[data-agent-id="${agentId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active');
        }

        // 填充表单
        const agent = this.agents[agentId];
        if (agent) {
            this.fillAgentForm(agent);
            this.showAgentForm();
        }

        this.updateDeleteButton();
    }

    /**
     * 填充Agent表单
     * @param {Object} agent - Agent配置对象
     */
    fillAgentForm(agent) {
        log.info('填充Agent表单:', agent);

        // 设置基本信息
        const agentNameInput = document.getElementById('agentName');
        if (agentNameInput) {
            agentNameInput.value = agent.name || '';
        }

        // 设置模型选择
        const agentModelSelect = document.getElementById('agentModel');
        if (agentModelSelect) {
            agentModelSelect.value = agent.model || '';
        }

        // 设置提示词选择
        const agentPromptSelect = document.getElementById('agentPrompt');
        if (agentPromptSelect) {
            agentPromptSelect.value = agent.prompt || '';
        }

        // 设置MCP服务列表
        this.fillMcpServicesList(agent.mcpServices || []);
    }

    /**
     * 填充MCP服务列表
     * @param {Array} mcpServices - MCP服务ID列表
     */
    fillMcpServicesList(mcpServices) {
        const mcpServicesContainer = document.getElementById('mcpServicesContainer');
        if (!mcpServicesContainer) {
            return;
        }

        mcpServicesContainer.innerHTML = '';

        mcpServices.forEach((mcpId, index) => {
            this.addMcpServiceRow(mcpId);
        });

        // 如果没有MCP服务，添加一个空行
        if (mcpServices.length === 0) {
            this.addMcpServiceRow();
        }
    }

    /**
     * 添加MCP服务选择行
     * @param {string} selectedMcpId - 选中的MCP服务ID
     */
    addMcpServiceRow(selectedMcpId = '') {
        const mcpServicesContainer = document.getElementById('mcpServicesContainer');
        if (!mcpServicesContainer) {
            return;
        }

        const row = document.createElement('div');
        row.className = 'mcp-service-row';

        const select = document.createElement('select');
        select.className = 'mcp-service-select';
        select.innerHTML = '<option value="">请选择MCP服务</option>';

        // 填充MCP服务选项
        Object.entries(this.mcpServers).forEach(([mcpId, mcpServer]) => {
            const option = document.createElement('option');
            option.value = mcpId;
            option.textContent = mcpServer.name;
            if (mcpId === selectedMcpId) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-mcp-service-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => {
            row.remove();
        });

        row.appendChild(select);
        row.appendChild(deleteBtn);
        mcpServicesContainer.appendChild(row);
    }

    /**
     * 清空Agent表单
     */
    clearAgentForm() {
        log.info('清空Agent表单');
        this.currentAgentId = null;

        const agentNameInput = document.getElementById('agentName');
        if (agentNameInput) {
            agentNameInput.value = '';
        }

        const agentModelSelect = document.getElementById('agentModel');
        if (agentModelSelect) {
            agentModelSelect.value = '';
        }

        const agentPromptSelect = document.getElementById('agentPrompt');
        if (agentPromptSelect) {
            agentPromptSelect.value = '';
        }

        // 清空MCP服务列表
        const mcpServicesContainer = document.getElementById('mcpServicesContainer');
        if (mcpServicesContainer) {
            mcpServicesContainer.innerHTML = '';
            this.addMcpServiceRow(); // 添加一个空行
        }

        // 清除列表选中状态
        document.querySelectorAll('.config-item').forEach(item => {
            item.classList.remove('active');
        });

        this.updateDeleteButton();
    }

    /**
     * 显示Agent表单
     */
    showAgentForm() {
        const agentForm = document.querySelector('.agent-form');
        if (agentForm) {
            agentForm.style.display = 'flex';
        }
    }

    /**
     * 隐藏Agent表单
     */
    hideAgentForm() {
        const agentForm = document.querySelector('.agent-form');
        if (agentForm) {
            agentForm.style.display = 'none';
        }
        this.clearAgentForm();
    }

    /**
     * 保存Agent配置
     */
    async saveAgent() {
        log.info('保存Agent配置');

        try {
            const agentName = document.getElementById('agentName')?.value;
            const agentModel = document.getElementById('agentModel')?.value;
            const agentPrompt = document.getElementById('agentPrompt')?.value;

            if (!agentName) {
                alert('请输入Agent名称');
                return;
            }

            // 获取MCP服务列表
            const mcpServices = [];
            document.querySelectorAll('.mcp-service-select').forEach(select => {
                if (select.value) {
                    mcpServices.push(select.value);
                }
            });

            const agentData = {
                name: agentName,
                model: agentModel || null,
                prompt: agentPrompt || null,
                mcpServices: mcpServices
            };

            let result;
            if (this.currentAgentId) {
                // 更新现有Agent
                result = await ipcRenderer.invoke('update-agent', {
                    agentId: this.currentAgentId,
                    agent: agentData
                });
            } else {
                // 添加新Agent
                result = await ipcRenderer.invoke('add-agent', agentData);
                this.currentAgentId = result;
            }

            if (result) {
                log.info('保存Agent配置成功');
                // 重新加载Agent列表
                const agents = await ipcRenderer.invoke('get-agents');
                this.updateAgentList(agents);

                // 如果是新添加的Agent，选中它
                if (this.currentAgentId) {
                    this.selectAgent(this.currentAgentId);
                }
            } else {
                alert('保存Agent配置失败');
            }
        } catch (error) {
            log.error('保存Agent配置出错:', error.message);
            alert(`保存Agent配置失败: ${error.message}`);
        }
    }

    /**
     * 删除Agent配置
     * @param {string} agentId - Agent ID
     */
    async deleteAgent(agentId) {
        log.info('删除Agent配置:', agentId);

        const agent = this.agents[agentId];
        if (!agent) {
            return;
        }

        if (confirm(`确定要删除Agent "${agent.name}" 吗？`)) {
            try {
                const result = await ipcRenderer.invoke('delete-agent', agentId);
                if (result) {
                    log.info('删除Agent配置成功');
                    // 重新加载Agent列表
                    const agents = await ipcRenderer.invoke('get-agents');
                    this.updateAgentList(agents);
                    this.hideAgentForm();
                } else {
                    alert('删除Agent配置失败');
                }
            } catch (error) {
                log.error('删除Agent配置出错:', error.message);
                alert(`删除Agent配置失败: ${error.message}`);
            }
        }
    }

    /**
     * 复制Agent配置
     * @param {string} agentId - Agent ID
     */
    async copyAgent(agentId) {
        log.info('复制Agent配置:', agentId);

        try {
            const result = await ipcRenderer.invoke('copy-agent', agentId);
            if (result) {
                log.info('复制Agent配置成功');
                // 重新加载Agent列表
                const agents = await ipcRenderer.invoke('get-agents');
                this.updateAgentList(agents);
                // 选中新复制的Agent
                this.selectAgent(result);
            } else {
                alert('复制Agent配置失败');
            }
        } catch (error) {
            log.error('复制Agent配置出错:', error.message);
            alert(`复制Agent配置失败: ${error.message}`);
        }
    }

    /**
     * 更新删除按钮状态
     */
    updateDeleteButton() {
        const deleteAgentBtn = document.getElementById('deleteAgentBtn');
        const copyAgentBtn = document.getElementById('copyAgentBtn');

        if (deleteAgentBtn) {
            if (this.currentAgentId) {
                deleteAgentBtn.classList.remove('hidden');
            } else {
                deleteAgentBtn.classList.add('hidden');
            }
        }

        if (copyAgentBtn) {
            if (this.currentAgentId) {
                copyAgentBtn.classList.remove('hidden');
            } else {
                copyAgentBtn.classList.add('hidden');
            }
        }
    }

    /**
     * 更新模型选择列表
     * @param {Object} models - 模型配置对象
     */
    updateModelOptions(models) {
        this.models = models || {};
        const agentModelSelect = document.getElementById('agentModel');
        if (!agentModelSelect) {
            return;
        }

        agentModelSelect.innerHTML = '<option value="">请选择模型</option>';
        Object.entries(this.models).forEach(([modelId, model]) => {
            const option = document.createElement('option');
            option.value = modelId;
            option.textContent = model.name;
            agentModelSelect.appendChild(option);
        });
    }

    /**
     * 更新提示词选择列表
     * @param {Object} prompts - 提示词配置对象
     */
    updatePromptOptions(prompts) {
        this.prompts = prompts || {};
        const agentPromptSelect = document.getElementById('agentPrompt');
        if (!agentPromptSelect) {
            return;
        }

        agentPromptSelect.innerHTML = '<option value="">请选择提示词</option>';
        Object.entries(this.prompts).forEach(([promptId, prompt]) => {
            const option = document.createElement('option');
            option.value = promptId;
            option.textContent = prompt.name;
            agentPromptSelect.appendChild(option);
        });
    }

    /**
     * 更新MCP服务选择列表
     * @param {Object} mcpServers - MCP服务配置对象
     */
    updateMcpOptions(mcpServers) {
        this.mcpServers = mcpServers || {};

        // 更新所有MCP服务选择框
        document.querySelectorAll('.mcp-service-select').forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">请选择MCP服务</option>';

            Object.entries(this.mcpServers).forEach(([mcpId, mcpServer]) => {
                const option = document.createElement('option');
                option.value = mcpId;
                option.textContent = mcpServer.name;
                if (mcpId === currentValue) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        });
    }

    /**
     * 显示空状态提示
     */
    showEmptyState() {
        const agentForm = document.querySelector('.agent-form');
        if (agentForm) {
            agentForm.style.display = 'flex';
            agentForm.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🤖</div>
                    <h3>暂无Agent配置</h3>
                    <p>Agent可以组合模型、提示词和MCP服务，为不同场景提供专门的AI助手。</p>
                    <button class="add-btn" id="addAgentFromEmpty">创建第一个Agent</button>
                </div>
            `;

            // 绑定事件
            const addBtn = document.getElementById('addAgentFromEmpty');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    this.clearAgentForm();
                    this.showAgentForm();
                });
            }
        }
    }

    /**
     * 显示添加提示界面
     */
    showAddPrompt() {
        const agentForm = document.querySelector('.agent-form');
        if (agentForm) {
            agentForm.style.display = 'flex';
            agentForm.innerHTML = `
                <div class="add-prompt-state">
                    <div class="add-prompt-icon">➕</div>
                    <h3>添加新的Agent</h3>
                    <p>选择左侧的Agent进行编辑，或点击下面的按钮创建新的Agent配置。</p>
                    <button class="add-btn" id="addNewAgentPrompt">添加Agent</button>
                </div>
            `;

            // 绑定事件
            const addBtn = document.getElementById('addNewAgentPrompt');
            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    this.clearAgentForm();
                    this.showAgentForm();
                });
            }
        }
    }
}

module.exports = AgentService; 