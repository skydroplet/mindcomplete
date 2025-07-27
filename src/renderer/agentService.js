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
                this.clearAgentForm();
                this.showAgentForm();
                this.currentAgentId = null;
            });
        }

        // 删除Agent按钮
        const deleteAgentBtn = document.getElementById('deleteAgentBtn');
        if (deleteAgentBtn) {
            deleteAgentBtn.addEventListener('click', async () => {
                if (this.currentAgentId) {
                    await this.deleteAgent(this.currentAgentId);
                    this.clearAgentForm();
                    this.showAgentForm();
                    this.currentAgentId = null;
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
            agentModelSelect.value = agent.modelId || '';
        }

        // 设置提示词列表
        this.fillPromptsList(agent.promptId || []);

        // 设置MCP服务列表
        this.fillMcpServicesList(agent.mcpServers || []);
    }

    /**
     * 填充提示词列表
     * @param {Array} promptIds - 提示词ID列表
     */
    fillPromptsList(promptIds) {
        const promptsContainer = document.getElementById('promptsContainer');
        if (!promptsContainer) {
            return;
        }

        promptsContainer.innerHTML = '';

        promptIds.forEach((promptId, index) => {
            this.addPromptRow(promptId);
        });

        this.checkAndAddEmptyPromptRow();
    }

    /**
     * 添加提示词选择行
     * @param {string} selectedPromptId - 选中的提示词ID
     */
    addPromptRow(selectedPromptId = '') {
        const promptsContainer = document.getElementById('promptsContainer');
        if (!promptsContainer) {
            return;
        }

        const row = document.createElement('div');
        row.className = 'prompt-row';

        const select = document.createElement('select');
        select.className = 'prompt-select';
        select.innerHTML = '<option value="">请选择系统提示词</option>';

        // 填充提示词选项
        Object.entries(this.prompts).forEach(([promptId, prompt]) => {
            const option = document.createElement('option');
            option.value = promptId;
            option.textContent = prompt.name;
            if (promptId === selectedPromptId) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        // 为选择框添加change事件监听器
        select.addEventListener('change', () => {
            this.checkAndAddEmptyPromptRow();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-prompt-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => {
            row.remove();
            this.checkAndAddEmptyPromptRow();
        });

        row.appendChild(select);
        row.appendChild(deleteBtn);
        promptsContainer.appendChild(row);
    }

    /**
     * 检查是否需要自动添加空的提示词行
     */
    checkAndAddEmptyPromptRow() {
        const promptSelects = document.querySelectorAll('.prompt-select');
        let hasEmptyRow = false;

        // 检查是否存在空的选择框
        promptSelects.forEach(select => {
            if (!select.value) {
                hasEmptyRow = true;
            }
        });

        // 如果所有选择框都有值，自动添加一个空行
        if (!hasEmptyRow && promptSelects.length > 0) {
            this.addPromptRow();
        }
    }

    /**
     * 填充MCP服务列表
     * @param {Array} mcpServers - MCP服务ID列表
     */
    fillMcpServicesList(mcpServers) {
        const mcpServersContainer = document.getElementById('mcpServersContainer');
        if (!mcpServersContainer) {
            return;
        }

        mcpServersContainer.innerHTML = '';

        mcpServers.forEach((mcpId, index) => {
            this.addMcpServerRow(mcpId);
        });

        this.checkAndAddEmptyMcpRow();
    }

    /**
     * 添加MCP服务选择行
     * @param {string} selectedMcpId - 选中的MCP服务ID
     */
    addMcpServerRow(selectedMcpId = '') {
        const mcpServersContainer = document.getElementById('mcpServersContainer');
        if (!mcpServersContainer) {
            return;
        }

        const row = document.createElement('div');
        row.className = 'mcp-server-row';

        const select = document.createElement('select');
        select.className = 'mcp-server-select';
        select.innerHTML = '<option value="">请选择Agent可用的MCP服务</option>';

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

        // 为选择框添加change事件监听器
        select.addEventListener('change', () => {
            this.checkAndAddEmptyMcpRow();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-mcp-server-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => {
            row.remove();
            this.checkAndAddEmptyMcpRow();
        });

        row.appendChild(select);
        row.appendChild(deleteBtn);
        mcpServersContainer.appendChild(row);
    }

    /**
     * 检查是否需要自动添加空的MCP服务行
     */
    checkAndAddEmptyMcpRow() {
        const mcpSelects = document.querySelectorAll('.mcp-server-select');
        let hasEmptyRow = false;

        // 检查是否存在空的选择框
        mcpSelects.forEach(select => {
            if (!select.value) {
                hasEmptyRow = true;
            }
        });

        // 如果所有选择框都有值，自动添加一个空行
        if (!hasEmptyRow && mcpSelects.length > 0) {
            this.addMcpServerRow();
        }
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

        // 清空提示词列表
        const promptsContainer = document.getElementById('promptsContainer');
        if (promptsContainer) {
            promptsContainer.innerHTML = '';
            this.addPromptRow(); // 添加一个空行
        }

        // 清空MCP服务列表
        const mcpServersContainer = document.getElementById('mcpServersContainer');
        if (mcpServersContainer) {
            mcpServersContainer.innerHTML = '';
            this.addMcpServerRow(); // 添加一个空行
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
            const agentNameInput = document.getElementById('agentName');
            const agentModelSelect = document.getElementById('agentModel');

            const agentName = agentNameInput?.value?.trim();
            const agentModel = agentModelSelect?.value;

            // 获取选中的多个prompt
            const selectedPrompts = [];
            document.querySelectorAll('.prompt-select').forEach(select => {
                if (select.value) {
                    selectedPrompts.push(select.value);
                }
            });

            // 验证必填字段
            if (!agentName) {
                log.warn('Agent名称不能为空');
                if (agentNameInput) {
                    agentNameInput.focus();
                    agentNameInput.select();
                }
                return;
            }

            if (!agentModel) {
                log.warn('必须选择一个模型');
                if (agentModelSelect) {
                    agentModelSelect.focus();
                }
                return;
            }

            // 获取MCP服务列表
            const mcpServers = [];
            document.querySelectorAll('.mcp-server-select').forEach(select => {
                if (select.value) {
                    mcpServers.push(select.value);
                }
            });

            const agentData = {
                name: agentName,
                modelId: agentModel || null,
                promptId: selectedPrompts, // 传递prompt数组
                mcpServers: mcpServers
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

                // 如果是新添加的Agent或更新现有Agent，选中它
                if (this.currentAgentId) {
                    this.selectAgent(this.currentAgentId);
                }
            } else {
                log.error('保存Agent配置失败');
            }
        } catch (error) {
            log.error('保存Agent配置出错:', error.message);
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

        agentModelSelect.innerHTML = '<option value="">请选择使用的模型</option>';
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

        // 更新所有提示词选择框
        document.querySelectorAll('.prompt-select').forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">请选择系统提示词</option>';

            Object.entries(this.prompts).forEach(([promptId, prompt]) => {
                const option = document.createElement('option');
                option.value = promptId;
                option.textContent = prompt.name;
                if (promptId === currentValue) {
                    option.selected = true;
                }
                select.appendChild(option);
            });

            // 重新绑定change事件监听器
            select.removeEventListener('change', this.handlePromptSelectChange);
            select.addEventListener('change', () => {
                this.checkAndAddEmptyPromptRow();
            });
        });
    }

    /**
     * 更新MCP服务选择列表
     * @param {Object} mcpServers - MCP服务配置对象
     */
    updateMcpOptions(mcpServers) {
        this.mcpServers = mcpServers || {};

        // 更新所有MCP服务选择框
        document.querySelectorAll('.mcp-server-select').forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">请选择Agent可用的MCP服务</option>';

            Object.entries(this.mcpServers).forEach(([mcpId, mcpServer]) => {
                const option = document.createElement('option');
                option.value = mcpId;
                option.textContent = mcpServer.name;
                if (mcpId === currentValue) {
                    option.selected = true;
                }
                select.appendChild(option);
            });

            // 重新绑定change事件监听器
            select.removeEventListener('change', this.handleMcpSelectChange);
            select.addEventListener('change', () => {
                this.checkAndAddEmptyMcpRow();
            });
        });
    }
}

const agentService = new AgentService();
module.exports = agentService; 