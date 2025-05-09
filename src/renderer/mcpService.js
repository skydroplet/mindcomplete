/**
 * mcpService.js
 * MCP服务模块 - 合并了mcpSettingsService功能
 * 
 * 该模块负责处理与MCP服务相关的所有功能，包括：
 * - 加载MCP服务列表
 * - 更新MCP服务选择下拉菜单
 * - 处理MCP服务的激活与停用
 * - 管理MCP服务配置设置
 * - 测试MCP工具
 * - 管理环境变量和命令行参数
 * - 管理自动授权工具列表
 */

const { ipcRenderer } = require('electron');
const Logger = require('../main/logger');
const log = new Logger('mcpService');
const i18n = require('../locales/i18n');

/**
 * MCP服务管理类
 */
class McpService {
    /**
     * 构造函数 - 初始化MCP服务管理器
     * @private
     */
    constructor() {

        // 存储MCP服务列表和激活状态
        this.mcpServers = {};
        this.activeMcps = [];
        this.currentServerId = null; // 当前选中的服务ID

        // DOM元素引用 - 在初始化时为null，将在loadMcpServers或其他适当的时机进行获取
        this.mcpDropdownBtn = null;
        this.mcpDropdownContent = null;
    }

    /**
     * 初始化DOM元素引用
     * @private
     */
    initDomElements() {
        this.mcpDropdownBtn = document.getElementById('mcp-dropdown-btn');
        this.mcpDropdownContent = document.getElementById('mcp-dropdown-content');
    }

    /**
     * 加载MCP服务列表
     * 
     * 从主进程获取MCP服务配置，更新本地缓存和UI
     * 
     * @param {HTMLElement} statusElement - 状态显示元素
     * @returns {Promise<void>}
     */
    async loadMcpServers(statusElement) {
        try {
            // 确保DOM元素引用已初始化
            this.initDomElements();

            const mcpConfig = await ipcRenderer.invoke('get-mcp-config');

            this.mcpServers = mcpConfig.servers || {};
            this.activeMcps = mcpConfig.activeMcps || [];

            this.updateMcpServersList();
            this.updateMcpDropdownButton();

            // 确保MCP下拉菜单按钮事件正常工作
            setTimeout(() => this.debugMcpDropdown(), 100);
        } catch (error) {
            log.error('加载MCP服务列表失败:', error.message);
            if (statusElement) {
                statusElement.textContent = i18n.t('errors.loadMcpServerListFailed', { error: error.message });
            }
        }
    }

    /**
     * 更新MCP服务列表UI
     */
    updateMcpServersList() {
        log.info('更新MCP服务列表');
        if (!this.mcpDropdownContent) {
            log.error('MCP下拉菜单内容元素不存在');
            return;
        }

        // 清空当前选项
        while (this.mcpDropdownContent.firstChild) {
            this.mcpDropdownContent.removeChild(this.mcpDropdownContent.firstChild);
        }

        // 配置下拉菜单样式，确保向上展开且最多显示10个选项
        this.mcpDropdownContent.style.maxHeight = 'calc(10 * 36px)'; // 限制为10个项目的高度
        this.mcpDropdownContent.style.overflowY = 'auto';
        this.mcpDropdownContent.style.bottom = '100%'; // 确保向上展开
        this.mcpDropdownContent.style.top = 'auto';

        // 添加"添加服务"选项
        const addServerItem = document.createElement('div');
        addServerItem.className = 'mcp-server-item add-server-item';
        addServerItem.textContent = i18n.t('mcp.addServer');
        addServerItem.addEventListener('click', (e) => {
            // 打开设置窗口的MCP标签页
            window.openSettingsWindowWithTab('mcp');
            this.mcpDropdownContent.classList.remove('show'); // 点击后关闭下拉菜单
        });
        this.mcpDropdownContent.appendChild(addServerItem);

        // 添加服务选项
        if (Object.keys(this.mcpServers).length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'mcp-empty-message';
            emptyMessage.textContent = i18n.t('mcp.noServer');
            this.mcpDropdownContent.appendChild(emptyMessage);
            return;
        }

        // 遍历当前所有服务并添加到列表中
        Object.keys(this.mcpServers).forEach(serverId => {
            const serverConfig = this.mcpServers[serverId];
            const serverItem = document.createElement('div');
            serverItem.className = 'mcp-server-item';
            serverItem.dataset.name = serverId;

            // 创建复选框
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = this.activeMcps.includes(serverId);
            checkbox.addEventListener('change', (e) => {
                this.toggleMcpServer(serverId, e.target.checked);
            });

            // 添加服务名称
            const label = document.createTextNode(serverConfig.name || serverId);

            // 组装元素
            serverItem.appendChild(checkbox);
            serverItem.appendChild(label);
            this.mcpDropdownContent.appendChild(serverItem);
        });

        // 添加鼠标滚轮事件处理
        if (!this.mcpDropdownContent.hasWheelHandler) {
            this.mcpDropdownContent.addEventListener('wheel', (event) => {
                // 阻止默认行为，防止页面滚动
                event.preventDefault();

                // 根据滚轮方向滚动下拉菜单
                this.mcpDropdownContent.scrollTop += event.deltaY;
            });
            this.mcpDropdownContent.hasWheelHandler = true;
        }
    }

    /**
     * 更新MCP下拉按钮显示
     */
    updateMcpDropdownButton() {
        if (!this.mcpDropdownBtn) return;

        if (this.activeMcps.length === 0) {
            this.mcpDropdownBtn.textContent = i18n.t('mcp.server');
            this.mcpDropdownBtn.classList.remove('active');
        } else if (this.activeMcps.length === 1) {
            const serverId = this.activeMcps[0];
            const serverConfig = this.mcpServers[serverId];
            this.mcpDropdownBtn.textContent = serverConfig && serverConfig.name ? serverConfig.name : serverId;
            this.mcpDropdownBtn.classList.add('active');
        } else {
            this.mcpDropdownBtn.textContent = i18n.t('mcp.selectedServers', { count: this.activeMcps.length });
            this.mcpDropdownBtn.classList.add('active');
        }
    }

    /**
     * 切换MCP服务的激活状态
     * 
     * @param {string} serverId - 服务ID
     * @param {boolean} isActive - 激活状态
     * @param {HTMLElement} statusElement - 状态显示元素
     * @returns {Promise<void>}
     */
    async toggleMcpServer(serverId, isActive, statusElement) {
        try {
            // 更新本地数组
            if (isActive && !this.activeMcps.includes(serverId)) {
                this.activeMcps.push(serverId);
            } else if (!isActive && this.activeMcps.includes(serverId)) {
                this.activeMcps = this.activeMcps.filter(id => id !== serverId);
            }

            // 更新UI
            const serverItem = this.mcpDropdownContent.querySelector(`.mcp-server-item[data-name="${serverId}"]`);
            if (serverItem) {
                if (isActive) {
                    serverItem.classList.add('active');
                } else {
                    serverItem.classList.remove('active');
                }
            }

            // 更新下拉按钮文本
            this.updateMcpDropdownButton();

            // 保存到配置
            const result = await ipcRenderer.invoke('set-active-mcps', this.activeMcps);
            if (!result) {
                throw new Error(i18n.t('errors.saveMcpServerFailed'));
            }
        } catch (error) {
            log.error('切换MCP服务激活状态失败:', error.message);
            if (statusElement) {
                statusElement.textContent = i18n.t('mcp.toggleFailed', { error: error.message });
            }
            // 恢复UI状态（重新加载）
            await this.loadMcpServers(statusElement);
        }
    }

    /**
     * 切换MCP下拉菜单的显示状态
     */
    toggleMcpDropdown() {
        log.info('切换MCP下拉菜单显示状态');
        if (!this.mcpDropdownContent) {
            log.error('MCP下拉菜单内容元素不存在');
            return;
        }

        const isShowing = this.mcpDropdownContent.classList.contains('show');
        log.info('当前显示状态:', isShowing);

        if (isShowing) {
            this.mcpDropdownContent.classList.remove('show');
            log.info('隐藏下拉菜单');
        } else {
            // 配置下拉菜单样式，确保向上展开且最多显示10个选项
            this.mcpDropdownContent.style.maxHeight = 'calc(10 * 36px)'; // 限制为10个项目的高度
            this.mcpDropdownContent.style.overflowY = 'auto';
            this.mcpDropdownContent.style.bottom = '100%'; // 确保向上展开
            this.mcpDropdownContent.style.top = 'auto';

            this.mcpDropdownContent.classList.add('show');
            log.info('显示下拉菜单');

            // 添加鼠标滚轮事件以支持滚动
            if (!this.mcpDropdownContent.hasWheelHandler) {
                this.mcpDropdownContent.addEventListener('wheel', (event) => {
                    // 阻止默认行为，防止页面滚动
                    event.preventDefault();

                    // 根据滚轮方向滚动下拉菜单
                    this.mcpDropdownContent.scrollTop += event.deltaY;
                });
                this.mcpDropdownContent.hasWheelHandler = true;
            }
        }
    }

    /**
     * 调试和修复MCP下拉菜单
     */
    debugMcpDropdown() {
        if (!this.mcpDropdownBtn) {
            log.error('MCP下拉菜单按钮不存在，无法绑定事件');
            return;
        }

        if (!this.mcpDropdownContent) {
            log.error('MCP下拉菜单内容不存在，无法完成功能');
            return;
        }

        // 移除所有现有的点击事件监听器
        const clone = this.mcpDropdownBtn.cloneNode(true);
        if (this.mcpDropdownBtn.parentNode) {
            this.mcpDropdownBtn.parentNode.replaceChild(clone, this.mcpDropdownBtn);
            log.info('成功替换了MCP按钮元素，移除了旧事件');
        } else {
            log.error('MCP按钮没有父节点，无法替换');
            return;
        }

        // 更新实例引用到新的DOM元素
        this.mcpDropdownBtn = document.getElementById('mcp-dropdown-btn');
        if (!this.mcpDropdownBtn) {
            log.error('替换后无法找到MCP按钮元素');
            return;
        }

        // 添加新的点击事件
        this.mcpDropdownBtn.addEventListener('click', (e) => {
            log.info('MCP按钮被点击 - 事件触发');
            e.stopPropagation();
            this.toggleMcpDropdown();
        });

        log.info('成功为MCP按钮添加了新的点击事件');
    }

    /**
     * 确保MCP下拉菜单样式一致性
     */
    ensureMcpDropdownStyles() {
        // 确保MCP下拉菜单容器正确使用CSS样式而不是内联样式
        if (this.mcpDropdownContent) {
            // 清除可能的内联宽度样式
            this.mcpDropdownContent.style.removeProperty('width');

            // 确保其他样式正确设置
            this.mcpDropdownContent.style.maxHeight = 'calc(10 * 2.5em)'; // 使用em单位，基于文字大小
            this.mcpDropdownContent.style.overflowY = 'auto';
            this.mcpDropdownContent.style.bottom = '100%';
            this.mcpDropdownContent.style.top = 'auto';
        }
    }

    /**
     * 设置MCP下拉菜单事件监听器
     * 
     * @param {Function} openSettingsWindowWithTab - 打开设置窗口的函数
     */
    setupMcpDropdownListeners(openSettingsWindowWithTab) {
        // 导出openSettingsWindowWithTab函数，使其可在updateMcpServersList中使用
        window.openSettingsWindowWithTab = openSettingsWindowWithTab;

        // 确保DOM元素引用已初始化
        this.initDomElements();

        // 添加MCP下拉菜单事件处理
        if (this.mcpDropdownBtn) {
            this.mcpDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止触发window的点击事件
                this.toggleMcpDropdown();
            });
        }

        // 点击页面其他位置关闭下拉菜单
        window.addEventListener('click', (event) => {
            if (this.mcpDropdownContent && !event.target.matches('#mcp-dropdown-btn') && !event.target.closest('.mcp-dropdown-content')) {
                this.mcpDropdownContent.classList.remove('show');
            }
        });
    }

    /**
     * 获取已激活的MCP服务列表
     * @returns {Array} 已激活的MCP服务ID列表
     */
    getActiveMcps() {
        return this.activeMcps;
    }

    /**
     * 获取所有MCP服务
     * @returns {Object} MCP服务配置对象
     */
    getMcpServers() {
        return this.mcpServers;
    }

    /**
     * 获取MCP配置
     * @returns {Object} MCP配置对象
     */
    getMcpConfig() {
        return {
            servers: this.mcpServers,
            activeMcps: this.activeMcps
        };
    }

    /**
     * 设置MCP配置
     * @param {Object} config - MCP配置对象
     */
    setMcpConfig(config) {
        this.mcpServers = config.servers || {};
        this.activeMcps = config.activeMcps || [];
    }

    /**
     * 获取当前选中的服务ID
     * @returns {string} 当前服务ID
     */
    getCurrentServerId() {
        return this.currentServerId;
    }

    /**
     * 设置当前选中的服务ID
     * @param {string} id - 服务ID
     */
    setCurrentServerId(id) {
        this.currentServerId = id;
    }

    /**
     * 初始化MCP设置
     */
    async initMcpSettings() {
        try {
            // 获取MCP服务列表
            const config = await ipcRenderer.invoke('get-mcp-config');
            this.mcpServers = config?.servers || {};
            this.activeMcps = config?.activeMcps || [];
            this.updateMcpServerList();

            // 初始化事件监听器
            this.initMcpEventListeners();
        } catch (error) {
            log.error('初始化MCP设置失败:', error.message);
        }
    }

    /**
     * 更新MCP服务列表（设置页面）
     */
    updateMcpServerList() {
        const serverList = document.getElementById('mcpServersList');
        if (!serverList) {
            log.error('MCP服务列表元素不存在');
            return;
        }

        serverList.innerHTML = '';

        log.info('最新mcp服务列表:', JSON.stringify({
            servers: this.mcpServers,
            activeMcps: this.activeMcps
        }, null, 2));

        // 获取服务列表
        const mcpServers = this.mcpServers || {};

        Object.entries(mcpServers).forEach(([serverId, config]) => {
            const div = document.createElement('div');
            div.className = 'model-item';

            // 创建服务名称显示
            const serverNameSpan = document.createElement('span');
            serverNameSpan.textContent = config.name;
            serverNameSpan.className = 'server-name';

            // 将元素添加到div中
            div.appendChild(serverNameSpan);

            // 设置服务ID为数据属性
            div.dataset.serverId = serverId;

            // 点击服务名称区域时编辑服务配置
            div.onclick = () => this.selectMcpServer(serverId);

            serverList.appendChild(div);
        });
    }

    /**
     * 选择MCP服务
     * @param {string} serverId - 服务ID
     */
    selectMcpServer(serverId) {
        this.currentServerId = serverId;
        // 同步到全局变量
        if (window.currentServerId !== serverId) {
            window.currentServerId = serverId;
        }

        const server = this.mcpServers[serverId];

        if (server) {
            document.getElementById('serverName').value = server.name;
            document.getElementById('serverPath').value = server.command || '';

            // 清空环境变量和参数容器
            document.getElementById('envVarsContainer').innerHTML = '';
            document.getElementById('argsContainer').innerHTML = '';

            // 添加环境变量
            if (server.envs) {
                Object.entries(server.envs).forEach(([key, value]) => {
                    this.addEnvRow(key, value);
                });
            }

            // 添加命令行参数
            if (server.args && Array.isArray(server.args)) {
                server.args.forEach(arg => {
                    this.addArgRow(arg);
                });
            }

            // 显示删除按钮和复制按钮
            document.getElementById('deleteMcpServerBtn').classList.remove('hidden');
            document.getElementById('copyMcpServerBtn').classList.remove('hidden');

            // 更新测试按钮状态
            this.updateTestButtonState();

            // 如果有可用工具列表或已保存的工具列表，尝试显示工具列表
            if (server.toolDescriptions && server.toolDescriptions.length > 0) {
                // 使用保存的工具描述显示工具列表
                this.displayToolsFromData(server.toolDescriptions);
            } else {
                // 没有预先加载的工具描述，隐藏工具列表
                this.hideToolsList();
            }
        }
    }

    /**
     * 添加环境变量行
     * @param {string} key - 环境变量名称
     * @param {string} value - 环境变量值
     */
    addEnvRow(key = '', value = '') {
        const container = document.getElementById('envVarsContainer');
        if (!container) {
            log.error('环境变量容器元素不存在');
            return;
        }

        const div = document.createElement('div');
        div.className = 'key-value-row';
        div.innerHTML = `
            <input type="text" placeholder="${i18n.t('env.keyPlaceholder', 'Variable name')}" class="env-key" value="${key}">
            <span>:</span>
            <input type="text" placeholder="${i18n.t('env.valuePlaceholder', 'Variable value')}" class="env-value" value="${value}">
            <button type="button" class="delete-env">×</button>
        `;
        container.appendChild(div);

        // 确保新添加的输入框可编辑
        div.querySelectorAll('input').forEach(input => {
            input.readOnly = false;
            input.disabled = false;
        });
    }

    /**
     * 添加命令行参数行
     * @param {string} value - 参数值
     */
    addArgRow(value = '') {
        const container = document.getElementById('argsContainer');
        if (!container) {
            log.error('参数容器元素不存在');
            return;
        }

        const div = document.createElement('div');
        div.className = 'key-value-row';
        div.innerHTML = `
            <input type="text" placeholder="${i18n.t('args.valuePlaceholder', 'Parameter value')}" class="arg-value" value="${value}">
            <button type="button" class="delete-arg">×</button>
        `;
        container.appendChild(div);

        // 确保新添加的输入框可编辑
        div.querySelectorAll('input').forEach(input => {
            input.readOnly = false;
            input.disabled = false;
        });
    }

    /**
     * 更新测试按钮状态
     */
    updateTestButtonState() {
        const testButton = document.getElementById('test-mcp-button');
        if (!testButton) {
            log.error('测试按钮元素不存在');
            return;
        }

        const pathValue = document.getElementById('serverPath')?.value?.trim() || '';

        // 路径不为空时才启用测试按钮
        testButton.disabled = pathValue === '';

        // 添加视觉反馈
        if (pathValue === '') {
            testButton.style.opacity = '0.5';
            testButton.title = '请先填写可执行路径';
        } else {
            testButton.style.opacity = '1';
            testButton.title = '测试MCP工具';
        }
    }

    /**
     * 隐藏工具列表
     */
    hideToolsList() {
        const toolsContainer = document.getElementById('toolsListContainer');
        if (toolsContainer) {
            toolsContainer.classList.add('hidden');
        }
    }

    /**
     * 重置MCP服务表单
     */
    resetMcpServerForm() {
        const form = document.getElementById('mcpServerForm');
        if (!form) {
            log.error('MCP服务表单不存在');
            return;
        }

        form.reset();

        const envContainer = document.getElementById('envVarsContainer');
        if (envContainer) {
            envContainer.innerHTML = '';
        }

        const argsContainer = document.getElementById('argsContainer');
        if (argsContainer) {
            argsContainer.innerHTML = '';
        }

        this.currentServerId = null;
        // 同步到全局变量
        window.currentServerId = null;

        const deleteBtn = document.getElementById('deleteMcpServerBtn');
        if (deleteBtn) {
            deleteBtn.classList.add('hidden');
        }

        const copyBtn = document.getElementById('copyMcpServerBtn');
        if (copyBtn) {
            copyBtn.classList.add('hidden');
        }

        this.hideToolsList();

        // 确保所有输入框可编辑
        document.querySelectorAll('#mcpServerForm input').forEach(input => {
            input.readOnly = false;
            input.disabled = false;
        });

        // 为了修复删除配置后无法选中输入框的问题，显式设置焦点到第一个输入框
        setTimeout(() => {
            const firstInput = document.getElementById('serverName');
            if (firstInput) {
                firstInput.focus();
            }
        }, 0);
    }

    /**
     * 规范化路径格式
     * @param {string} inputPath - 输入路径
     * @returns {string} 规范化后的路径
     */
    sanitizePath(inputPath) {
        if (!inputPath) return '';

        // 去除首尾空格
        let path = inputPath.trim();

        // 处理常见的路径格式问题

        // 替换多个连续的斜杠为单个斜杠
        path = path.replace(/[\/\\]{2,}/g, '\\');

        // 确保Windows风格的路径使用反斜杠
        if (/^[a-zA-Z]:(\/|\\)/.test(path)) {
            path = path.replace(/\//g, '\\');
        }

        // 处理 /d/ 这种格式的路径转为 d:\
        if (path.match(/^\/[a-zA-Z]\//)) {
            const drive = path.charAt(1);
            path = `${drive}:\\${path.substr(3)}`;
            path = path.replace(/\//g, '\\');
        }

        return path;
    }

    /**
     * 直接测试MCP工具
     */
    async directTestMcpTool() {
        try {
            const testButton = document.getElementById('test-mcp-button');
            if (!testButton) {
                log.error('测试按钮元素不存在');
                return;
            }

            testButton.disabled = true;
            testButton.textContent = i18n.t('mcp.toolsList.testing');

            // 获取当前表单中的MCP服务配置
            const pathElement = document.getElementById('serverPath');
            if (!pathElement) {
                log.error('服务路径输入框不存在');
                return;
            }

            let command = pathElement.value.trim();

            // 使用sanitizePath函数规范化路径
            command = this.sanitizePath(command);

            // 如果路径为空，提前返回错误
            if (!command) {
                log.error(i18n.t('errors.serverConfigIncomplete'));
                return;
            }

            const serverNameElement = document.getElementById('serverName');
            if (!serverNameElement) {
                log.error('服务名称输入框不存在');
                return;
            }

            const serverData = {
                name: serverNameElement.value || i18n.t('mcp.toolsList.title'),
                command: command,
                envs: {},
                args: []
            };

            // 获取环境变量
            const envVars = {};
            document.querySelectorAll('#envVarsContainer .key-value-row').forEach(row => {
                const key = row.querySelector('.env-key')?.value;
                const value = row.querySelector('.env-value')?.value;
                if (key) {
                    envVars[key] = value;
                }
            });
            serverData.envs = envVars;

            // 获取命令行参数
            serverData.args = Array.from(document.querySelectorAll('#argsContainer .key-value-row')).map(row => {
                return row.querySelector('.arg-value')?.value;
            }).filter(arg => arg && arg.trim() !== '');

            log.info('使用当前配置测试MCP工具:', JSON.stringify(serverData, null, 2));

            // 调用后端接口执行工具，传递当前配置
            const result = await ipcRenderer.invoke('direct-test-mcp-tool', serverData);
            log.info('直接测试MCP工具结果:', result);

            // 显示测试结果
            if (result.success) {
                // 格式化工具列表，只显示名称和描述
                const formattedToolList = result.toolDescriptions.map(tool =>
                    `${tool.name}: ${tool.description}`
                ).join('\n');

                const resultMessage = `${i18n.t('mcp.toolsList.testSuccess')}
${i18n.t('mcp.toolsList.serverName')}: ${result.serverName}
${i18n.t('mcp.toolsList.toolCount')}: ${result.tools}
${i18n.t('mcp.toolsList.toolList')}:
${formattedToolList}
`;

                log.info(resultMessage);

                // 如果当前有选中的服务，将工具描述保存到服务配置中
                if (this.currentServerId && this.mcpServers[this.currentServerId]) {
                    // 将工具描述保存到当前服务配置中
                    this.mcpServers[this.currentServerId].toolDescriptions = result.toolDescriptions;

                    // 如果当前服务没有自动授权列表，初始化为空数组
                    if (!this.mcpServers[this.currentServerId].autoApprove) {
                        this.mcpServers[this.currentServerId].autoApprove = [];
                    }

                    // 立即保存到配置文件中
                    try {
                        // 准备要更新的服务数据
                        const updatedServerData = {
                            ...this.mcpServers[this.currentServerId],
                            toolDescriptions: result.toolDescriptions
                        };

                        // 更新服务器配置
                        const success = await ipcRenderer.invoke('update-mcp-server', {
                            serverId: this.currentServerId,
                            serverData: updatedServerData
                        });

                        if (success) {
                            log.info('工具列表已保存到配置文件');

                            // 刷新完整的MCP配置
                            const updatedMcpConfig = await ipcRenderer.invoke('get-mcp-config');
                            this.mcpServers = updatedMcpConfig?.servers || {};
                            this.activeMcps = updatedMcpConfig?.activeMcps || [];
                        } else {
                            log.error('保存工具列表到配置文件失败');
                        }
                    } catch (error) {
                        log.error('保存工具列表到配置文件时出错:', error.message);
                    }
                }

                // 显示工具列表
                if (result.toolDescriptions && result.toolDescriptions.length > 0) {
                    const toolsList = document.getElementById('toolsList');
                    if (!toolsList) {
                        log.error('工具列表元素不存在');
                        return;
                    }

                    // 清空当前列表
                    toolsList.innerHTML = '';

                    // 使用共享函数显示工具列表
                    this.displayToolsFromData(result.toolDescriptions);
                }
            }
        } catch (error) {
            log.error('测试MCP工具时出错:', error.message);
        } finally {
            // 重置测试按钮状态
            const testButton = document.getElementById('test-mcp-button');
            if (testButton) {
                testButton.disabled = false;
                testButton.textContent = i18n.t('mcp.toolsList.testButton');
            }
        }
    }

    /**
     * 显示工具列表
     * @param {Array} toolDescriptions - 工具描述数组
     */
    displayToolsFromData(toolDescriptions) {
        const toolsContainer = document.getElementById('toolsListContainer');
        const toolsList = document.getElementById('toolsList');

        if (!toolsContainer || !toolsList) {
            log.error('工具列表容器元素不存在');
            return;
        }

        // 清空当前列表
        toolsList.innerHTML = '';

        // 创建表格
        const table = document.createElement('table');
        table.className = 'tools-table';

        // 创建表头
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        // 添加表头列
        const indexHeader = document.createElement('th');
        indexHeader.textContent = i18n.t('mcp.toolsList.index');
        indexHeader.style.minWidth = '2em'; // 确保至少有2个中文字符的宽度

        const nameHeader = document.createElement('th');
        nameHeader.textContent = i18n.t('mcp.toolsList.name');
        nameHeader.style.minWidth = '4em'; // 确保至少有4个中文字符的宽度
        nameHeader.style.wordBreak = 'break-word'; // 允许长文本自动换行

        const descriptionHeader = document.createElement('th');
        descriptionHeader.textContent = i18n.t('mcp.toolsList.description');
        descriptionHeader.style.minWidth = '4em'; // 确保至少有4个中文字符的宽度
        descriptionHeader.style.wordBreak = 'break-word'; // 允许长文本自动换行

        const autoApproveHeader = document.createElement('th');
        autoApproveHeader.textContent = i18n.t('mcp.toolsList.autoApprove');
        autoApproveHeader.style.textAlign = 'center';
        autoApproveHeader.style.minWidth = '4em'; // 确保至少有4个中文字符的宽度

        headerRow.appendChild(indexHeader);
        headerRow.appendChild(nameHeader);
        headerRow.appendChild(descriptionHeader);
        headerRow.appendChild(autoApproveHeader);
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // 创建表格主体
        const tbody = document.createElement('tbody');

        // 获取当前服务的自动授权工具列表
        const currentServerConfig = this.currentServerId ? (this.mcpServers[this.currentServerId] || {}) : {};
        const autoApproveTools = currentServerConfig.autoApprove || [];

        // 对工具列表进行排序，将自动授权的工具排在前面
        const sortedToolDescriptions = [...toolDescriptions].sort((a, b) => {
            const aIsApproved = autoApproveTools.includes(a.name);
            const bIsApproved = autoApproveTools.includes(b.name);
            if (aIsApproved && !bIsApproved) return -1;
            if (!aIsApproved && bIsApproved) return 1;
            return 0;
        });

        // 添加每个工具到表格中
        const self = this; // 保存this引用以在事件处理程序中使用
        sortedToolDescriptions.forEach((tool, index) => {
            const row = document.createElement('tr');
            const toolName = tool.name || i18n.t('mcp.toolsList.unnamedTool');

            // 添加工具名称作为行的数据属性
            row.dataset.toolName = toolName;

            const indexCell = document.createElement('td');
            indexCell.textContent = index + 1;
            indexCell.style.minWidth = '2em'; // 确保至少有2个中文字符的宽度

            const nameCell = document.createElement('td');
            nameCell.textContent = toolName;
            nameCell.className = 'tool-name';
            nameCell.style.minWidth = '4em'; // 确保至少有4个中文字符的宽度
            nameCell.style.wordBreak = 'break-word'; // 允许长文本自动换行

            const descriptionCell = document.createElement('td');
            descriptionCell.textContent = tool.description || i18n.t('mcp.toolsList.noDescription');
            descriptionCell.className = 'tool-description';
            descriptionCell.style.minWidth = '4em'; // 确保至少有4个中文字符的宽度
            descriptionCell.style.wordBreak = 'break-word'; // 允许长文本自动换行

            const autoApproveCell = document.createElement('td');
            autoApproveCell.style.textAlign = 'center';
            autoApproveCell.style.minWidth = '4em'; // 确保至少有4个中文字符的宽度

            // 创建复选框
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'auto-approve-checkbox';
            checkbox.dataset.toolName = toolName;

            // 如果该工具在自动授权列表中，则勾选复选框
            checkbox.checked = autoApproveTools.includes(toolName);

            // 为已授权的工具行添加高亮样式
            if (autoApproveTools.includes(toolName)) {
                row.classList.add('tool-approved');
            }

            // 添加复选框状态变化事件
            checkbox.addEventListener('change', function () {
                self.updateAutoApproveStatus(toolName, this.checked);
            });

            autoApproveCell.appendChild(checkbox);

            row.appendChild(indexCell);
            row.appendChild(nameCell);
            row.appendChild(descriptionCell);
            row.appendChild(autoApproveCell);
            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        toolsList.appendChild(table);

        // 显示工具列表容器
        toolsContainer.classList.remove('hidden');
    }

    /**
     * 更新工具的自动授权状态
     * @param {string} toolName - 工具名称
     * @param {boolean} isApproved - 是否自动授权
     */
    async updateAutoApproveStatus(toolName, isApproved) {
        // 确保当前有选中的服务
        if (!this.currentServerId) return;

        // 获取当前服务配置
        const currentServerConfig = this.mcpServers[this.currentServerId];
        if (!currentServerConfig) return;

        // 初始化自动授权数组（如果不存在）
        if (!currentServerConfig.autoApprove) {
            currentServerConfig.autoApprove = [];
        }

        // 根据复选框状态添加或删除工具
        if (isApproved) {
            // 如果工具不在列表中，添加它
            if (!currentServerConfig.autoApprove.includes(toolName)) {
                currentServerConfig.autoApprove.push(toolName);
            }
        } else {
            // 如果工具在列表中，移除它
            const index = currentServerConfig.autoApprove.indexOf(toolName);
            if (index !== -1) {
                currentServerConfig.autoApprove.splice(index, 1);
            }
        }

        log.info('更新自动授权列表:', currentServerConfig.autoApprove);

        // 立即保存更改到配置文件
        try {
            // 准备要更新的服务数据
            const serverData = {
                ...currentServerConfig,
                autoApprove: currentServerConfig.autoApprove
            };

            // 更新服务器配置
            const success = await ipcRenderer.invoke('update-mcp-server', {
                serverId: this.currentServerId,
                serverData
            });

            if (success) {
                log.info('自动授权设置已保存');
            } else {
                log.error('保存自动授权设置失败');
            }
        } catch (error) {
            log.error('保存自动授权设置时出错:', error.message);
        }
    }

    /**
     * 初始化MCP服务事件监听器
     */
    initMcpEventListeners() {
        // 环境变量管理
        const addEnvBtn = document.querySelector('.add-env-btn');
        if (addEnvBtn) {
            addEnvBtn.addEventListener('click', () => {
                this.addEnvRow();
            });
        }

        // 命令行参数管理
        const addArgBtn = document.querySelector('.add-arg-btn');
        if (addArgBtn) {
            addArgBtn.addEventListener('click', () => {
                this.addArgRow();
            });
        }

        // 删除按钮事件委托
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-env') ||
                e.target.classList.contains('delete-arg')) {
                e.target.parentElement.remove();
            }
        });

        // 为serverPath输入框添加失去焦点时的路径规范化处理
        const serverPathInput = document.getElementById('serverPath');
        if (serverPathInput) {
            const self = this; // 保存this引用以在事件处理程序中使用
            serverPathInput.addEventListener('blur', function () {
                this.value = self.sanitizePath(this.value);
                self.updateTestButtonState();
            });

            // 添加serverPath输入框事件，监听输入变化实时更新测试按钮状态
            serverPathInput.addEventListener('input', () => {
                this.updateTestButtonState();
            });
        }

        // 保存MCP服务配置事件
        const saveMcpBtn = document.getElementById('saveMcpBtn');
        if (saveMcpBtn) {
            saveMcpBtn.addEventListener('click', async () => {
                await this.saveMcpServerConfig();
            });
        }

        // 删除MCP服务
        const deleteMcpServerBtn = document.getElementById('deleteMcpServerBtn');
        if (deleteMcpServerBtn) {
            deleteMcpServerBtn.addEventListener('click', async () => {
                await this.deleteMcpServer();
            });
        }

        // 测试MCP工具事件
        const testMcpButton = document.getElementById('test-mcp-button');
        if (testMcpButton) {
            testMcpButton.addEventListener('click', () => {
                this.directTestMcpTool();
            });
        }

        // 添加MCP服务按钮事件
        const addMcpServerBtn = document.getElementById('addMcpServerBtn');
        if (addMcpServerBtn) {
            addMcpServerBtn.addEventListener('click', () => {
                this.resetMcpServerForm();
            });
        }

        // 取消MCP服务按钮事件
        const cancelMcpBtn = document.getElementById('cancelMcpBtn');
        if (cancelMcpBtn) {
            cancelMcpBtn.addEventListener('click', () => {
                this.resetMcpServerForm();
            });
        }

        // 复制MCP服务按钮处理
        const copyMcpServerBtn = document.getElementById('copyMcpServerBtn');
        if (copyMcpServerBtn) {
            copyMcpServerBtn.addEventListener('click', async () => {
                await this.copyMcpServer();
            });
        }

        // 初始化测试按钮状态
        this.updateTestButtonState();
    }

    /**
     * 保存MCP服务配置
     */
    async saveMcpServerConfig() {
        try {
            const serverNameInput = document.getElementById('serverName');
            const serverPathInput = document.getElementById('serverPath');

            if (!serverNameInput || !serverPathInput) {
                log.error('服务名称或路径输入框不存在');
                return;
            }

            const serverName = serverNameInput.value;
            if (!serverName) {
                log.error('服务名称不能为空');
                return;
            }

            const serverPath = serverPathInput.value;
            if (!serverPath) {
                log.error('可执行路径不能为空');
                return;
            }

            // 获取环境变量
            const envVars = {};
            document.querySelectorAll('#envVarsContainer .key-value-row').forEach(row => {
                const key = row.querySelector('.env-key')?.value;
                const value = row.querySelector('.env-value')?.value;
                if (key) {
                    envVars[key] = value;
                }
            });

            // 获取命令行参数
            const args = [];
            document.querySelectorAll('#argsContainer .key-value-row').forEach(row => {
                const value = row.querySelector('.arg-value')?.value;
                if (value) {
                    args.push(value);
                }
            });

            // 获取自动授权工具列表
            let autoApprove = [];
            let toolDescriptions = [];
            if (this.currentServerId && this.mcpServers[this.currentServerId]) {
                // 使用当前内存中的自动授权列表
                autoApprove = this.mcpServers[this.currentServerId].autoApprove || [];
                // 使用当前内存中的工具描述
                toolDescriptions = this.mcpServers[this.currentServerId].toolDescriptions || [];
            }

            const serverData = {
                name: serverName,
                command: this.sanitizePath(serverPath),
                envs: envVars,
                args: args,
                // 保留其他可能的配置字段，使用当前值
                disabled: this.currentServerId && this.mcpServers[this.currentServerId]?.disabled,
                autoApprove: autoApprove,
                toolDescriptions: toolDescriptions
            };

            log.info('保存MCP服务配置:', serverData);

            try {
                let success;

                // 如果当前有选中的MCP服务ID，则更新该服务，否则添加新服务
                if (this.currentServerId) {
                    log.info('更新现有MCP服务:', this.currentServerId);
                    success = await ipcRenderer.invoke('update-mcp-server', {
                        serverId: this.currentServerId,
                        serverData
                    });
                } else {
                    log.info('添加新MCP服务');
                    success = await ipcRenderer.invoke('save-mcp-server', serverData);
                }

                log.info('保存MCP服务结果:', success);

                if (success) {
                    // 刷新服务列表
                    const updatedMcpConfig = await ipcRenderer.invoke('get-mcp-config');
                    log.info('刷新获取到的MCP配置:', updatedMcpConfig);

                    this.mcpServers = updatedMcpConfig?.servers || {};
                    this.activeMcps = updatedMcpConfig?.activeMcps || [];
                    this.updateMcpServerList();

                    // 当更新现有服务时，保持当前选中的服务
                    if (this.currentServerId) {
                        // 重新选中该服务以显示更新后的数据
                        this.selectMcpServer(this.currentServerId);
                    } else {
                        // 对于新添加的服务，重置表单
                        this.resetMcpServerForm();
                    }

                    // 尝试测试MCP工具以获取工具信息
                    try {
                        const testResult = await ipcRenderer.invoke('direct-test-mcp-tool', {
                            name: serverName,
                            command: this.sanitizePath(serverPath),
                            envs: envVars,
                            args: args
                        });

                        // 如果测试成功，使用测试结果中的工具信息显示工具列表
                        if (testResult && testResult.success && testResult.toolDescriptions) {
                            // 显示工具列表
                            this.displayToolsFromData(testResult.toolDescriptions);

                            // 将工具描述保存到内存和配置文件中
                            if (this.currentServerId && this.mcpServers[this.currentServerId]) {
                                // 更新内存中的工具描述
                                this.mcpServers[this.currentServerId].toolDescriptions = testResult.toolDescriptions;

                                // 更新配置文件中的工具描述
                                const updatedData = {
                                    ...this.mcpServers[this.currentServerId],
                                    toolDescriptions: testResult.toolDescriptions
                                };

                                // 保存到配置文件
                                await ipcRenderer.invoke('update-mcp-server', {
                                    serverId: this.currentServerId,
                                    serverData: updatedData
                                });

                                log.info('保存后获取的工具列表已保存到配置文件');
                            }

                            return;
                        }
                    } catch (testError) {
                        log.error('测试MCP服务失败:', testError);
                    }
                } else {
                    throw new Error('保存MCP服务配置失败，返回false');
                }
            } catch (saveError) {
                log.error('保存MCP服务配置时发生异常:', saveError);
                throw saveError;
            }
        } catch (error) {
            log.error('保存MCP服务配置时出错:', error.message);
        }
    }

    /**
     * 删除MCP服务
     */
    async deleteMcpServer() {
        try {
            const confirmDelete = confirm('确定要删除此MCP服务吗？');
            if (!confirmDelete) return;

            if (!this.currentServerId) {
                log.error('请先选择要删除的服务');
                return;
            }

            const success = await ipcRenderer.invoke('delete-mcp-server', this.currentServerId);
            if (success) {
                // 刷新服务列表
                const updatedMcpConfig = await ipcRenderer.invoke('get-mcp-config');
                this.mcpServers = updatedMcpConfig?.servers || {};
                this.activeMcps = updatedMcpConfig?.activeMcps || [];
                this.updateMcpServerList();
                this.resetMcpServerForm();
                // 规避删除后配置窗口无法输入问题
                ipcRenderer.invoke('reset-window-focus')
            } else {
                throw new Error('删除MCP服务失败');
            }
        } catch (error) {
            log.error('删除MCP服务时出错:', error.message);
        }
    }

    /**
     * 复制MCP服务
     */
    async copyMcpServer() {
        try {
            if (!this.currentServerId) return;

            const currentServer = this.mcpServers[this.currentServerId];
            if (!currentServer) return;

            // 创建一个复制的MCP服务对象
            const copiedServer = {
                name: `${currentServer.name} (复制)`,
                command: currentServer.command || '',
                envs: currentServer.envs ? { ...currentServer.envs } : {},
                args: currentServer.args ? [...currentServer.args] : []
            };

            // 保存新复制的MCP服务
            const success = await ipcRenderer.invoke('save-mcp-server', copiedServer);
            if (success) {
                // 刷新MCP服务列表
                const updatedMcpConfig = await ipcRenderer.invoke('get-mcp-config');
                this.mcpServers = updatedMcpConfig?.servers || {};
                this.activeMcps = updatedMcpConfig?.activeMcps || [];
                this.updateMcpServerList();

                // 清除当前选中状态
                this.currentServerId = null;
                document.getElementById('deleteMcpServerBtn')?.classList.add('hidden');
                document.getElementById('copyMcpServerBtn')?.classList.add('hidden');
                this.hideToolsList();

                // 填充复制的MCP服务数据
                document.getElementById('serverName').value = copiedServer.name;
                document.getElementById('serverPath').value = copiedServer.command || '';

                // 清空环境变量和参数容器
                document.getElementById('envVarsContainer').innerHTML = '';
                document.getElementById('argsContainer').innerHTML = '';

                // 添加环境变量
                if (copiedServer.envs) {
                    Object.entries(copiedServer.envs).forEach(([key, value]) => {
                        this.addEnvRow(key, value);
                    });
                }

                // 添加命令行参数
                if (copiedServer.args && Array.isArray(copiedServer.args)) {
                    copiedServer.args.forEach(arg => {
                        this.addArgRow(arg);
                    });
                }

                // 确保所有输入框可编辑
                document.querySelectorAll('#mcpServerForm input').forEach(input => {
                    input.readOnly = false;
                    input.disabled = false;
                });
                document.querySelectorAll('#envVarsContainer input').forEach(input => {
                    input.readOnly = false;
                    input.disabled = false;
                });
                document.querySelectorAll('#argsContainer input').forEach(input => {
                    input.readOnly = false;
                    input.disabled = false;
                });
            } else {
                throw new Error('复制MCP服务失败');
            }
        } catch (error) {
            log.error('复制MCP服务时出错:', error.message);
        }
    }

    /**
     * 设置活跃的MCP服务器列表
     * 
     * @param {Array} mcpServerIds - 要激活的MCP服务器ID数组
     */
    setActiveMcpServers(mcpServerIds) {
        if (Array.isArray(mcpServerIds) && mcpServerIds.length > 0) {
            // 更新当前活跃的MCP服务器列表
            this.activeMcps = mcpServerIds;
            log.info('从会话加载MCP服务器设置:', mcpServerIds);

            // 更新UI界面
            this.updateMcpServersList();

            // 通知主进程更新活跃的MCP服务器
            ipcRenderer.invoke('set-active-mcps', mcpServerIds).catch(error => {
                log.error('设置活跃MCP服务器失败:', error.message);
            });
        }
    }

    /**
     * 为特定会话更新MCP UI
     * 
     * 仅更新UI显示，不改变全局激活的MCP服务
     * 
     * @param {Array<string>} mcpServerIds - 会话使用的MCP服务器ID数组
     */
    updateMcpUIForSession(mcpServerIds) {
        if (!Array.isArray(mcpServerIds) || mcpServerIds.length === 0) {
            return;
        }

        log.info('更新会话MCP UI显示:', mcpServerIds);

        // 更新复选框状态，但不触发onChange事件
        const checkboxes = document.querySelectorAll('.mcp-server-checkbox');
        checkboxes.forEach(checkbox => {
            const serverId = checkbox.getAttribute('data-server-id');
            if (serverId) {
                // 设置复选框状态但不触发事件
                checkbox.checked = mcpServerIds.includes(serverId);
            }
        });

        // 更新下拉菜单显示
        this.updateMcpDropdownDisplay();
    }

    /**
     * 更新MCP下拉菜单显示
     */
    updateMcpDropdownDisplay() {
        const dropdownBtn = document.getElementById('mcp-dropdown-btn');
        if (!dropdownBtn) return;

        const checkedBoxes = document.querySelectorAll('.mcp-server-checkbox:checked');
        const count = checkedBoxes.length;

        // 更新按钮文本显示选中的MCP数量
        if (count === 0) {
            dropdownBtn.textContent = i18n.t('mcp.noServer');
            dropdownBtn.classList.add('no-server');
        } else {
            dropdownBtn.textContent = i18n.t('mcp.selectedServers', { count });
            dropdownBtn.classList.remove('no-server');
        }
    }
}

// 创建单例实例并导出
const mcpService = new McpService();
module.exports = mcpService;
