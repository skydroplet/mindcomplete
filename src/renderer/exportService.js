/**
 * exportService.js
 * 导出配置服务模块
 * 
 * 该模块负责处理配置导出相关的功能，包括：
 * - 显示导出配置对话框
 * - 收集用户选择的导出项
 * - 调用主进程导出配置
 */

const Logger = require('../main/logger');
const log = new Logger('export-service');
const i18n = require('../locales/i18n');

// 确保ipcRenderer可用
let ipcRenderer;
if (typeof window.ipcRenderer === 'undefined') {
    const electron = require('electron');
    ipcRenderer = electron.ipcRenderer;
    window.ipcRenderer = ipcRenderer;
} else {
    ipcRenderer = window.ipcRenderer;
}

/**
 * 导出服务类
 * 封装所有与配置导出相关的逻辑和UI交互
 */
class ExportService {
    constructor() {
        // 存储所有可导出的配置项
        this.exportableItems = {
            models: {},
            prompts: {},
            mcpServers: {}
        };

        // 存储用户选择的配置项
        this.selectedItems = {
            models: [],
            prompts: [],
            mcpServers: []
        };
    }

    /**
     * 初始化导出配置功能
     */
    initExportConfig() {
        const exportBtn = document.getElementById('export-config-btn');
        const exportDialog = document.getElementById('export-config-dialog');
        const closeBtn = document.getElementById('close-export-dialog');
        const cancelBtn = document.getElementById('cancel-export-btn');
        const confirmBtn = document.getElementById('confirm-export-btn');

        // 显示导出对话框
        exportBtn.addEventListener('click', async () => {
            await this.loadExportableItems();
            exportDialog.classList.add('active');
        });

        // 关闭导出对话框
        const closeExportDialog = () => {
            exportDialog.classList.remove('active');
        };

        closeBtn.addEventListener('click', closeExportDialog);
        cancelBtn.addEventListener('click', closeExportDialog);

        // 配置类别选择事件
        this.setupCategoryCheckboxes();

        // 配置列表折叠/展开事件
        this.setupToggleButtons();

        // 确认导出
        confirmBtn.addEventListener('click', async () => {
            // 获取选中的导出选项
            const exportModels = document.getElementById('export-models').checked;
            const exportPrompts = document.getElementById('export-prompts').checked;
            const exportMcp = document.getElementById('export-mcp').checked;

            // 收集选中的具体项目
            this.collectSelectedItems();

            // 如果没有选择任何选项，提示用户
            if (!exportModels && !exportPrompts && !exportMcp) {
                alert(i18n.t('export.noOptionSelected', '请至少选择一项配置进行导出'));
                return;
            }

            try {
                // 调用导出配置函数
                await this.exportConfig(exportModels, exportPrompts, exportMcp);
                closeExportDialog();
            } catch (error) {
                log.error('导出配置失败:', error.message);
                alert(i18n.t('export.error', `导出配置失败: ${error.message}`));
            }
        });
    }

    /**
     * 设置类别复选框事件
     */
    setupCategoryCheckboxes() {
        // 模型类别复选框
        document.getElementById('export-models').addEventListener('change', (e) => {
            const checked = e.target.checked;
            const modelsList = document.getElementById('models-list');
            const modelCheckboxes = modelsList.querySelectorAll('input[type="checkbox"]');
            modelCheckboxes.forEach(checkbox => {
                checkbox.checked = checked;
            });
        });

        // 提示词类别复选框
        document.getElementById('export-prompts').addEventListener('change', (e) => {
            const checked = e.target.checked;
            const promptsList = document.getElementById('prompts-list');
            const promptCheckboxes = promptsList.querySelectorAll('input[type="checkbox"]');
            promptCheckboxes.forEach(checkbox => {
                checkbox.checked = checked;
            });
        });

        // MCP类别复选框
        document.getElementById('export-mcp').addEventListener('change', (e) => {
            const checked = e.target.checked;
            const mcpList = document.getElementById('mcp-list');
            const mcpCheckboxes = mcpList.querySelectorAll('input[type="checkbox"]');
            mcpCheckboxes.forEach(checkbox => {
                checkbox.checked = checked;
            });
        });
    }

    /**
     * 设置列表折叠/展开按钮事件
     */
    setupToggleButtons() {
        document.querySelectorAll('.toggle-list-btn').forEach(btn => {
            // 设置初始状态为折叠
            const targetListId = btn.dataset.target;
            const list = document.getElementById(targetListId);

            // 默认设置为折叠状态
            list.style.display = 'none';
            btn.classList.add('collapsed');
            btn.textContent = '▶';

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetListId = btn.dataset.target;
                const list = document.getElementById(targetListId);

                if (list.style.display === 'none') {
                    list.style.display = 'block';
                    btn.classList.remove('collapsed');
                    btn.textContent = '▼';
                } else {
                    list.style.display = 'none';
                    btn.classList.add('collapsed');
                    btn.textContent = '▶';
                }
            });
        });
    }

    /**
     * 加载可导出的配置项
     */
    async loadExportableItems() {
        try {
            // 获取模型列表
            const models = await ipcRenderer.invoke('get-models');
            this.exportableItems.models = models || {};

            // 获取提示词列表
            const prompts = await ipcRenderer.invoke('get-all-prompts');
            this.exportableItems.prompts = prompts || {};

            // 获取MCP服务列表
            const mcpConfig = await ipcRenderer.invoke('get-mcp-config');
            this.exportableItems.mcpServers = mcpConfig.servers || {};

            // 渲染导出项目列表
            this.renderExportableItems();

            log.info('已加载可导出配置项:', {
                models: Object.keys(this.exportableItems.models).length,
                prompts: Object.keys(this.exportableItems.prompts).length,
                mcpServers: Object.keys(this.exportableItems.mcpServers).length
            });
        } catch (error) {
            log.error('加载可导出配置项失败:', error.message);
        }
    }

    /**
     * 渲染可导出的配置项
     */
    renderExportableItems() {
        // 渲染模型列表
        const modelsList = document.getElementById('models-list');
        modelsList.innerHTML = '';
        Object.entries(this.exportableItems.models).forEach(([modelId, model]) => {
            const item = this.createExportItem(modelId, model.name, 'model');
            modelsList.appendChild(item);
        });

        // 渲染提示词列表
        const promptsList = document.getElementById('prompts-list');
        promptsList.innerHTML = '';
        Object.entries(this.exportableItems.prompts).forEach(([promptId, prompt]) => {
            const item = this.createExportItem(promptId, prompt.name, 'prompt');
            promptsList.appendChild(item);
        });

        // 渲染MCP服务列表
        const mcpList = document.getElementById('mcp-list');
        mcpList.innerHTML = '';
        Object.entries(this.exportableItems.mcpServers).forEach(([serverId, server]) => {
            const item = this.createExportItem(serverId, server.name, 'mcp');
            mcpList.appendChild(item);
        });
    }

    /**
     * 创建导出项目元素
     * @param {string} id - 项目ID
     * @param {string} name - 项目名称
     * @param {string} type - 项目类型 (model/prompt/mcp)
     * @returns {HTMLElement} - 导出项目元素
     */
    createExportItem(id, name, type) {
        const item = document.createElement('div');
        item.className = 'export-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `${type}-${id}`;
        checkbox.dataset.id = id;
        checkbox.dataset.type = type;
        checkbox.checked = true;

        const label = document.createElement('label');
        label.className = 'export-item-name';
        label.htmlFor = checkbox.id;
        label.textContent = name;

        item.appendChild(checkbox);
        item.appendChild(label);

        return item;
    }

    /**
     * 收集用户选择的导出项
     */
    collectSelectedItems() {
        // 重置选择
        this.selectedItems = {
            models: [],
            prompts: [],
            mcpServers: []
        };

        // 收集选中的模型
        if (document.getElementById('export-models').checked) {
            const modelCheckboxes = document.getElementById('models-list')
                .querySelectorAll('input[type="checkbox"]:checked');
            modelCheckboxes.forEach(checkbox => {
                this.selectedItems.models.push(checkbox.dataset.id);
            });
        }

        // 收集选中的提示词
        if (document.getElementById('export-prompts').checked) {
            const promptCheckboxes = document.getElementById('prompts-list')
                .querySelectorAll('input[type="checkbox"]:checked');
            promptCheckboxes.forEach(checkbox => {
                this.selectedItems.prompts.push(checkbox.dataset.id);
            });
        }

        // 收集选中的MCP服务
        if (document.getElementById('export-mcp').checked) {
            const mcpCheckboxes = document.getElementById('mcp-list')
                .querySelectorAll('input[type="checkbox"]:checked');
            mcpCheckboxes.forEach(checkbox => {
                this.selectedItems.mcpServers.push(checkbox.dataset.id);
            });
        }

        log.info('已选择的导出项:', {
            models: this.selectedItems.models.length,
            prompts: this.selectedItems.prompts.length,
            mcpServers: this.selectedItems.mcpServers.length
        });
    }

    /**
     * 导出配置到文件
     * @param {boolean} includeModels - 是否包含模型配置
     * @param {boolean} includePrompts - 是否包含提示词
     * @param {boolean} includeMcp - 是否包含MCP配置
     * @returns {Promise<void>}
     */
    async exportConfig(includeModels, includePrompts, includeMcp) {
        try {
            log.info('导出配置，选项:', { includeModels, includePrompts, includeMcp });
            log.info('选择的项目:', this.selectedItems);

            // 准备导出数据
            const exportData = {};

            // 获取最新数据并根据用户选择过滤
            if (includeModels && this.selectedItems.models.length > 0) {
                const models = await ipcRenderer.invoke('get-models');
                // 只导出用户选择的模型
                exportData.models = {};
                this.selectedItems.models.forEach(modelId => {
                    if (models[modelId]) {
                        exportData.models[modelId] = models[modelId];
                    }
                });
            }

            if (includePrompts && this.selectedItems.prompts.length > 0) {
                const prompts = await ipcRenderer.invoke('get-all-prompts');
                // 只导出用户选择的提示词
                exportData.prompts = {};
                this.selectedItems.prompts.forEach(promptId => {
                    if (prompts[promptId]) {
                        exportData.prompts[promptId] = prompts[promptId];
                    }
                });
            }

            if (includeMcp && this.selectedItems.mcpServers.length > 0) {
                const mcpConfig = await ipcRenderer.invoke('get-mcp-config');
                // 只导出用户选择的MCP服务
                exportData.mcpServers = {};
                this.selectedItems.mcpServers.forEach(serverId => {
                    if (mcpConfig.servers[serverId]) {
                        exportData.mcpServers[serverId] = mcpConfig.servers[serverId];
                    }
                });
            }

            // 创建导出文件名（使用当前日期时间）
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
            const timeStr = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
            const fileName = `mindcomplete-config-${dateStr}-${timeStr}.json`;

            // 调用主进程的保存文件对话框
            const success = await ipcRenderer.invoke('export-config', exportData, fileName);

            if (success) {
                alert(i18n.t('export.success', '配置导出成功！'));
            }
        } catch (error) {
            log.error('导出配置失败:', error.message);
            throw error;
        }
    }
}

// 创建并导出单例实例
const exportService = new ExportService();
module.exports = exportService; 