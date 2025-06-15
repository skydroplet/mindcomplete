/**
 * Agent选择服务
 * 负责处理标签页中Agent选择框的逻辑
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
     * 通用方法：获取所有Agent
     * @returns {Promise<Object>} Agent列表
     */
    async getAgents() {
        try {
            const agents = await ipcRenderer.invoke('get-agents');
            log.info('Agent列表:', agents);
            this.agents = agents || {};
            return this.agents;
        } catch (error) {
            log.error('获取Agent列表失败:', error.message);
            return {};
        }
    }

    /**
     * 通用方法：填充Agent下拉选择器
     * @param {HTMLSelectElement} select 下拉元素
     * @param {string} [currentAgentId] 当前选中的Agent ID
     * @param {boolean} [includeAddOption=true] 是否包含"添加Agent"选项
     * @returns {Promise<void>}
     */
    async populateAgentSelect(select, currentAgentId = null) {
        if (!select) {
            log.warn('Agent选择框元素不存在');
            return;
        }

        // 获取最新的Agent列表
        const agents = await this.getAgents();

        select.innerHTML = `
                    <option value="free-mode">自由组合</option>
                    <option value="add_new">+ 添加Agent</option>
                `;

        // 添加所有Agent
        if (Object.keys(agents).length > 0) {
            Object.entries(agents).forEach(([agentId, agent]) => {
                const option = document.createElement('option');
                option.value = agentId;
                option.textContent = agent.name;
                select.appendChild(option);
            });
        }

        // 设置当前选中的值
        if (currentAgentId) {
            select.value = currentAgentId;
        } else {
            select.value = 'free-mode';
        }

        log.info(`Agent选择框填充完成，当前选中: ${select.value}`);
    }

    /**
     * 通用方法：初始化和更新标签页Agent下拉选择器
     * @param {HTMLSelectElement} select 下拉元素
     * @param {string} tabId 标签ID
     * @param {Object} session 会话实例
     * @returns {Promise<void>}
     */
    async setTabAgentDropdown(select, tabId, session) {
        // 获取当前会话选择的Agent
        const sessionConfig = await session.getConfig();
        const currentAgentId = sessionConfig.agentId || 'free-mode';

        // 填充选择框
        await this.populateAgentSelect(select, currentAgentId, true);

        log.info(`标签 ${tabId} 的Agent下拉菜单更新完成，当前Agent：${currentAgentId}`);
    }

    /**
     * 通用方法：处理Agent选择事件
     * @param {string} agentId 选中的Agent ID
     * @param {Object} options 选项
     * @param {Function} [options.openSettingsWindowWithTab] 打开设置窗口的函数
     * @param {string} [options.tabId] 标签ID（用于标签页模式）
     * @param {Object} [options.session] 会话实例（用于标签页模式）
     * @param {Function} [options.updateOtherSelects] 更新其他选择框的回调函数
     * @returns {Promise<void>}
     */
    async handleAgentSelection(agentId, options = {}) {
        const { openSettingsWindowWithTab, tabId, session, updateOtherSelects } = options;

        if (agentId === "add_new") {
            openSettingsWindowWithTab('agents');
            return;
        }

        if (agentId === 'free-mode') {
            log.info(`标签 ${tabId} 选择自由组合模式`);
            await ipcRenderer.invoke('select-session-agent', session.data.id, null);
            return;
        }

        if (agentId) {
            // 选择特定Agent
            const agents = await this.getAgents();
            const agent = agents[agentId];

            // 标签页模式
            log.info(`标签 ${tabId} 选择Agent: ${agentId}`);
            await ipcRenderer.invoke('select-session-agent', session.data.id, agentId);

            // 如果Agent有配置，更新其他选择框
            if (agent && updateOtherSelects) {
                await updateOtherSelects(agent, tabId, session);
            }
        }
    }

    /**
     * 设置标签页Agent选择监听器
     * @param {string} tabId 标签ID
     * @param {Object} session 会话实例
     * @param {Function} updateOtherSelects 更新其他选择框的回调函数
     */
    setupTabAgentSelectListeners(tabId, session, updateOtherSelects) {
        const agentSelect = document.getElementById(`agent-select-${tabId}`);
        if (!agentSelect) return;

        // 添加选择事件监听器
        agentSelect.addEventListener('change', async (e) => {
            const agentId = e.target.value;

            // 如果是添加新Agent，重置选择框
            if (agentId === "add_new") {
                const sessionConfig = await session.getConfig();
                agentSelect.value = sessionConfig.agentId || 'free-mode';
            }

            await this.handleAgentSelection(agentId, {
                openSettingsWindowWithTab: window.openSettingsWindowWithTab,
                tabId,
                session,
                updateOtherSelects
            });
        });

        // 添加点击事件监听器，在下拉框打开时刷新Agent列表
        agentSelect.addEventListener('mousedown', async (event) => {
            await this.setTabAgentDropdown(agentSelect, tabId, session);
        });

        log.info(`标签 ${tabId} 的Agent选择监听器设置完成`);
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

    /**
     * 获取当前选中的Agent ID
     * @returns {string|null}
     */
    getCurrentAgentId() {
        return this.currentAgentId;
    }

    /**
     * 获取Agent配置
     * @param {string} agentId Agent ID
     * @returns {Object|null} Agent配置对象
     */
    getAgentConfig(agentId) {
        return this.agents[agentId] || null;
    }
}

// 创建并导出Agent选择服务实例
const agentSelectService = new AgentSelectService();
module.exports = agentSelectService; 