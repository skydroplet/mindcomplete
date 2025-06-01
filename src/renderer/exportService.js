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
            modelSecrets: [],
            prompts: [],
            mcpServers: [],
            mcpEnvVars: [],
            mcpArgs: []
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
            // 收集选中的具体项目
            this.collectSelectedItems();

            // 如果没有选择任何选项，提示用户
            if (this.selectedItems.models.length === 0 &&
                this.selectedItems.prompts.length === 0 &&
                this.selectedItems.mcpServers.length === 0) {
                alert(i18n.t('export.noOptionSelected', '请至少选择一项配置进行导出'));
                return;
            }

            try {
                await this.exportConfig();
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
     * 设置列表折叠/展开事件
     */
    setupToggleButtons() {
        // 定义所有类别及其列表ID的映射
        const categoryMapping = {
            'models-list': 'export-models',
            'prompts-list': 'export-prompts',
            'mcp-list': 'export-mcp'
        };

        // 遍历映射，为每个类别设置折叠/展开功能
        Object.entries(categoryMapping).forEach(([listId, checkboxId]) => {
            const list = document.getElementById(listId);
            if (!list) return;

            // 找到对应的类别标题
            const header = list.previousElementSibling;
            if (!header || !header.classList.contains('export-category-header')) return;

            // 创建状态指示器
            const stateIndicator = document.createElement('span');
            stateIndicator.className = 'fold-indicator';
            stateIndicator.textContent = '▼';

            // 添加到标题
            header.appendChild(stateIndicator);

            // 默认设置为折叠状态
            list.style.display = 'none';
            stateIndicator.classList.add('collapsed');
            stateIndicator.textContent = '▶';

            // 为类别标题添加点击事件
            header.addEventListener('click', (e) => {
                // 如果点击的是复选框或其标签，不触发折叠/展开
                if (e.target.type === 'checkbox' || e.target.tagName === 'LABEL') {
                    return;
                }

                e.preventDefault();

                if (list.style.display === 'none') {
                    list.style.display = 'block';
                    stateIndicator.classList.remove('collapsed');
                    stateIndicator.textContent = '▼';
                } else {
                    list.style.display = 'none';
                    stateIndicator.classList.add('collapsed');
                    stateIndicator.textContent = '▶';
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
        // 渲染模型列表 - 使用表格形式
        const modelsList = document.getElementById('models-list');
        modelsList.innerHTML = '';

        // 创建表格
        const modelsTable = document.createElement('table');
        modelsTable.className = 'export-table';

        // 创建表头
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        // 模型名称列
        const nameHeader = document.createElement('th');
        nameHeader.textContent = i18n.t('export.name', '名称');

        // 导出列（原基础配置列）
        const baseConfigHeader = document.createElement('th');
        baseConfigHeader.textContent = i18n.t('export.exportOption', '导出');

        // 创建基础配置全选复选框
        const baseConfigCheckbox = document.createElement('input');
        baseConfigCheckbox.type = 'checkbox';
        baseConfigCheckbox.id = 'select-all-base-config';
        baseConfigCheckbox.checked = true;
        baseConfigCheckbox.className = 'select-all-checkbox';
        baseConfigCheckbox.title = i18n.t('export.selectAllBaseConfig', '选择/取消选择所有基础配置');
        baseConfigHeader.appendChild(baseConfigCheckbox);

        // 秘钥列
        const secretHeader = document.createElement('th');
        secretHeader.textContent = i18n.t('export.secretKey', '秘钥');

        // 创建秘钥全选复选框
        const secretCheckbox = document.createElement('input');
        secretCheckbox.type = 'checkbox';
        secretCheckbox.id = 'select-all-secret';
        secretCheckbox.checked = false;
        secretCheckbox.className = 'select-all-checkbox';
        secretCheckbox.title = i18n.t('export.selectAllSecrets', '选择/取消选择所有秘钥');
        secretHeader.appendChild(secretCheckbox);

        // 添加表头
        headerRow.appendChild(nameHeader);
        headerRow.appendChild(baseConfigHeader);
        headerRow.appendChild(secretHeader);
        thead.appendChild(headerRow);
        modelsTable.appendChild(thead);

        // 创建表格内容
        const tbody = document.createElement('tbody');

        // 添加模型行
        Object.entries(this.exportableItems.models).forEach(([modelId, model]) => {
            const row = this.createModelTableRow(modelId, model);
            tbody.appendChild(row);
        });

        modelsTable.appendChild(tbody);
        modelsList.appendChild(modelsTable);

        // 设置全选事件
        this.setupModelTableAllSelectEvents();

        // 渲染提示词列表 - 使用表格形式
        const promptsList = document.getElementById('prompts-list');
        promptsList.innerHTML = '';

        // 创建表格
        const promptsTable = document.createElement('table');
        promptsTable.className = 'export-table';

        // 创建表头
        const promptsThead = document.createElement('thead');
        const promptsHeaderRow = document.createElement('tr');

        // 提示词名称列
        const promptNameHeader = document.createElement('th');
        promptNameHeader.textContent = i18n.t('export.name', '名称');

        // 导出列
        const promptExportHeader = document.createElement('th');
        promptExportHeader.textContent = i18n.t('export.exportOption', '导出');

        // 创建全选复选框
        const promptSelectAllCheckbox = document.createElement('input');
        promptSelectAllCheckbox.type = 'checkbox';
        promptSelectAllCheckbox.id = 'select-all-prompts';
        promptSelectAllCheckbox.checked = true;
        promptSelectAllCheckbox.className = 'select-all-checkbox';
        promptSelectAllCheckbox.title = i18n.t('export.selectAllPrompts', '选择/取消选择所有提示词');
        promptExportHeader.appendChild(promptSelectAllCheckbox);

        // 添加表头
        promptsHeaderRow.appendChild(promptNameHeader);
        promptsHeaderRow.appendChild(promptExportHeader);
        promptsThead.appendChild(promptsHeaderRow);
        promptsTable.appendChild(promptsThead);

        // 创建表格内容
        const promptsTbody = document.createElement('tbody');

        // 添加提示词行
        Object.entries(this.exportableItems.prompts).forEach(([promptId, prompt]) => {
            const row = this.createPromptTableRow(promptId, prompt);
            promptsTbody.appendChild(row);
        });

        promptsTable.appendChild(promptsTbody);
        promptsList.appendChild(promptsTable);

        // 设置提示词全选事件
        this.setupPromptTableAllSelectEvents();

        // 渲染MCP服务列表 - 使用表格形式
        const mcpList = document.getElementById('mcp-list');
        mcpList.innerHTML = '';

        // 创建表格
        const mcpTable = document.createElement('table');
        mcpTable.className = 'export-table';

        // 创建表头
        const mcpThead = document.createElement('thead');
        const mcpHeaderRow = document.createElement('tr');

        // MCP服务名称列
        const mcpNameHeader = document.createElement('th');
        mcpNameHeader.textContent = i18n.t('export.name', '名称');

        // 导出列（原基础配置列）
        const mcpBaseConfigHeader = document.createElement('th');
        mcpBaseConfigHeader.textContent = i18n.t('export.exportOption', '导出');

        // 创建基础配置全选复选框
        const mcpBaseConfigCheckbox = document.createElement('input');
        mcpBaseConfigCheckbox.type = 'checkbox';
        mcpBaseConfigCheckbox.id = 'select-all-mcp-base';
        mcpBaseConfigCheckbox.checked = true;
        mcpBaseConfigCheckbox.className = 'select-all-checkbox';
        mcpBaseConfigCheckbox.title = i18n.t('export.selectAllMcpBaseConfig', '选择/取消选择所有基础配置');
        mcpBaseConfigHeader.appendChild(mcpBaseConfigCheckbox);

        // 环境变量列
        const mcpEnvVarsHeader = document.createElement('th');
        mcpEnvVarsHeader.textContent = i18n.t('export.envVars', '环境变量');

        // 创建环境变量全选复选框
        const mcpEnvVarsCheckbox = document.createElement('input');
        mcpEnvVarsCheckbox.type = 'checkbox';
        mcpEnvVarsCheckbox.id = 'select-all-mcp-env';
        mcpEnvVarsCheckbox.checked = true;
        mcpEnvVarsCheckbox.className = 'select-all-checkbox';
        mcpEnvVarsCheckbox.title = i18n.t('export.selectAllEnvVars', '选择/取消选择所有环境变量');
        mcpEnvVarsHeader.appendChild(mcpEnvVarsCheckbox);

        // 参数列
        const mcpArgsHeader = document.createElement('th');
        mcpArgsHeader.textContent = i18n.t('export.cmdArgs', '参数');

        // 创建参数全选复选框
        const mcpArgsCheckbox = document.createElement('input');
        mcpArgsCheckbox.type = 'checkbox';
        mcpArgsCheckbox.id = 'select-all-mcp-args';
        mcpArgsCheckbox.checked = true;
        mcpArgsCheckbox.className = 'select-all-checkbox';
        mcpArgsCheckbox.title = i18n.t('export.selectAllArgs', '选择/取消选择所有参数');
        mcpArgsHeader.appendChild(mcpArgsCheckbox);

        // 添加表头
        mcpHeaderRow.appendChild(mcpNameHeader);
        mcpHeaderRow.appendChild(mcpBaseConfigHeader);
        mcpHeaderRow.appendChild(mcpEnvVarsHeader);
        mcpHeaderRow.appendChild(mcpArgsHeader);
        mcpThead.appendChild(mcpHeaderRow);
        mcpTable.appendChild(mcpThead);

        // 创建表格内容
        const mcpTbody = document.createElement('tbody');

        // 添加MCP服务行
        Object.entries(this.exportableItems.mcpServers).forEach(([serverId, server]) => {
            const row = this.createMcpTableRow(serverId, server);
            mcpTbody.appendChild(row);
        });

        mcpTable.appendChild(mcpTbody);
        mcpList.appendChild(mcpTable);

        // 设置MCP全选事件
        this.setupMcpTableAllSelectEvents();
    }

    /**
     * 设置模型表格全选事件
     */
    setupModelTableAllSelectEvents() {
        // 基础配置全选
        document.getElementById('select-all-base-config').addEventListener('change', (e) => {
            const checked = e.target.checked;
            const baseConfigCheckboxes = document.querySelectorAll('input[data-type="model-base"]');
            baseConfigCheckboxes.forEach(checkbox => {
                checkbox.checked = checked;
            });

            // 如果取消基础配置，同步取消秘钥
            if (!checked) {
                const secretCheckboxes = document.querySelectorAll('input[data-type="model-secret"]');
                secretCheckboxes.forEach(checkbox => {
                    checkbox.checked = false;
                });
                document.getElementById('select-all-secret').checked = false;
            }
        });

        // 秘钥全选
        document.getElementById('select-all-secret').addEventListener('change', (e) => {
            const checked = e.target.checked;
            const secretCheckboxes = document.querySelectorAll('input[data-type="model-secret"]');
            secretCheckboxes.forEach(checkbox => {
                checkbox.checked = checked;
            });
        });
    }

    /**
     * 设置提示词表格全选事件
     */
    setupPromptTableAllSelectEvents() {
        // 提示词全选
        document.getElementById('select-all-prompts').addEventListener('change', (e) => {
            const checked = e.target.checked;
            const promptCheckboxes = document.querySelectorAll('input[data-type="prompt"]');
            promptCheckboxes.forEach(checkbox => {
                checkbox.checked = checked;
            });
        });
    }

    /**
     * 设置MCP表格全选事件
     */
    setupMcpTableAllSelectEvents() {
        // 基础配置全选
        document.getElementById('select-all-mcp-base').addEventListener('change', (e) => {
            const checked = e.target.checked;
            const baseConfigCheckboxes = document.querySelectorAll('input[data-type="mcp-base"]');
            baseConfigCheckboxes.forEach(checkbox => {
                checkbox.checked = checked;
            });

            // 如果取消基础配置，同步取消环境变量和参数
            if (!checked) {
                const envVarsCheckboxes = document.querySelectorAll('input[data-type="mcp-env"]');
                envVarsCheckboxes.forEach(checkbox => {
                    checkbox.checked = false;
                });
                document.getElementById('select-all-mcp-env').checked = false;

                const argsCheckboxes = document.querySelectorAll('input[data-type="mcp-args"]');
                argsCheckboxes.forEach(checkbox => {
                    checkbox.checked = false;
                });
                document.getElementById('select-all-mcp-args').checked = false;
            }
        });

        // 环境变量全选
        document.getElementById('select-all-mcp-env').addEventListener('change', (e) => {
            const checked = e.target.checked;
            const envVarsCheckboxes = document.querySelectorAll('input[data-type="mcp-env"]');
            envVarsCheckboxes.forEach(checkbox => {
                checkbox.checked = checked;
            });
        });

        // 参数全选
        document.getElementById('select-all-mcp-args').addEventListener('change', (e) => {
            const checked = e.target.checked;
            const argsCheckboxes = document.querySelectorAll('input[data-type="mcp-args"]');
            argsCheckboxes.forEach(checkbox => {
                checkbox.checked = checked;
            });
        });
    }

    /**
     * 创建模型表格行
     * @param {string} id - 模型ID
     * @param {object} model - 模型对象
     * @returns {HTMLElement} - 表格行元素
     */
    createModelTableRow(id, model) {
        const row = document.createElement('tr');
        row.className = 'export-table-row';

        // 模型名称单元格
        const nameCell = document.createElement('td');
        nameCell.className = 'export-model-name';
        nameCell.textContent = model.name;

        // 基础配置选择框单元格
        const baseConfigCell = document.createElement('td');
        baseConfigCell.className = 'export-checkbox-cell';

        const baseConfigCheckbox = document.createElement('input');
        baseConfigCheckbox.type = 'checkbox';
        baseConfigCheckbox.id = `model-base-${id}`;
        baseConfigCheckbox.dataset.id = id;
        baseConfigCheckbox.dataset.type = 'model-base';
        baseConfigCheckbox.checked = true;
        baseConfigCheckbox.className = 'export-item-checkbox';
        baseConfigCheckbox.title = i18n.t('export.selectBaseConfig', '选择/取消选择基础配置');

        // 添加事件监听，当取消基础配置时，同步取消秘钥
        baseConfigCheckbox.addEventListener('change', (e) => {
            if (!e.target.checked) {
                const secretCheckbox = document.getElementById(`model-secret-${id}`);
                if (secretCheckbox) {
                    secretCheckbox.checked = false;
                }
            }
        });

        baseConfigCell.appendChild(baseConfigCheckbox);

        // 秘钥选择框单元格
        const secretCell = document.createElement('td');
        secretCell.className = 'export-checkbox-cell';

        const secretCheckbox = document.createElement('input');
        secretCheckbox.type = 'checkbox';
        secretCheckbox.id = `model-secret-${id}`;
        secretCheckbox.dataset.id = id;
        secretCheckbox.dataset.type = 'model-secret';
        secretCheckbox.checked = false;
        secretCheckbox.className = 'export-item-checkbox';
        secretCheckbox.title = i18n.t('export.selectSecret', '选择/取消选择秘钥');

        secretCell.appendChild(secretCheckbox);

        // 添加单元格到行
        row.appendChild(nameCell);
        row.appendChild(baseConfigCell);
        row.appendChild(secretCell);

        return row;
    }

    /**
     * 创建提示词表格行
     * @param {string} id - 提示词ID
     * @param {object} prompt - 提示词对象
     * @returns {HTMLElement} - 表格行元素
     */
    createPromptTableRow(id, prompt) {
        const row = document.createElement('tr');
        row.className = 'export-table-row';

        // 提示词名称单元格
        const nameCell = document.createElement('td');
        nameCell.className = 'export-prompt-name';
        nameCell.textContent = prompt.name;

        // 导出选择框单元格
        const exportCell = document.createElement('td');
        exportCell.className = 'export-checkbox-cell';

        const exportCheckbox = document.createElement('input');
        exportCheckbox.type = 'checkbox';
        exportCheckbox.id = `prompt-${id}`;
        exportCheckbox.dataset.id = id;
        exportCheckbox.dataset.type = 'prompt';
        exportCheckbox.checked = true;
        exportCheckbox.className = 'export-item-checkbox';
        exportCheckbox.title = i18n.t('export.selectPrompt', '选择/取消选择提示词');

        exportCell.appendChild(exportCheckbox);

        // 添加单元格到行
        row.appendChild(nameCell);
        row.appendChild(exportCell);

        return row;
    }

    /**
     * 创建MCP服务表格行
     * @param {string} id - MCP服务ID
     * @param {object} server - MCP服务对象
     * @returns {HTMLElement} - 表格行元素
     */
    createMcpTableRow(id, server) {
        const row = document.createElement('tr');
        row.className = 'export-table-row';

        // MCP服务名称单元格
        const nameCell = document.createElement('td');
        nameCell.className = 'export-mcp-name';
        nameCell.textContent = server.name;

        // 基础配置选择框单元格
        const baseConfigCell = document.createElement('td');
        baseConfigCell.className = 'export-checkbox-cell';

        const baseConfigCheckbox = document.createElement('input');
        baseConfigCheckbox.type = 'checkbox';
        baseConfigCheckbox.id = `mcp-base-${id}`;
        baseConfigCheckbox.dataset.id = id;
        baseConfigCheckbox.dataset.type = 'mcp-base';
        baseConfigCheckbox.checked = true;
        baseConfigCheckbox.className = 'export-item-checkbox';
        baseConfigCheckbox.title = i18n.t('export.selectMcpBaseConfig', '选择/取消选择基础配置');

        // 添加事件监听，当取消基础配置时，同步取消环境变量和参数
        baseConfigCheckbox.addEventListener('change', (e) => {
            if (!e.target.checked) {
                const envVarsCheckbox = document.getElementById(`mcp-env-${id}`);
                if (envVarsCheckbox) {
                    envVarsCheckbox.checked = false;
                }

                const argsCheckbox = document.getElementById(`mcp-args-${id}`);
                if (argsCheckbox) {
                    argsCheckbox.checked = false;
                }
            }
        });

        baseConfigCell.appendChild(baseConfigCheckbox);

        // 环境变量选择框单元格
        const envVarsCell = document.createElement('td');
        envVarsCell.className = 'export-checkbox-cell';

        const envVarsCheckbox = document.createElement('input');
        envVarsCheckbox.type = 'checkbox';
        envVarsCheckbox.id = `mcp-env-${id}`;
        envVarsCheckbox.dataset.id = id;
        envVarsCheckbox.dataset.type = 'mcp-env';
        envVarsCheckbox.checked = true;
        envVarsCheckbox.className = 'export-item-checkbox';
        envVarsCheckbox.title = i18n.t('export.selectEnvVars', '选择/取消选择环境变量');

        envVarsCell.appendChild(envVarsCheckbox);

        // 参数选择框单元格
        const argsCell = document.createElement('td');
        argsCell.className = 'export-checkbox-cell';

        const argsCheckbox = document.createElement('input');
        argsCheckbox.type = 'checkbox';
        argsCheckbox.id = `mcp-args-${id}`;
        argsCheckbox.dataset.id = id;
        argsCheckbox.dataset.type = 'mcp-args';
        argsCheckbox.checked = true;
        argsCheckbox.className = 'export-item-checkbox';
        argsCheckbox.title = i18n.t('export.selectArgs', '选择/取消选择参数');

        argsCell.appendChild(argsCheckbox);

        // 添加单元格到行
        row.appendChild(nameCell);
        row.appendChild(baseConfigCell);
        row.appendChild(envVarsCell);
        row.appendChild(argsCell);

        return row;
    }

    /**
     * 收集用户选择的导出项
     */
    collectSelectedItems() {
        // 重置选择
        this.selectedItems = {
            models: [],
            modelSecrets: [],
            prompts: [],
            mcpServers: [],
            mcpEnvVars: [],
            mcpArgs: []
        };

        // 收集选中的模型基础配置
        const modelBaseCheckboxes = document.querySelectorAll('input[data-type="model-base"]:checked');
        modelBaseCheckboxes.forEach(checkbox => {
            this.selectedItems.models.push(checkbox.dataset.id);
        });

        // 收集选中的模型秘钥
        const modelSecretCheckboxes = document.querySelectorAll('input[data-type="model-secret"]:checked');
        modelSecretCheckboxes.forEach(checkbox => {
            this.selectedItems.modelSecrets.push(checkbox.dataset.id);
        });

        // 收集选中的提示词
        const promptCheckboxes = document.querySelectorAll('input[data-type="prompt"]:checked');
        promptCheckboxes.forEach(checkbox => {
            this.selectedItems.prompts.push(checkbox.dataset.id);
        });

        // 收集选中的MCP服务基础配置
        const mcpBaseCheckboxes = document.querySelectorAll('input[data-type="mcp-base"]:checked');
        mcpBaseCheckboxes.forEach(checkbox => {
            this.selectedItems.mcpServers.push(checkbox.dataset.id);
        });

        // 收集选中的MCP服务环境变量
        const mcpEnvCheckboxes = document.querySelectorAll('input[data-type="mcp-env"]:checked');
        mcpEnvCheckboxes.forEach(checkbox => {
            this.selectedItems.mcpEnvVars.push(checkbox.dataset.id);
        });

        // 收集选中的MCP服务参数
        const mcpArgsCheckboxes = document.querySelectorAll('input[data-type="mcp-args"]:checked');
        mcpArgsCheckboxes.forEach(checkbox => {
            this.selectedItems.mcpArgs.push(checkbox.dataset.id);
        });

        log.info('已选择的导出项:', {
            models: this.selectedItems.models.length,
            modelSecrets: this.selectedItems.modelSecrets.length,
            prompts: this.selectedItems.prompts.length,
            mcpBase: this.selectedItems.mcpServers.length,
            mcpEnvVars: this.selectedItems.mcpEnvVars.length,
            mcpArgs: this.selectedItems.mcpArgs.length
        });
    }

    /**
     * 导出配置到文件
     * @returns {Promise<void>}
     */
    async exportConfig() {
        try {
            log.info('选择的项目:', this.selectedItems);

            // 准备导出数据
            const exportData = {};

            // 获取最新数据并根据用户选择过滤
            if (this.selectedItems.models.length > 0) {
                const models = await ipcRenderer.invoke('get-models');
                // 只导出用户选择了基础配置的模型
                exportData.models = {};

                // 处理每个选中了基础配置的模型
                this.selectedItems.models.forEach(modelId => {
                    if (models[modelId]) {
                        // 创建模型配置的副本
                        const modelConfig = { ...models[modelId] };

                        // 检查这个模型是否选中了秘钥
                        const includeSecret = this.selectedItems.modelSecrets.includes(modelId);

                        // 如果不包含秘钥，则移除API密钥相关字段
                        if (!includeSecret) {
                            delete modelConfig.apiKey;
                        }

                        // 将处理后的配置添加到导出数据中
                        exportData.models[modelId] = modelConfig;
                    }
                });
            }

            if (this.selectedItems.prompts.length > 0) {
                const prompts = await ipcRenderer.invoke('get-all-prompts');
                // 只导出用户选择的提示词
                exportData.prompts = {};
                this.selectedItems.prompts.forEach(promptId => {
                    if (prompts[promptId]) {
                        exportData.prompts[promptId] = prompts[promptId];
                    }
                });
            }

            if (this.selectedItems.mcpServers.length > 0) {
                const mcpConfig = await ipcRenderer.invoke('get-mcp-config');
                // 只导出用户选择的基础配置的MCP服务
                exportData.mcpServers = {};

                this.selectedItems.mcpServers.forEach(serverId => {
                    if (mcpConfig.servers[serverId]) {
                        // 创建MCP服务配置的副本
                        let serverConfig = { ...mcpConfig.servers[serverId] };

                        // 检查是否需要包含环境变量
                        const includeEnvVars = this.selectedItems.mcpEnvVars.includes(serverId);
                        // 检查是否需要包含参数
                        const includeArgs = this.selectedItems.mcpArgs.includes(serverId);

                        // 如果不包含环境变量，则移除相关字段
                        if (!includeEnvVars && serverConfig.env) {
                            delete serverConfig.env;
                        }

                        // 如果不包含参数，则移除相关字段
                        if (!includeArgs && serverConfig.args) {
                            delete serverConfig.args;
                        }

                        if (serverConfig.autoApprove) {
                            delete serverConfig.autoApprove;
                        }

                        if (serverConfig.toolDescriptions) {
                            delete serverConfig.toolDescriptions;
                        }

                        // 添加到导出数据中
                        exportData.mcpServers[serverId] = serverConfig;
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