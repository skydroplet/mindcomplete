const { ipcRenderer } = require('electron');
const Logger = require('../main/logger');
const log = new Logger('config');
const i18n = require('../locales/i18n');

// 初始化UI文本的函数
function initUIText() {
    // 设置页面标题
    document.title = i18n.t('settings.title');

    // 设置标签栏文本
    document.querySelectorAll('.tab-link').forEach(tab => {
        const tabId = tab.getAttribute('data-tab');
        if (tabId) {
            tab.textContent = i18n.t(`settings.tabs.${tabId}`);
        }
    });

    // 处理所有带有data-i18n属性的元素
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            el.textContent = i18n.t(key);
            // 如果是按钮，也更新title属性
            if (el.tagName === 'BUTTON' && el.title) {
                el.title = i18n.t(key);
            }
        }
    });

    // 设置模型配置相关文本
    document.querySelectorAll('label[for]').forEach(label => {
        const forId = label.getAttribute('for');
        // 如果已经通过data-i18n处理过，则跳过
        if (forId && !label.hasAttribute('data-i18n')) {
            const key = `settings.labels.${forId}`;
            label.textContent = i18n.t(key);
        }
    });

    // 设置按钮文本
    document.querySelectorAll('button').forEach(button => {
        const id = button.id;
        // 如果已经通过data-i18n处理过，则跳过
        if (id && !button.hasAttribute('data-i18n')) {
            const key = `settings.buttons.${id}`;
            // 只有当翻译存在时才设置文本
            if (i18n.locales[i18n.currentLocale] && i18n.t(key) !== key) {
                button.textContent = i18n.t(key);
            }
        } else if (button.classList.contains('add-env-btn') && !button.hasAttribute('data-i18n')) {
            button.textContent = i18n.t('settings.buttons.add-env-btn');
        } else if (button.classList.contains('add-arg-btn') && !button.hasAttribute('data-i18n')) {
            button.textContent = i18n.t('settings.buttons.add-arg-btn');
        }
    });

    // 设置选项提示和占位符
    document.querySelectorAll('input[placeholder]').forEach(input => {
        const id = input.id;
        if (id) {
            const key = `settings.placeholders.${id}`;
            // 只有当翻译存在时才设置占位符
            if (i18n.locales[i18n.currentLocale] && i18n.t(key) !== key) {
                input.placeholder = i18n.t(key);
            }
        }
    });

    // 设置添加按钮的文本
    const addModelBtn = document.querySelector('#modelList option[value="add_new"]');
    if (addModelBtn) {
        addModelBtn.textContent = i18n.t('settings.buttons.addModelOption');
    }

    // 设置特定按钮文本
    const buttonMappings = {
        '#addModelBtn': 'settings.buttons.addModel',
        '#saveBtn': 'settings.buttons.saveBtn',
        '#cancelBtn': 'settings.buttons.cancelBtn',
        '#deleteModelBtn': 'settings.buttons.deleteModelBtn',
        '#addPromptBtn': 'settings.buttons.addPromptBtn',
        '#savePromptBtn': 'settings.buttons.savePromptBtn',
        '#cancelPromptBtn': 'settings.buttons.cancelPromptBtn',
        '#deletePromptBtn': 'settings.buttons.deletePromptBtn',
        '#addMcpServerBtn': 'settings.buttons.addMcpServerBtn',
        '#saveMcpBtn': 'settings.buttons.saveMcpBtn',
        '#cancelMcpBtn': 'settings.buttons.cancelMcpBtn',
        '#deleteMcpServerBtn': 'settings.buttons.deleteMcpServerBtn',
        '#test-mcp-button': 'settings.buttons.test-mcp-button',
        '#add-env-btn': 'settings.buttons.add-env-btn',
        '#add-arg-btn': 'settings.buttons.add-arg-btn'
    };

    for (const [selector, i18nKey] of Object.entries(buttonMappings)) {
        const button = document.querySelector(selector);
        if (button) {
            button.textContent = i18n.t(i18nKey);
        }
    }
}

function updateModelList(models) {
    const modelList = document.getElementById('modelList');
    modelList.innerHTML = '';

    Object.entries(models).forEach(([modelId, model]) => {
        const div = document.createElement('div');
        div.className = 'model-item';
        div.textContent = model.name;
        div.dataset.modelId = modelId;
        div.onclick = () => selectModel(modelId);
        modelList.appendChild(div);
    });
}

function selectModel(modelId) {
    window.currentModelId = modelId;
    const models = window.models || {};
    if (models[modelId]) {
        const model = models[modelId];
        document.getElementById('modelName').value = model.name;
        document.getElementById('modelType').value = model.type;
        document.getElementById('apiKey').value = model.apiKey || '';
        document.getElementById('apiUrl').value = model.apiBaseUrl || '';
        document.getElementById('contextWindowSize').value = (model.contextWindowSize || 4096) / 1000;
        document.getElementById('temperature').value = model.temperature || 0.7;

        // 显示删除按钮
        document.querySelector('.delete-btn').classList.remove('hidden');
    }
}

function updateDeleteButton() {
    const deleteBtn = document.querySelector('.delete-btn');
    const models = window.models || {};
    deleteBtn.classList.toggle('hidden', Object.keys(models).length === 0);
}

async function saveCurrentModel() {
    try {
        log.info('开始保存模型...');
        const model = {
            name: document.getElementById('modelName').value,
            type: document.getElementById('modelType').value,
            apiKey: document.getElementById('apiKey').value,
            apiBaseUrl: document.getElementById('apiUrl').value,
            contextWindowSize: parseInt(document.getElementById('contextWindowSize').value) * 1000,
            temperature: parseFloat(document.getElementById('temperature').value)
        };

        let success;

        if (window.currentModelId) {
            success = await ipcRenderer.invoke('update-model', {
                modelId: window.currentModelId,
                model
            });
        } else {
            success = await ipcRenderer.invoke('add-model', model);
        }

        log.info('保存操作结果:', success);
        if (success) {
            log.info('刷新模型列表...');
            const models = await ipcRenderer.invoke('get-models');
            log.info('获取到的模型列表:', JSON.stringify(models, null, 2));
            window.models = models;
            updateModelList(models);
        } else {
            throw new Error('保存失败');
        }
    } catch (error) {
        log.error('保存模型时出错:', error);
        alert('保存模型时出错: ' + error.message);
    }
}

function resetForm() {
    document.getElementById('modelForm').reset();
    window.currentModelId = null;
    document.querySelector('.delete-btn').classList.add('hidden');
}

function updateMcpServerList() {
    const serverList = document.getElementById('mcpServersList');
    serverList.innerHTML = '';

    log.info('最新mcp服务列表:', JSON.stringify(window.mcpConfig, null, 2));

    // 获取服务列表
    const mcpServers = window.mcpConfig?.servers || {};

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
        div.onclick = () => selectMcpServer(serverId);

        serverList.appendChild(div);
    });
}

function selectMcpServer(serverId) {
    window.currentServerId = serverId;
    const mcpServers = window.mcpConfig?.servers || {};
    const server = mcpServers[serverId];

    if (server) {
        document.getElementById('serverName').value = server.name;
        document.getElementById('serverPath').value = server.path || '';

        // 清空环境变量和参数容器
        document.getElementById('envVarsContainer').innerHTML = '';
        document.getElementById('argsContainer').innerHTML = '';

        // 添加环境变量
        if (server.env) {
            Object.entries(server.env).forEach(([key, value]) => {
                addEnvRow(key, value);
            });
        }

        // 添加命令行参数
        if (server.args && Array.isArray(server.args)) {
            server.args.forEach(arg => {
                addArgRow(arg);
            });
        }

        // 显示删除按钮
        document.getElementById('deleteMcpServerBtn').classList.remove('hidden');

        // 更新测试按钮状态
        updateTestButtonState();

        // 如果有可用工具列表或已保存的工具列表，尝试显示工具列表
        if (server.toolDescriptions && server.toolDescriptions.length > 0) {
            // 使用保存的工具描述显示工具列表
            displayToolsFromData(server.toolDescriptions);
        } else {
            // 没有预先加载的工具描述，隐藏工具列表
            hideToolsList();
        }
    }
}

function addEnvRow(key = '', value = '') {
    const container = document.getElementById('envVarsContainer');
    const div = document.createElement('div');
    div.className = 'key-value-row';
    div.innerHTML = `
        <input type="text" placeholder="${i18n.t('env.keyPlaceholder', 'Variable name')}" class="env-key" value="${key}">
        <span>:</span>
        <input type="text" placeholder="${i18n.t('env.valuePlaceholder', 'Variable value')}" class="env-value" value="${value}">
        <button type="button" class="delete-env">×</button>
    `;
    container.appendChild(div);
}

function addArgRow(value = '') {
    const container = document.getElementById('argsContainer');
    const div = document.createElement('div');
    div.className = 'key-value-row';
    div.innerHTML = `
        <input type="text" placeholder="${i18n.t('args.valuePlaceholder', 'Parameter value')}" class="arg-value" value="${value}">
        <button type="button" class="delete-arg">×</button>
    `;
    container.appendChild(div);
}

function updatePromptList(prompts) {
    const promptList = document.getElementById('promptList');
    promptList.innerHTML = '';

    Object.entries(prompts).forEach(([promptId, prompt]) => {
        const div = document.createElement('div');
        div.className = 'model-item';

        // 显示提示词名称及类型
        const nameSpan = document.createElement('span');
        nameSpan.textContent = prompt.name;

        const typeSpan = document.createElement('span');
        typeSpan.className = 'prompt-type-badge';
        typeSpan.textContent = prompt.type || 'system';  // 默认为system

        div.appendChild(nameSpan);
        div.appendChild(typeSpan);

        div.dataset.promptId = promptId;
        div.onclick = () => selectPrompt(promptId);
        promptList.appendChild(div);
    });
}

function selectPrompt(promptId) {
    window.currentPromptId = promptId;
    const prompts = window.prompts || {};
    if (prompts[promptId]) {
        const prompt = prompts[promptId];
        document.getElementById('promptName').value = prompt.name;
        document.getElementById('promptContent').value = prompt.content;

        // 设置提示词类型
        if (prompt.type) {
            document.getElementById('promptType').value = prompt.type;
        } else {
            document.getElementById('promptType').value = 'system'; // 默认为系统提示词
        }

        // 显示删除按钮
        document.querySelector('#deletePromptBtn').classList.remove('hidden');
    }
}

async function saveCurrentPrompt() {
    try {
        log.info('开始保存提示词...');
        const prompt = {
            name: document.getElementById('promptName').value,
            content: document.getElementById('promptContent').value,
            type: document.getElementById('promptType').value
        };

        let success;

        if (window.currentPromptId) {
            success = await ipcRenderer.invoke('update-prompt', {
                promptId: window.currentPromptId,
                prompt
            });
        } else {
            success = await ipcRenderer.invoke('add-prompt', prompt);
        }

        log.info('保存操作结果:', success);
        if (success) {
            log.info('刷新提示词列表...');
            const prompts = await ipcRenderer.invoke('get-all-prompts');
            log.info('获取到的提示词列表:', JSON.stringify(prompts, null, 2));
            window.prompts = prompts;
            updatePromptList(prompts);
            resetPromptForm();
        } else {
            throw new Error(i18n.t('errors.saveFailed'));
        }
    } catch (error) {
        log.error('保存提示词时出错:', error);
        alert(i18n.t('errors.promptSaveFailed', { error: error.message }));
    }
}

function resetPromptForm() {
    document.getElementById('promptForm').reset();
    window.currentPromptId = null;
    document.querySelector('#deletePromptBtn').classList.add('hidden');
}

// 添加函数用于规范化路径格式
function sanitizePath(inputPath) {
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

// 主题切换功能
function initThemeToggle() {
    const themeToggle = document.getElementById('theme-toggle');

    // 初始化主题
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    // 创建主题菜单
    const themeMenu = document.createElement('div');
    themeMenu.className = 'theme-menu';
    themeMenu.innerHTML = `
        <div class="theme-menu-item" data-theme-option="light">浅色</div>
        <div class="theme-menu-item" data-theme-option="dark">深色</div>
        <div class="theme-menu-item" data-theme-option="auto">自动</div>
    `;
    themeMenu.style.display = 'none';
    document.body.appendChild(themeMenu);

    // 系统主题变化监听器
    const systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemThemeMediaQuery.addEventListener('change', (e) => {
        if (localStorage.getItem('theme') === 'auto') {
            const newTheme = e.matches ? 'dark' : 'light';
            applyTheme('auto', newTheme);
        }
    });

    // 切换主题菜单显示
    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();

        // 显示或隐藏菜单
        if (themeMenu.style.display === 'none') {
            const rect = themeToggle.getBoundingClientRect();
            themeMenu.style.top = (rect.bottom + 5) + 'px';
            themeMenu.style.right = (window.innerWidth - rect.right) + 'px';
            themeMenu.style.display = 'block';

            // 标记当前选中的主题
            const currentTheme = localStorage.getItem('theme') || 'light';
            themeMenu.querySelectorAll('.theme-menu-item').forEach(item => {
                item.classList.toggle('active', item.dataset.themeOption === currentTheme);
            });
        } else {
            themeMenu.style.display = 'none';
        }
    });

    // 点击菜单项切换主题
    themeMenu.addEventListener('click', (e) => {
        if (e.target.classList.contains('theme-menu-item')) {
            const newTheme = e.target.dataset.themeOption;
            localStorage.setItem('theme', newTheme);

            if (newTheme === 'auto') {
                // 自动模式下，根据系统主题设置
                const systemTheme = systemThemeMediaQuery.matches ? 'dark' : 'light';
                applyTheme(newTheme, systemTheme);
            } else {
                applyTheme(newTheme);
            }

            // 通知主进程当前主题更改，以便更新主窗口的主题
            ipcRenderer.send('theme-changed', newTheme);
            themeMenu.style.display = 'none';
        }
    });

    // 点击页面其他区域关闭菜单
    document.addEventListener('click', () => {
        themeMenu.style.display = 'none';
    });
}

// 应用主题
function applyTheme(themeMode, actualTheme = null) {
    // 获取实际主题
    const theme = actualTheme || (themeMode === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : themeMode);

    // 应用主题
    document.documentElement.setAttribute('data-theme', theme);

    // 更新主题切换按钮图标
    updateThemeIcon(theme);

    // 更新代码高亮主题
    updateCodeHighlightTheme(theme);
}

// 更新主题切换按钮图标
function updateThemeIcon(themeMode) {
    const themeToggleIcon = document.getElementById('theme-toggle-icon');
    if (themeMode === 'dark') {
        themeToggleIcon.textContent = '🌒';
    } else if (themeMode === 'light') {
        themeToggleIcon.textContent = '☀️';
    } else if (themeMode === 'auto') {
        themeToggleIcon.textContent = '🌓';
    }
}

// 更新代码高亮主题
function updateCodeHighlightTheme(theme) {
    log.info(`开始更新代码高亮主题: ${theme}`);

    // 确定主题样式文件的路径
    let stylePath = theme === 'dark'
        ? './assets/highlight.js/styles/dracula.min.css'
        : './assets/highlight.js/styles/github.min.css';


    fetch(stylePath)
        .then(response => response.text())
        .then(cssContent => {
            // 创建新样式元素
            const styleElement = document.createElement('style');
            styleElement.id = 'highlight-theme';
            styleElement.textContent = cssContent;

            // 替换旧样式表
            highlightTheme.parentNode.replaceChild(styleElement, highlightTheme);

            log.info('高亮样式内容加载并应用完成');

            // 处理所有代码块
            document.querySelectorAll('pre code').forEach(block => {
                try {
                    hljs.highlightElement(block);
                } catch (error) {
                    log.error('高亮显示代码块失败:', error);
                }
            });
        })
        .catch(error => {
            log.error(`加载主题 ${theme} 失败:`, error);
        });
}

// 监听主题变化
ipcRenderer.on('apply-theme', (event, theme) => {
    document.documentElement.setAttribute('data-theme', theme === 'auto' ?
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme);
    localStorage.setItem('theme', theme);
    updateThemeIcon(theme);
    updateCodeHighlightTheme(theme === 'auto' ?
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme);
});

// 监听系统主题变化
ipcRenderer.on('system-theme-changed', (event, isDarkMode) => {
    if (localStorage.getItem('theme') === 'auto') {
        const newTheme = isDarkMode ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        updateCodeHighlightTheme(newTheme);
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        log.info('配置页面初始化...');
        window.models = {};
        window.mcpConfig = {};
        window.prompts = {};

        // 获取当前语言设置并应用
        try {
            const language = await ipcRenderer.invoke('get-language');
            if (language) {
                i18n.loadFromConfig(language);
                log.info('从配置加载语言设置:', language);
            }
        } catch (error) {
            log.error('获取语言设置失败:', error);
        }

        // 初始化UI文本
        initUIText();

        // 环境变量管理
        document.querySelector('.add-env-btn').addEventListener('click', () => {
            addEnvRow();
        });

        // 命令行参数管理
        document.querySelector('.add-arg-btn').addEventListener('click', () => {
            addArgRow();
        });

        // 删除按钮事件委托
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-env') ||
                e.target.classList.contains('delete-arg')) {
                e.target.parentElement.remove();
            }
        });

        // 为serverPath输入框添加失去焦点时的路径规范化处理
        document.getElementById('serverPath').addEventListener('blur', function () {
            this.value = sanitizePath(this.value);
            updateTestButtonState();
        });

        // 保存MCP服务配置事件
        document.getElementById('saveMcpBtn').addEventListener('click', async () => {
            try {
                const serverName = document.getElementById('serverName').value;
                if (!serverName) {
                    alert('服务名称不能为空');
                    return;
                }

                const serverPath = document.getElementById('serverPath').value;
                if (!serverPath) {
                    alert('可执行路径不能为空');
                    return;
                }

                // 获取环境变量
                const envVars = {};
                document.querySelectorAll('#envVarsContainer .key-value-row').forEach(row => {
                    const key = row.querySelector('.env-key').value;
                    const value = row.querySelector('.env-value').value;
                    if (key) {
                        envVars[key] = value;
                    }
                });

                // 获取命令行参数
                const args = [];
                document.querySelectorAll('#argsContainer .key-value-row').forEach(row => {
                    const value = row.querySelector('.arg-value').value;
                    if (value) {
                        args.push(value);
                    }
                });

                // 获取自动授权工具列表
                let autoApprove = [];
                let toolDescriptions = [];
                if (window.currentServerId && window.mcpConfig?.servers?.[window.currentServerId]) {
                    // 使用当前内存中的自动授权列表
                    autoApprove = window.mcpConfig.servers[window.currentServerId].autoApprove || [];
                    // 使用当前内存中的工具描述
                    toolDescriptions = window.mcpConfig.servers[window.currentServerId].toolDescriptions || [];
                }

                const serverData = {
                    name: serverName,
                    path: sanitizePath(serverPath),
                    env: envVars,
                    args: args,
                    // 保留其他可能的配置字段，使用当前值
                    disabled: window.currentServerId && window.mcpConfig?.servers?.[window.currentServerId]?.disabled,
                    autoApprove: autoApprove,
                    toolDescriptions: toolDescriptions
                };

                log.info('保存MCP服务配置:', serverData);

                try {
                    let success;

                    // 如果当前有选中的MCP服务ID，则更新该服务，否则添加新服务
                    if (window.currentServerId) {
                        log.info('更新现有MCP服务:', window.currentServerId);
                        success = await ipcRenderer.invoke('update-mcp-server', {
                            serverId: window.currentServerId,
                            serverData
                        });
                    } else {
                        log.info('添加新MCP服务');
                        success = await ipcRenderer.invoke('save-mcp-server', serverData);
                    }

                    log.info('保存MCP服务结果:', success);

                    if (success) {
                        // 刷新服务列表
                        const mcpConfig = await ipcRenderer.invoke('get-mcp-config');
                        log.info('刷新获取到的MCP配置:', mcpConfig);

                        window.mcpConfig = mcpConfig || { servers: {}, activeMcps: [] };
                        updateMcpServerList();

                        // 当更新现有服务时，保持当前选中的服务
                        if (window.currentServerId) {
                            // 重新选中该服务以显示更新后的数据
                            selectMcpServer(window.currentServerId);
                        } else {
                            // 对于新添加的服务，重置表单
                            resetMcpServerForm();
                        }

                        // 尝试测试MCP工具以获取工具信息
                        try {
                            const testResult = await ipcRenderer.invoke('direct-test-mcp-tool', {
                                name: serverName,
                                path: sanitizePath(serverPath),
                                env: envVars,
                                args: args
                            });

                            // 如果测试成功，使用测试结果中的工具信息显示工具列表
                            if (testResult && testResult.success && testResult.toolDescriptions) {
                                // 显示工具列表
                                displayToolsFromData(testResult.toolDescriptions);

                                // 将工具描述保存到内存和配置文件中
                                if (window.currentServerId && window.mcpConfig?.servers?.[window.currentServerId]) {
                                    // 更新内存中的工具描述
                                    window.mcpConfig.servers[window.currentServerId].toolDescriptions = testResult.toolDescriptions;

                                    // 更新配置文件中的工具描述
                                    const updatedData = {
                                        ...window.mcpConfig.servers[window.currentServerId],
                                        toolDescriptions: testResult.toolDescriptions
                                    };

                                    // 保存到配置文件
                                    await ipcRenderer.invoke('update-mcp-server', {
                                        serverId: window.currentServerId,
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
                log.error('保存MCP服务配置时出错:', error);
                alert('保存MCP服务配置失败: ' + error.message);
            }
        });

        // 删除MCP服务
        document.getElementById('deleteMcpServerBtn').addEventListener('click', async () => {
            try {
                const confirmDelete = confirm('确定要删除此MCP服务吗？');
                if (!confirmDelete) return;

                if (!window.currentServerId) {
                    alert('请先选择要删除的服务');
                    return;
                }

                const success = await ipcRenderer.invoke('delete-mcp-server', window.currentServerId);
                if (success) {
                    // 刷新服务列表
                    const mcpConfig = await ipcRenderer.invoke('get-mcp-config');
                    window.mcpConfig = mcpConfig || { servers: {}, activeMcps: [] };
                    updateMcpServerList();
                    resetMcpServerForm();
                } else {
                    throw new Error('删除MCP服务失败');
                }
            } catch (error) {
                log.error('删除MCP服务时出错:', error);
                alert('删除MCP服务失败: ' + error.message);
            }
        });

        // 测试MCP工具事件
        document.getElementById('test-mcp-button').addEventListener('click', directTestMcpTool);

        // 添加serverPath输入框事件，监听输入变化实时更新测试按钮状态
        document.getElementById('serverPath').addEventListener('input', updateTestButtonState);

        // 初始化测试按钮状态
        updateTestButtonState();

        // 初始化全局变量
        window.currentModelId = null;
        window.currentServerId = null;
        window.currentPromptId = null;
        window.models = {};
        window.mcpConfig = {};
        window.prompts = {};

        // 选项卡切换功能
        document.querySelectorAll('.tab-link').forEach(link => {
            link.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
                e.target.classList.add('active');
                const target = e.target.dataset.target;

                // 隐藏工具列表，除非正在切换到MCP服务选项卡并且已经有工具数据
                if (target !== 'mcp-servers') {
                    hideToolsList();
                }

                // 切换内容区域显示
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.style.display = content.id === target ? 'flex' : 'none';
                });

                // 不需要额外切换按钮显示，因为按钮已经包含在各自的内容区域中
            });
        });

        // 获取模型列表
        const models = await ipcRenderer.invoke('get-models');
        window.models = models;
        updateModelList(models);
        updateDeleteButton();

        // 获取MCP服务列表
        const mcpConfig = await ipcRenderer.invoke('get-mcp-config');
        window.mcpConfig = mcpConfig || { servers: {}, activeMcps: [] };
        updateMcpServerList();

        // 添加模型按钮事件
        document.getElementById('addModelBtn').addEventListener('click', () => {
            log.info('添加模型按钮被点击');
            resetForm();
        });

        // 添加MCP服务按钮事件
        document.getElementById('addMcpServerBtn').addEventListener('click', () => {
            resetMcpServerForm();
        });

        // 删除模型按钮事件
        document.getElementById('deleteModelBtn').addEventListener('click', async () => {
            log.info('删除按钮被点击');
            if (window.currentModelId) {
                if (confirm('确定要删除这个模型吗？')) {
                    try {
                        log.info('[Config] 开始删除模型, ID:', window.currentModelId);
                        const success = await ipcRenderer.invoke('delete-model', window.currentModelId);
                        log.info('[Config] 删除操作结果:', success);
                        if (success) {
                            log.info('[Config] 刷新模型列表...');
                            const models = await ipcRenderer.invoke('get-models');
                            log.info('[Config] 获取到的模型列表:', JSON.stringify(models, null, 2));
                            window.models = models;
                            updateModelList(models);
                            resetForm();
                            updateDeleteButton();
                        } else {
                            throw new Error('删除失败');
                        }
                    } catch (error) {
                        log.error('删除模型时出错:', error);
                        alert('删除模型时出错: ' + error.message);
                    }
                }
            }
        });

        // 保存模型按钮事件
        const saveBtn = document.getElementById('saveBtn');
        log.info('保存按钮元素:', saveBtn);
        saveBtn.addEventListener('click', () => {
            log.info('保存按钮被点击');
            saveCurrentModel();
        });

        // 取消按钮事件
        document.getElementById('cancelBtn').addEventListener('click', () => {
            log.info('取消按钮被点击');
            resetForm();
        });

        // 取消MCP服务按钮事件
        document.getElementById('cancelMcpBtn').addEventListener('click', () => {
            resetMcpServerForm();
        });

        // 初始化提示词相关事件
        document.getElementById('addPromptBtn').addEventListener('click', () => {
            resetPromptForm();
        });

        document.getElementById('savePromptBtn').addEventListener('click', () => {
            saveCurrentPrompt();
        });

        document.getElementById('cancelPromptBtn').addEventListener('click', () => {
            resetPromptForm();
        });

        document.getElementById('deletePromptBtn').addEventListener('click', async () => {
            if (window.currentPromptId && confirm(i18n.t('prompts.confirmDelete'))) {
                try {
                    const success = await ipcRenderer.invoke('delete-prompt', window.currentPromptId);
                    if (success) {
                        const prompts = await ipcRenderer.invoke('get-all-prompts');
                        window.prompts = prompts;
                        updatePromptList(prompts);
                        resetPromptForm();
                    }
                } catch (err) {
                    log.error('删除失败:', err);
                    alert(i18n.t('errors.deleteFailed', { error: err.message }));
                }
            }
        });

        // 加载提示词列表
        try {
            const prompts = await ipcRenderer.invoke('get-all-prompts');
            log.info('提示词列表:', prompts);
            window.prompts = prompts;
            updatePromptList(prompts);
        } catch (error) {
            log.error('加载提示词列表失败:', error);
        }

        // 初始化主题切换
        initThemeToggle();
    } catch (error) {
        log.error('初始化配置页面时出错:', error);
        alert('初始化配置页面时出错: ' + error.message);
    }
});

// 监听配置更新事件
ipcRenderer.on('config-updated', (event, data) => {
    log.info('收到配置更新:', data);
    if (data.models) {
        window.models = data.models;
        updateModelList(data.models.models || {});
    }
    if (data.mcpConfig) {
        window.mcpConfig = data.mcpConfig;
        updateMcpServerList();
    } else if (data.mcpServers) {
        // 兼容旧版数据格式
        window.mcpConfig = {
            servers: data.mcpServers,
            activeMcps: []
        };
        updateMcpServerList();
    }
});

// 监听标签页切换事件
ipcRenderer.on('switch-tab', (event, tabName) => {
    log.info('收到切换标签页请求:', tabName);

    // 查找并点击对应的标签页按钮
    const tabLinks = document.querySelectorAll('.tab-link');
    for (const link of tabLinks) {
        if (link.dataset.target === tabName) {
            link.click();
            break;
        }
    }
});

// 直接测试MCP工具
async function directTestMcpTool() {
    try {
        const testButton = document.getElementById('test-mcp-button');
        testButton.disabled = true;
        testButton.textContent = i18n.t('mcp.toolsList.testing');

        // 获取当前表单中的MCP服务配置
        let path = document.getElementById('serverPath').value.trim();

        // 使用sanitizePath函数规范化路径
        path = sanitizePath(path);

        // 如果路径为空，提前返回错误
        if (!path) {
            alert(i18n.t('errors.serverConfigIncomplete'));
            return;
        }

        const serverData = {
            name: document.getElementById('serverName').value || i18n.t('mcp.toolsList.title'),
            path: path,
            env: {},
            args: []
        };

        // 获取环境变量
        const envVars = {};
        document.querySelectorAll('#envVarsContainer .key-value-row').forEach(row => {
            const key = row.querySelector('.env-key').value;
            const value = row.querySelector('.env-value').value;
            if (key) {
                envVars[key] = value;
            }
        });
        serverData.env = envVars;

        // 获取命令行参数
        serverData.args = Array.from(document.querySelectorAll('#argsContainer .key-value-row')).map(row => {
            return row.querySelector('.arg-value').value;
        }).filter(arg => arg.trim() !== '');

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

            const resultMessage = `
${i18n.t('mcp.toolsList.testSuccess')}

${i18n.t('mcp.toolsList.serverName')}: ${result.serverName}

${i18n.t('mcp.toolsList.toolCount')}: ${result.tools}

${i18n.t('mcp.toolsList.toolList')}:
${formattedToolList}
`;
            alert(resultMessage);

            // 如果当前有选中的服务，将工具描述保存到服务配置中
            if (window.currentServerId && window.mcpConfig?.servers?.[window.currentServerId]) {
                // 将工具描述保存到当前服务配置中
                window.mcpConfig.servers[window.currentServerId].toolDescriptions = result.toolDescriptions;

                // 如果当前服务没有自动授权列表，初始化为空数组
                if (!window.mcpConfig.servers[window.currentServerId].autoApprove) {
                    window.mcpConfig.servers[window.currentServerId].autoApprove = [];
                }

                // 立即保存到配置文件中
                try {
                    // 准备要更新的服务数据
                    const updatedServerData = {
                        ...window.mcpConfig.servers[window.currentServerId],
                        toolDescriptions: result.toolDescriptions
                    };

                    // 更新服务器配置
                    const success = await ipcRenderer.invoke('update-mcp-server', {
                        serverId: window.currentServerId,
                        serverData: updatedServerData
                    });

                    if (success) {
                        log.info('工具列表已保存到配置文件');

                        // 刷新完整的MCP配置
                        const mcpConfig = await ipcRenderer.invoke('get-mcp-config');
                        window.mcpConfig = mcpConfig || { servers: {}, activeMcps: [] };
                    } else {
                        log.error('保存工具列表到配置文件失败');
                    }
                } catch (error) {
                    log.error('保存工具列表到配置文件时出错:', error);
                }
            }

            // 显示工具列表
            if (result.toolDescriptions && result.toolDescriptions.length > 0) {
                const toolsList = document.getElementById('toolsList');

                // 清空当前列表
                toolsList.innerHTML = '';

                // 使用共享函数显示工具列表
                displayToolsFromData(result.toolDescriptions);
            }
        }
    } finally {
        // 重置测试按钮状态
        const testButton = document.getElementById('test-mcp-button');
        testButton.disabled = false;
        testButton.textContent = i18n.t('mcp.toolsList.testButton');
    }
}

// 更新测试按钮状态函数
function updateTestButtonState() {
    const pathValue = document.getElementById('serverPath').value.trim();
    const testButton = document.getElementById('test-mcp-button');

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

// 隐藏工具列表
function hideToolsList() {
    const toolsContainer = document.getElementById('toolsListContainer');
    toolsContainer.classList.add('hidden');
}

// 重置MCP服务表单
function resetMcpServerForm() {
    document.getElementById('mcpServerForm').reset();
    document.getElementById('envVarsContainer').innerHTML = '';
    document.getElementById('argsContainer').innerHTML = '';
    document.getElementById('deleteMcpServerBtn').classList.add('hidden');
    window.currentServerId = null;
    hideToolsList();
}

// 显示工具列表
function displayToolsFromData(toolDescriptions) {
    const toolsContainer = document.getElementById('toolsListContainer');
    const toolsList = document.getElementById('toolsList');

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
    const currentServerId = window.currentServerId;
    const currentServerConfig = currentServerId ? (window.mcpConfig?.servers?.[currentServerId] || {}) : {};
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
            updateAutoApproveStatus(toolName, this.checked);
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

// 更新工具的自动授权状态
async function updateAutoApproveStatus(toolName, isApproved) {
    // 确保当前有选中的服务
    if (!window.currentServerId) return;

    // 获取当前服务配置
    const currentServerConfig = window.mcpConfig?.servers?.[window.currentServerId];
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
            serverId: window.currentServerId,
            serverData
        });

        if (success) {
            log.info('自动授权设置已保存');
        } else {
            log.error('保存自动授权设置失败');
        }
    } catch (error) {
        log.error('保存自动授权设置时出错:', error);
    }
}

// 监听语言更新事件
ipcRenderer.on('locale-updated', () => {
    // 重新初始化UI文本
    initUIText();
}); 