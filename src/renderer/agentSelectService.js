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

class AgentSelectService {
    constructor() {
    }

    /**
     * 通用方法：初始化和更新标签页Agent下拉选择器
     * @param {string} tabId 标签ID
     * @param {string} [tabAgentId=null] 标签选择的Agent
     * @returns {Promise<void>}
     */
    async setTabAgentDropdown(tabId, tabAgentId = null) {
        const agentSelect = document.getElementById(`agent-select-${tabId}`);
        agentSelect.innerHTML = `
                    <option value="free-mode">自由组合</option>
                    <option value="add_new">+ 添加Agent</option>
                `;

        // 获取最新的Agent列表
        const agents = await ipcRenderer.invoke('get-agents');

        // 添加所有Agent
        if (Object.keys(agents).length > 0) {
            Object.entries(agents).forEach(([agentId, agent]) => {
                const option = document.createElement('option');
                option.value = agentId;
                option.textContent = agent.name;
                agentSelect.appendChild(option);
            });
        }

        // 设置当前选中的值
        if (tabAgentId) {
            agentSelect.value = tabAgentId;
        } else {
            agentSelect.value = 'free-mode';
        }

        log.info(`标签 ${tabId} 的Agent下拉菜单更新完成，当前Agent：${tabAgentId}`);
    }
}

// 创建并导出Agent选择服务实例
const agentSelectService = new AgentSelectService();
module.exports = agentSelectService; 