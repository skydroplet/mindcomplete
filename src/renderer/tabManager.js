/**
 * tabManager.js
 * 标签管理服务模块
 *
 * 该模块负责处理标签相关的所有功能，包括：
 * - 标签的创建和切换
 * - 标签的关闭和重命名
 * - 标签内容区域的管理
 * - 会话与标签的关联
 * - 标签过多时的下拉列表管理
 */

const Logger = require('../main/logger');
const log = new Logger('tabManager');
const i18n = require('../locales/i18n');
const ChatSessionService = require('./chatSession');
const InputManagerService = require('./inputManager');
const sidebarSessionService = require('./sidebarSession');

/**
 * 标签管理服务类
 * 负责管理聊天标签，包括创建、切换、关闭和重命名标签
 */
class TabManagerService {
    constructor() {
        // 初始化标签容器
        this.tabsContainer = document.getElementById('tabs-container');
        this.tabsContent = document.getElementById('tabs-content');
        this.newTabButton = document.getElementById('new-tab-button');

        // 活动标签
        this.activeTabId = 'tab-default';

        // 标签计数器
        this.tabCounter = 0;

        // 标签与会话的映射关系 {tabId: ChatSessionService实例}
        this.tabSessions = new Map();

        // 标签与会话ID的映射关系 {tabId: sessionId}
        this.tabSessionIds = new Map();

        // 标签下拉菜单相关参数
        this.showingTabs = new Set(); // 实际显示在标签栏中的标签
        this.hiddenTabs = new Set();  // 隐藏在下拉菜单中的标签
        this.tabsDropdownButton = null;
        this.tabsDropdownMenu = null;
        this.maxVisibleTabs = 0; // 最大可见标签数，初始化时计算

        // 窗口尺寸调整时重新计算标签显示
        window.addEventListener('resize', this.debounce(() => {
            this.calculateMaxVisibleTabs();
            this.updateTabsVisibility();

            // 如果菜单正在显示，更新其位置
            if (this.tabsDropdownMenu && this.tabsDropdownMenu.classList.contains('show')) {
                this.updateDropdownMenuPosition();
            }
        }, 200));

        // 初始化事件监听器
        this.initEventListeners();
    }

    /**
     * 防抖函数
     * @param {Function} func - 要执行的函数
     * @param {number} wait - 等待时间（毫秒）
     * @returns {Function} - 防抖后的函数
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * 初始化事件监听器
     */
    initEventListeners() {
        // 新建标签按钮点击事件
        this.newTabButton.addEventListener('click', () => {
            this.createNewTab();
            sidebarSessionService.loadSessions();
        });

        // 添加全局点击事件，用于关闭下拉菜单
        document.addEventListener('click', (e) => {
            // 防止即时冲突：如果是下拉按钮本身触发的点击，不要处理
            if (e.target === this.tabsDropdownButton) {
                return;
            }

            // 延迟处理点击事件，避免与toggleTabsDropdownMenu冲突
            setTimeout(() => {
                // 如果点击的不是下拉按钮和下拉菜单，则关闭下拉菜单
                if (this.tabsDropdownMenu &&
                    this.tabsDropdownMenu.classList.contains('show') &&
                    e.target !== this.tabsDropdownButton &&
                    !this.tabsDropdownMenu.contains(e.target)) {
                    log.info('全局点击事件：关闭下拉菜单');
                    this.toggleTabsDropdownMenu(false);
                }
            }, 50);
        });
    }

    /**
     * 初始化标签下拉菜单
     */
    initTabsDropdown() {
        // 创建标签下拉按钮
        this.tabsDropdownButton = document.createElement('button');
        this.tabsDropdownButton.className = 'tabs-dropdown-button';
        this.tabsDropdownButton.title = i18n.t('tabs.dropdown');
        this.tabsDropdownButton.innerHTML = '⋮'; // 垂直省略号

        // 修改下拉按钮的点击事件处理
        this.tabsDropdownButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            log.info('点击标签下拉按钮');

            // 强制切换下拉菜单的显示状态
            const shouldShow = !this.tabsDropdownMenu.classList.contains('show');
            this.toggleTabsDropdownMenu(shouldShow);

            // 防止事件冒泡和默认行为
            return false;
        });

        // 创建标签下拉菜单
        this.tabsDropdownMenu = document.createElement('div');
        this.tabsDropdownMenu.className = 'tabs-dropdown-menu';

        // 确保菜单有基本样式
        this.tabsDropdownMenu.style.display = 'none';
        this.tabsDropdownMenu.style.position = 'fixed';
        this.tabsDropdownMenu.style.zIndex = '1000';
        this.tabsDropdownMenu.style.backgroundColor = 'var(--container-bg, #fff)';
        this.tabsDropdownMenu.style.border = '1px solid var(--border-color, #ddd)';
        this.tabsDropdownMenu.style.borderRadius = '4px';
        this.tabsDropdownMenu.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
        this.tabsDropdownMenu.style.minWidth = '200px';
        this.tabsDropdownMenu.style.maxWidth = '350px';
        this.tabsDropdownMenu.style.maxHeight = '400px';
        this.tabsDropdownMenu.style.overflowY = 'auto';
        this.tabsDropdownMenu.style.padding = '8px 0';

        // 添加到DOM
        this.tabsContainer.appendChild(this.tabsDropdownButton);
        document.body.appendChild(this.tabsDropdownMenu);  // 将菜单添加到body，避免定位问题

        // 计算最大可见标签数
        this.calculateMaxVisibleTabs();
    }

    /**
     * 计算最大可见标签数
     * 考虑容器宽度、标签最小宽度、新建标签按钮和下拉菜单按钮的宽度
     */
    calculateMaxVisibleTabs() {
        if (!this.tabsContainer) return;

        const containerWidth = this.tabsContainer.clientWidth;
        const newTabButtonWidth = this.newTabButton ? this.newTabButton.offsetWidth : 32;
        const dropdownButtonWidth = 32;
        const minTabWidth = 128; // 与CSS中的min-width保持一致
        const marginRight = 2; // 每个标签的右边距

        // 可用宽度 = 容器宽度 - 新建标签按钮宽度 - 下拉菜单按钮宽度
        const availableWidth = containerWidth - newTabButtonWidth - dropdownButtonWidth;

        // 最大可见标签数 = 向下取整(可用宽度 / (标签最小宽度 + 右边距))
        this.maxVisibleTabs = Math.max(1, Math.floor(availableWidth / (minTabWidth + marginRight)));

        log.info(`计算最大可见标签数: 容器宽度=${containerWidth}, 可用宽度=${availableWidth}, 最大可见标签数=${this.maxVisibleTabs}`);
    }

    /**
     * 更新标签可见性
     * 如果标签数量超过最大可见数，则显示下拉菜单
     */
    updateTabsVisibility() {
        // 如果下拉按钮和菜单还没初始化，则初始化
        if (!this.tabsDropdownButton) {
            this.initTabsDropdown();
        }

        const tabs = Array.from(this.tabsContainer.querySelectorAll('.tab'));
        const totalTabs = tabs.length;

        // 如果标签数量不超过最大可见数，全部显示
        if (totalTabs <= this.maxVisibleTabs) {
            tabs.forEach(tab => {
                tab.style.display = 'inline-flex';
                this.showingTabs.add(tab.getAttribute('data-tab-id'));
                this.hiddenTabs.delete(tab.getAttribute('data-tab-id'));
            });

            // 隐藏下拉菜单按钮
            if (this.tabsDropdownButton) {
                this.tabsDropdownButton.style.display = 'none';
            }

            // 确保下拉菜单关闭
            this.toggleTabsDropdownMenu(false);
            return;
        }

        // 否则，只显示最大可见数量的标签，其余放入下拉菜单
        // 显示活动标签 + (最大可见数-1)个其他标签
        const activeTabIndex = tabs.findIndex(tab => tab.getAttribute('data-tab-id') === this.activeTabId);
        const tabsToShow = new Set();

        // 优先显示活动标签
        if (activeTabIndex !== -1) {
            tabsToShow.add(this.activeTabId);
        }

        // 如果还有剩余位置，从左到右填充
        if (tabsToShow.size < this.maxVisibleTabs) {
            const remainingSlots = this.maxVisibleTabs - tabsToShow.size;
            let count = 0;
            for (let i = 0; i < tabs.length && count < remainingSlots; i++) {
                const tabId = tabs[i].getAttribute('data-tab-id');
                if (!tabsToShow.has(tabId)) {
                    tabsToShow.add(tabId);
                    count++;
                }
            }
        }

        // 更新标签可见性
        this.showingTabs.clear();
        this.hiddenTabs.clear();
        tabs.forEach(tab => {
            const tabId = tab.getAttribute('data-tab-id');
            if (tabsToShow.has(tabId)) {
                tab.style.display = 'inline-flex';
                this.showingTabs.add(tabId);
            } else {
                tab.style.display = 'none';
                this.hiddenTabs.add(tabId);
            }
        });

        // 显示下拉菜单按钮
        if (this.tabsDropdownButton) {
            this.tabsDropdownButton.style.display = 'flex';

            // 打印显示和隐藏的标签信息
            log.info(`显示的标签: ${Array.from(this.showingTabs).join(', ')}`);
            log.info(`隐藏的标签: ${Array.from(this.hiddenTabs).join(', ')}`);
        }

        // 更新下拉菜单内容
        this.updateTabsDropdownMenu();
    }

    /**
     * 更新标签下拉菜单内容
     */
    updateTabsDropdownMenu() {
        if (!this.tabsDropdownMenu) return;

        this.tabsDropdownMenu.innerHTML = '';

        // 检查是否有隐藏的标签
        if (this.hiddenTabs.size === 0) {
            // 如果没有隐藏的标签，显示一个提示信息
            const emptyItem = document.createElement('div');
            emptyItem.className = 'tabs-dropdown-item tabs-dropdown-empty';
            emptyItem.textContent = i18n.t('tabs.noTabs');

            // 设置空状态样式
            emptyItem.style.padding = '8px 12px';
            emptyItem.style.color = 'var(--text-color-secondary, #888)';
            emptyItem.style.textAlign = 'center';
            emptyItem.style.fontStyle = 'italic';

            this.tabsDropdownMenu.appendChild(emptyItem);
            return;
        }

        // 将隐藏的标签添加到下拉菜单
        this.hiddenTabs.forEach(tabId => {
            const tab = document.getElementById(tabId);
            if (!tab) return;

            const tabName = tab.querySelector('.tab-name')?.textContent || '';
            const isActive = tabId === this.activeTabId;

            const dropdownItem = document.createElement('div');
            dropdownItem.className = `tabs-dropdown-item${isActive ? ' active' : ''}`;
            dropdownItem.setAttribute('data-tab-id', tabId);

            // 设置菜单项样式
            dropdownItem.style.display = 'flex';
            dropdownItem.style.alignItems = 'center';
            dropdownItem.style.justifyContent = 'space-between';
            dropdownItem.style.padding = '8px 12px';
            dropdownItem.style.cursor = 'pointer';
            dropdownItem.style.whiteSpace = 'nowrap';
            dropdownItem.style.overflow = 'hidden';
            dropdownItem.style.textOverflow = 'ellipsis';
            dropdownItem.style.color = 'var(--text-color, #333)';

            // 设置活动项的样式
            if (isActive) {
                dropdownItem.style.backgroundColor = 'var(--tab-active-bg, #fff)';
                dropdownItem.style.fontWeight = 'bold';
            }

            // 设置悬停效果
            dropdownItem.addEventListener('mouseover', () => {
                dropdownItem.style.backgroundColor = 'var(--tab-inactive-bg, #e6e6e6)';
            });

            dropdownItem.addEventListener('mouseout', () => {
                if (isActive) {
                    dropdownItem.style.backgroundColor = 'var(--tab-active-bg, #fff)';
                } else {
                    dropdownItem.style.backgroundColor = '';
                }
            });

            // 创建名称和关闭按钮
            const nameSpan = document.createElement('span');
            nameSpan.className = 'tabs-dropdown-item-name';
            nameSpan.textContent = tabName;
            nameSpan.style.overflow = 'hidden';
            nameSpan.style.textOverflow = 'ellipsis';
            nameSpan.style.flexGrow = '1';

            const closeSpan = document.createElement('span');
            closeSpan.className = 'tabs-dropdown-item-close';
            closeSpan.textContent = '×';
            closeSpan.style.marginLeft = '8px';
            closeSpan.style.opacity = '0.6';
            closeSpan.style.width = '18px';
            closeSpan.style.height = '18px';
            closeSpan.style.lineHeight = '18px';
            closeSpan.style.textAlign = 'center';
            closeSpan.style.borderRadius = '50%';

            // 关闭按钮悬停效果
            closeSpan.addEventListener('mouseover', (e) => {
                e.stopPropagation();
                closeSpan.style.opacity = '1';
                closeSpan.style.backgroundColor = 'var(--tab-close-hover-bg, #ccc)';
            });

            closeSpan.addEventListener('mouseout', (e) => {
                e.stopPropagation();
                closeSpan.style.opacity = '0.6';
                closeSpan.style.backgroundColor = '';
            });

            dropdownItem.appendChild(nameSpan);
            dropdownItem.appendChild(closeSpan);

            // 点击项目切换到对应标签
            dropdownItem.addEventListener('click', (e) => {
                if (e.target === closeSpan) {
                    // 点击关闭按钮
                    e.stopPropagation();
                    this.closeTab(tabId);
                } else {
                    // 点击标签项
                    this.activateTab(tabId);
                    this.toggleTabsDropdownMenu(false);
                }
            });

            this.tabsDropdownMenu.appendChild(dropdownItem);
        });

        // 更新下拉菜单位置
        this.updateDropdownMenuPosition();
    }

    /**
     * 切换标签下拉菜单的显示状态
     * @param {boolean} [show] - 是否显示，不提供则切换显示状态
     */
    toggleTabsDropdownMenu(show) {
        if (!this.tabsDropdownMenu) return;

        const wasShown = this.tabsDropdownMenu.classList.contains('show');

        if (typeof show === 'boolean') {
            this.tabsDropdownMenu.classList.toggle('show', show);
        } else {
            this.tabsDropdownMenu.classList.toggle('show');
        }

        const isShown = this.tabsDropdownMenu.classList.contains('show');

        // 记录下拉菜单的状态变化
        log.info(`标签下拉菜单状态: ${wasShown ? '显示' : '隐藏'} -> ${isShown ? '显示' : '隐藏'}`);

        // 如果显示下拉菜单，更新内容并阻止菜单外点击立即关闭
        if (isShown) {
            // 确保菜单显示在正确位置
            this.updateDropdownMenuPosition();

            // 更新菜单内容
            this.updateTabsDropdownMenu();

            // 确保点击菜单内部不会关闭菜单
            const stopPropagation = (e) => {
                e.stopPropagation();
            };

            // 添加一次性事件监听器，在当前事件循环结束后移除
            this.tabsDropdownMenu.addEventListener('click', stopPropagation);

            // 确保菜单可见
            setTimeout(() => {
                if (this.tabsDropdownMenu && !this.tabsDropdownMenu.classList.contains('show')) {
                    log.info('菜单意外关闭，尝试重新打开');
                    this.tabsDropdownMenu.classList.add('show');
                    this.updateDropdownMenuPosition();
                }
            }, 10);
        }
    }

    /**
     * 更新下拉菜单位置
     * 根据下拉按钮的位置更新下拉菜单的位置
     */
    updateDropdownMenuPosition() {
        if (!this.tabsDropdownButton || !this.tabsDropdownMenu) return;

        const buttonRect = this.tabsDropdownButton.getBoundingClientRect();

        // 当标签位于header中时，将下拉菜单定位在按钮下方而不是上方
        this.tabsDropdownMenu.style.top = `${buttonRect.bottom + 2}px`;
        this.tabsDropdownMenu.style.left = `${buttonRect.right - this.tabsDropdownMenu.offsetWidth}px`;

        // 确保菜单不会超出窗口右侧
        const rightEdge = buttonRect.right;
        const windowWidth = window.innerWidth;
        if (rightEdge > windowWidth) {
            const adjustment = rightEdge - windowWidth + 10; // 10px额外边距
            this.tabsDropdownMenu.style.left = `${parseInt(this.tabsDropdownMenu.style.left) - adjustment}px`;
        }

        // 确保菜单不会超出窗口底部
        const menuBottom = buttonRect.bottom + 2 + this.tabsDropdownMenu.offsetHeight;
        const windowHeight = window.innerHeight;
        if (menuBottom > windowHeight) {
            // 如果下方空间不足，将菜单显示在按钮上方
            this.tabsDropdownMenu.style.top = `${buttonRect.top - this.tabsDropdownMenu.offsetHeight - 2}px`;
        }
    }

    /**
     * 初始化标签管理器
     * @param {ChatSessionService} initialSession 初始会话实例
     */
    async initTabManager(initialSession) {
        // 创建第一个标签和内容
        this.tabCounter = 1;
        const firstTabId = 'tab-1';
        const firstSessionId = initialSession.sessionId;
        const firstSessionName = initialSession.data.name || i18n.t('tabs.newSession');

        this.tabSessions.set(firstTabId, initialSession);
        this.tabSessionIds.set(firstTabId, firstSessionId);

        // 创建标签DOM元素
        const tabElement = this.createTabElement(firstTabId, firstSessionName);
        this.tabsContainer.insertBefore(tabElement, this.newTabButton);

        // 创建内容区域
        const contentElement = this.createTabContentElement(firstTabId);
        this.tabsContent.appendChild(contentElement);

        // 初始化第一个标签的下拉菜单
        await this.initTabSpecificDropdowns(firstTabId);

        // 设置标签和会话的关系
        initialSession.setTabId(firstTabId);

        // 设置第一个标签为活动标签
        this.activeTabId = firstTabId;
        this.activateTab(firstTabId);

        // 初始化标签下拉菜单并计算可见标签数
        this.initTabsDropdown();

        // 更新标签可见性
        this.updateTabsVisibility();
    }

    /**
     * 初始化标签特定的下拉菜单
     * @param {string} tabId 标签ID
     */
    async initTabSpecificDropdowns(tabId) {
        try {
            log.info(`初始化标签 ${tabId} 的下拉菜单`);
            const session = this.tabSessions.get(tabId);

            // 初始化各类下拉菜单
            await this.initModelDropdown(tabId, session);
            await this.initPromptDropdown(tabId, session);
            await this.initMcpDropdown(tabId, session);
            await this.initConversationModeToggle(tabId, session);

            const newSessionBtn = document.getElementById(`new-session-btn-${tabId}`);
            newSessionBtn.addEventListener('click', () => {
                this.createNewTab();
                sidebarSessionService.loadSessions();
            });

            log.info(`标签 ${tabId} 的下拉菜单初始化完成`);
        } catch (error) {
            log.error(`初始化标签 ${tabId} 下拉菜单时出错:`, error.message);
        }
    }

    /**
     * 通用方法：初始化和更新模型下拉选择器
     * @param {HTMLSelectElement} select 下拉元素
     * @param {string} tabId 标签ID
     * @returns {Promise<void>}
     */
    async setModelDropdown(select, tabId) {
        try {
            // 获取所有模型
            const models = await ipcRenderer.invoke('get-models');
            log.info("模型列表：", models);

            // 清空并重新填充下拉框
            select.innerHTML = `<option value="add_new">${i18n.t('settings.buttons.addModelOption')}</option>`;

            // 添加所有模型
            Object.entries(models || {}).forEach(([modelId, model]) => {
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = model.name;
                select.appendChild(option);
            });

            // 获取当前会话选择的模型
            const session = this.tabSessions.get(tabId);
            const sessionConfig = await session.getConfig();
            select.value = sessionConfig.modelId;
            log.info(`当前会话 ${session.data.id} ${session.data.name} 使用的模型：${sessionConfig.modelId}`);
        } catch (error) {
            log.error("初始化或刷新模型下拉菜单时出错:", error.message);
            throw error;
        }
    }

    /**
     * 初始化模型下拉菜单
     * @param {string} tabId 标签ID
     * @param {ChatSessionService} session 会话实例
     */
    async initModelDropdown(tabId, session) {
        const modelSelect = document.getElementById(`model-select-${tabId}`);
        if (!modelSelect || !window.modelService) return;

        try {
            // 初始化下拉框
            await this.setModelDropdown(modelSelect, tabId);

            // 添加选择事件监听器
            modelSelect.addEventListener('change', async (e) => {
                const modelId = e.target.value;

                if (modelId === "add_new") {
                    // 重置选择框
                    const session = this.tabSessions.get(tabId);
                    const sessionConfig = await session.getConfig();
                    modelSelect.value = sessionConfig.modelId;

                    // 打开配置窗口的模型标签页
                    window.openSettingsWindowWithTab('models');
                } else if (modelId) {
                    log.info(`选择模型 ${session.data.id} ${session.data.name} ${modelId}`);
                    await ipcRenderer.invoke('select-session-model', session.data.id, modelId);
                }
            });

            // 添加点击事件监听器，在下拉框打开时刷新模型列表
            modelSelect.addEventListener('mousedown', async (event) => {
                await this.setModelDropdown(modelSelect, tabId);
            });
        } catch (error) {
            log.error(`初始化标签 ${tabId} 的模型下拉菜单时出错:`, error.message);
        }
    }

    /**
     * 通用方法：初始化和更新提示词下拉选择器
     * @param {HTMLSelectElement} select 下拉元素
     * @param {string} tabId 标签ID
     * @returns {Promise<void>}
     */
    async setPromptDropdown(select, tabId) {
        try {
            // 获取所有提示词
            const prompts = await ipcRenderer.invoke('get-prompts');
            log.info("提示词列表：", prompts);

            // 清空并重新填充下拉框
            select.innerHTML = `<option value="add_new">${i18n.t('prompts.addNew')}</option>`;

            // 添加所有提示词
            Object.entries(prompts || {}).forEach(([promptId, prompt]) => {
                const option = document.createElement('option');
                option.value = promptId;
                option.textContent = prompt.name;
                select.appendChild(option);
            });

            // 获取当前会话选择的提示词
            const session = this.tabSessions.get(tabId);
            const sessionConfig = await session.getConfig();
            select.value = sessionConfig.promptId;
            log.info(`当前会话 ${session.data.id} ${session.data.name} 使用的提示词：${sessionConfig.promptId}`);
        } catch (error) {
            log.error("初始化或刷新提示词下拉菜单时出错:", error.message);
            throw error;
        }
    }

    /**
     * 初始化提示词下拉菜单
     * @param {string} tabId 标签ID
     * @param {ChatSessionService} session 会话实例
     */
    async initPromptDropdown(tabId, session) {
        const promptSelect = document.getElementById(`prompt-select-${tabId}`);
        if (!promptSelect || !window.promptService) return;

        try {
            // 初始化下拉框
            await this.setPromptDropdown(promptSelect, tabId);

            // 添加选择事件监听器
            promptSelect.addEventListener('change', async (e) => {
                const promptId = e.target.value;

                // 处理选择添加提示词的情况
                if (promptId === 'add_new') {
                    // 重置选择框
                    const session = this.tabSessions.get(tabId);
                    const sessionConfig = await session.getConfig();
                    promptSelect.value = sessionConfig.promptId;

                    // 打开配置窗口
                    window.openSettingsWindowWithTab('prompts');
                    return;
                } else {
                    log.info(`选择提示词 ${session.data.id} ${session.data.name} ${promptId}`);
                    await ipcRenderer.invoke('select-session-prompt', session.data.id, promptId);
                }
            });

            // 添加点击事件监听器，在下拉框打开时刷新提示词列表
            promptSelect.addEventListener('mousedown', async (event) => {
                await this.setPromptDropdown(promptSelect, tabId);
            });
        } catch (error) {
            log.error(`初始化标签 ${tabId} 的提示词下拉菜单时出错:`, error.message);
        }
    }

    /**
     * 通用方法：初始化和更新MCP下拉选择器
     * @param {HTMLElement} mcpDropdownBtn MCP下拉按钮
     * @param {HTMLElement} mcpDropdownContent MCP下拉内容
     * @param {string} tabId 标签ID
     * @returns {Promise<void>}
     */
    async setMcpDropdown(mcpDropdownBtn, mcpDropdownContent, tabId) {
        try {
            // 获取MCP服务器列表
            const mcpServers = await ipcRenderer.invoke('get-mcp-servers');
            log.info("MCP服务数量：", mcpServers.length);

            // 获取当前会话的MCP服务列表
            const session = this.tabSessions.get(tabId);
            const sessionConfig = await session.getConfig();
            const sessionMcpServers = sessionConfig.mcpServers;
            log.info(`当前会话 ${session.data.id} ${session.data.name} 的MCP服务列表：${sessionMcpServers}`);

            // 保存当前的显示状态
            const wasShown = mcpDropdownContent.classList.contains('show');

            // 清空内容
            mcpDropdownContent.innerHTML = '';

            // 设置基础样式，但保留show类
            if (wasShown) {
                mcpDropdownContent.className = 'mcp-dropdown-content show';
            } else {
                mcpDropdownContent.className = 'mcp-dropdown-content';
            }

            // 确保下拉内容的样式正确
            mcpDropdownContent.style.position = 'absolute';
            mcpDropdownContent.style.zIndex = '1000';

            // 根据显示状态设置display属性
            mcpDropdownContent.style.display = wasShown ? 'block' : 'none';

            // 添加"添加MCP服务"选项
            const addServerOption = document.createElement('div');
            addServerOption.className = 'mcp-server-item add-server-item';
            addServerOption.textContent = i18n.t('mcp.addServer') || '添加MCP服务';
            addServerOption.addEventListener('click', () => {
                window.openSettingsWindowWithTab('mcp-servers');

                // 确保正确关闭下拉菜单
                mcpDropdownContent.classList.remove('show');
                mcpDropdownContent.style.display = 'none';
                log.info(`关闭MCP下拉菜单(添加服务选项点击): ${tabId}`);
            });
            mcpDropdownContent.appendChild(addServerOption);

            // 添加MCP服务器
            Object.entries(mcpServers || {}).forEach(([serverId, server]) => {
                const option = document.createElement('div');
                option.className = 'mcp-server-item';

                // 创建一个容器来包含复选框和文本，使其布局更好
                const container = document.createElement('label');
                container.className = 'mcp-server-container';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'mcp-server-checkbox';
                checkbox.setAttribute('data-server-id', serverId);
                checkbox.checked = sessionMcpServers.includes(serverId);  // 使用会话特定的MCP服务列表

                checkbox.addEventListener('change', async (e) => {
                    const isChecked = e.target.checked;
                    const serverId = checkbox.getAttribute('data-server-id');
                    log.info(`切换MCP服务 ${serverId} 状态为: ${isChecked}`);

                    try {
                        // 获取当前所有选中的服务ID
                        const allCheckedServerIds = Array.from(
                            mcpDropdownContent.querySelectorAll('.mcp-server-checkbox:checked')
                        ).map(cb => cb.getAttribute('data-server-id'));

                        log.info(`当前选中的所有MCP服务: ${JSON.stringify(allCheckedServerIds)}`);

                        // 使用select-session-mcp-servers接口，与模型和提示词流程保持一致
                        await ipcRenderer.invoke('select-session-mcp-servers', session.data.id, allCheckedServerIds);
                        log.info(`已向会话 ${session.data.id} ${session.data.name} 应用MCP服务列表：${JSON.stringify(allCheckedServerIds)}`);

                        // 更新按钮显示
                        this.updateMcpButtonDisplay(mcpDropdownBtn, mcpDropdownContent);
                    } catch (error) {
                        log.error(`切换MCP服务状态时出错:`, error.message);
                        // 恢复复选框状态
                        e.target.checked = !isChecked;
                    }
                });

                const nameSpan = document.createElement('span');
                nameSpan.textContent = server.name;
                nameSpan.className = 'mcp-server-name';

                container.appendChild(checkbox);
                container.appendChild(nameSpan);
                option.appendChild(container);

                mcpDropdownContent.appendChild(option);
            });

            // 更新按钮显示
            this.updateMcpButtonDisplay(mcpDropdownBtn, mcpDropdownContent);
        } catch (error) {
            log.error(`更新MCP下拉菜单时出错:`, error.message);
            throw error;
        }
    }

    /**
     * 初始化MCP服务下拉菜单
     * @param {string} tabId 标签ID
     * @param {ChatSessionService} session 会话实例
     */
    async initMcpDropdown(tabId, session) {
        const mcpDropdownBtn = document.getElementById(`mcp-dropdown-btn-${tabId}`);
        const mcpDropdownContent = document.getElementById(`mcp-dropdown-content-${tabId}`);
        if (!mcpDropdownBtn || !mcpDropdownContent || !window.mcpService) return;

        try {
            // 初始化下拉内容
            await this.setMcpDropdown(mcpDropdownBtn, mcpDropdownContent, tabId);

            // 添加点击事件监听器
            mcpDropdownBtn.addEventListener('click', async (event) => {
                try {
                    // 防止事件冒泡，避免立即触发文档点击事件
                    event.stopPropagation();

                    // 获取当前显示状态
                    const isShown = mcpDropdownContent.classList.contains('show');

                    // 根据当前状态切换显示/隐藏
                    if (!isShown) {
                        // 显示前先更新内容
                        await this.setMcpDropdown(mcpDropdownBtn, mcpDropdownContent, tabId);

                        // 修改样式和类
                        mcpDropdownContent.style.display = 'block';
                        mcpDropdownContent.classList.add('show');
                        log.info(`显示MCP下拉菜单: ${tabId}`);
                    } else {
                        // 隐藏菜单
                        mcpDropdownContent.style.display = 'none';
                        mcpDropdownContent.classList.remove('show');
                        log.info(`隐藏MCP下拉菜单: ${tabId}`);
                    }
                } catch (error) {
                    log.error(`获取会话 ${session.data.id} MCP服务列表失败:`, error.message);
                }
            });

            // 添加文档点击事件，点击外部区域时关闭下拉菜单
            document.addEventListener('click', (event) => {
                // 如果点击的不是下拉按钮和下拉内容区域
                if (mcpDropdownContent.classList.contains('show') &&
                    !mcpDropdownBtn.contains(event.target) &&
                    !mcpDropdownContent.contains(event.target)) {
                    // 关闭下拉菜单
                    mcpDropdownContent.style.display = 'none';
                    mcpDropdownContent.classList.remove('show');
                    log.info(`关闭MCP下拉菜单(点击外部区域): ${tabId}`);
                }
            });

            // 阻止下拉内容区域的点击事件冒泡
            mcpDropdownContent.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        } catch (error) {
            log.error(`初始化标签 ${tabId} 的MCP下拉菜单时出错:`, error.message);
        }
    }

    /**
     * 更新MCP按钮显示
     * @param {HTMLElement} mcpDropdownBtn MCP下拉按钮
     * @param {HTMLElement} mcpDropdownContent MCP下拉内容
     */
    updateMcpButtonDisplay(mcpDropdownBtn, mcpDropdownContent) {
        const checkboxEvents = mcpDropdownContent.querySelectorAll('.mcp-server-checkbox:checked');
        if (checkboxEvents.length === 0) {
            mcpDropdownBtn.classList.add('no-server');
        } else {
            mcpDropdownBtn.classList.remove('no-server');
        }
        mcpDropdownBtn.className = 'mcp-dropdown-btn';

        // 清空按钮内容，创建文本容器
        mcpDropdownBtn.innerHTML = '';

        // 创建文本容器
        const textContainer = document.createElement('span');
        textContainer.className = 'dropdown-text';

        // 设置文本内容
        if (checkboxEvents.length === 0) {
            textContainer.textContent = i18n.t('mcp.noServer');
            mcpDropdownBtn.classList.add('no-server');
        } else {
            textContainer.textContent = i18n.t('mcp.selectedServers', { count: checkboxEvents.length });
            mcpDropdownBtn.classList.remove('no-server');
        }

        // 将文本容器添加到按钮
        mcpDropdownBtn.appendChild(textContainer);
    }

    /**
     * 创建新标签
     * @param {string} sessionId 可选的会话ID，如果提供则加载这个会话到新标签
     * @returns {string} 新创建的标签ID
     */
    async createNewTab(sessionId = null) {
        this.tabCounter++;
        const tabId = `tab-${this.tabCounter}`;

        // 创建标签DOM元素
        const tabName = sessionId ? '加载中...' : i18n.t('tabs.newSession');
        const tabElement = this.createTabElement(tabId, tabName);

        // 添加到标签容器
        this.tabsContainer.insertBefore(tabElement, this.newTabButton);

        // 创建内容区域
        const contentElement = this.createTabContentElement(tabId);
        this.tabsContent.appendChild(contentElement);

        // 创建/加载会话信息
        const chatSession = new ChatSessionService(sessionId);
        if (sessionId) {
            await chatSession.loadSession();
        } else {
            await chatSession.createNewSession();
        }

        chatSession.setSessionNameChangeCallback((sessionId, newSessionName) => {
            this.updateSessionName(sessionId, newSessionName);
            sidebarSessionService.loadSessions();
        });

        chatSession.setTabId(tabId);
        this.tabSessions.set(tabId, chatSession);
        this.tabSessionIds.set(tabId, chatSession.sessionId);
        this.updateTabName(tabId, chatSession.data.name)

        // 初始化标签特定的下拉菜单
        await this.initTabSpecificDropdowns(tabId);

        // 激活新标签
        this.activateTab(tabId);

        // 更新标签可见性
        this.updateTabsVisibility();

        return tabId;
    }

    /**
     * 创建标签DOM元素
     * @param {string} tabId 标签ID
     * @param {string} tabName 标签名称
     * @returns {HTMLElement} 标签DOM元素
     */
    createTabElement(tabId, tabName) {
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.id = tabId;
        tabElement.setAttribute('data-tab-id', tabId);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'tab-name';
        nameSpan.textContent = tabName;
        nameSpan.title = tabName;

        const closeButton = document.createElement('span');
        closeButton.className = 'tab-close';
        closeButton.textContent = '×';
        closeButton.title = i18n.t('tabs.close');

        tabElement.appendChild(nameSpan);
        tabElement.appendChild(closeButton);

        // 标签点击事件
        tabElement.addEventListener('click', (e) => {
            // 如果点击的是关闭按钮，则关闭标签
            if (e.target === closeButton) {
                this.closeTab(tabId);
            } else {
                // 否则切换到该标签
                this.activateTab(tabId);
            }
        });

        return tabElement;
    }

    /**
     * 创建标签内容DOM元素
     * @param {string} tabId 标签ID
     * @returns {HTMLElement} 标签内容DOM元素
     */
    createTabContentElement(tabId) {
        const defaultContent = document.getElementById('tab-content-default');
        const contentId = `tab-content-${tabId}`;

        // 如果没有默认内容或已经存在该内容元素，则创建新的
        if (!defaultContent || document.getElementById(contentId)) {
            const contentElement = document.createElement('div');
            contentElement.className = 'tab-content';
            contentElement.id = contentId;

            // 创建消息区域
            const messagesDiv = document.createElement('div');
            messagesDiv.className = 'chat-messages';
            messagesDiv.id = `chat-messages-${tabId}`;
            contentElement.appendChild(messagesDiv);

            // 创建输入区域（从默认内容克隆）
            const inputContainer = document.createElement('div');
            inputContainer.className = 'chat-input-container';
            inputContainer.innerHTML = `
                <div class="model-selector">
                    <select id="model-select-${tabId}" class="settings-select"></select>
                    <select id="prompt-select-${tabId}" class="settings-select" title="选择提示词作为system message"></select>
                    
                    <div id="mcp-dropdown-${tabId}" class="mcp-dropdown">
                        <button id="mcp-dropdown-btn-${tabId}" class="mcp-dropdown-btn settings-select" type="button">MCP服务</button>
                        <div id="mcp-dropdown-content-${tabId}" class="mcp-dropdown-content"></div>
                    </div>
                    
                    <button id="conversation-mode-btn-${tabId}" class="test-button" title="切换对话模式">单次对话</button>
                    
                    <button id="new-session-btn-${tabId}" class="test-button" title="创建新会话">新建会话</button>
                </div>
                
                ${InputManagerService.createInputHTML(tabId)}
            `;
            contentElement.appendChild(inputContainer);

            return contentElement;
        } else {
            // 克隆默认内容
            const contentElement = defaultContent.cloneNode(true);
            contentElement.id = contentId;
            contentElement.classList.remove('active');

            // 更新内部元素的ID
            const messagesDiv = contentElement.querySelector('.chat-messages');
            if (messagesDiv) {
                messagesDiv.id = `chat-messages-${tabId}`;
            }

            const modelSelect = contentElement.querySelector('#model-select');
            if (modelSelect) {
                modelSelect.id = `model-select-${tabId}`;
            }

            const promptSelect = contentElement.querySelector('#prompt-select');
            if (promptSelect) {
                promptSelect.id = `prompt-select-${tabId}`;
            }

            const mcpDropdownBtn = contentElement.querySelector('#mcp-dropdown-btn');
            if (mcpDropdownBtn) {
                mcpDropdownBtn.id = `mcp-dropdown-btn-${tabId}`;
            }

            const mcpDropdownContent = contentElement.querySelector('#mcp-dropdown-content');
            if (mcpDropdownContent) {
                mcpDropdownContent.id = `mcp-dropdown-content-${tabId}`;
            }

            // 更新对话模式切换按钮
            const conversationModeBtn = contentElement.querySelector('#conversation-mode-btn');
            if (conversationModeBtn) {
                conversationModeBtn.id = `conversation-mode-btn-${tabId}`;
            }

            const newSessionBtn = contentElement.querySelector('#new-session-btn');
            if (newSessionBtn) {
                newSessionBtn.id = `new-session-btn-${tabId}`;
            }

            // 替换输入区域
            const inputGroup = contentElement.querySelector('.input-group');
            if (inputGroup) {
                inputGroup.outerHTML = InputManagerService.createInputHTML(tabId);
            }

            return contentElement;
        }
    }

    /**
     * 激活指定的标签
     * @param {string} tabId 要激活的标签ID
     */
    activateTab(tabId) {
        // 更新标签样式
        const tabs = this.tabsContainer.querySelectorAll('.tab');
        tabs.forEach(tab => {
            if (tab.getAttribute('data-tab-id') === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // 更新内容区域显示
        const contents = this.tabsContent.querySelectorAll('.tab-content');
        contents.forEach(content => {
            if (content.id === `tab-content-${tabId}`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });

        // 更新活动标签ID
        this.activeTabId = tabId;

        // 获取与标签关联的会话ID
        const sessionId = this.tabSessionIds.get(tabId);
        if (sessionId) {
            // 调用会话特定的配置处理函数
            if (typeof window.handleTabClick === 'function') {
                window.handleTabClick(sessionId);
            }
        }

        // 聚焦输入框
        const inputElem = document.getElementById(`message-input-${tabId}`);
        if (inputElem) {
            inputElem.focus();
        }

        // 确保活动标签可见
        this.ensureActiveTabVisible();
    }

    /**
     * 确保活动标签可见
     * 如果活动标签在隐藏列表中，更新可见标签
     */
    ensureActiveTabVisible() {
        if (this.hiddenTabs.has(this.activeTabId)) {
            // 切换到活动标签显示在标签栏中
            const tabElement = document.getElementById(this.activeTabId);
            if (tabElement) {
                tabElement.style.display = 'inline-flex';
                this.showingTabs.add(this.activeTabId);
                this.hiddenTabs.delete(this.activeTabId);

                // 如果可见标签数量超过最大数量，隐藏一个非活动标签
                if (this.showingTabs.size > this.maxVisibleTabs) {
                    const tabToHide = Array.from(this.showingTabs).find(id => id !== this.activeTabId);
                    if (tabToHide) {
                        const tabElement = document.getElementById(tabToHide);
                        if (tabElement) {
                            tabElement.style.display = 'none';
                            this.showingTabs.delete(tabToHide);
                            this.hiddenTabs.add(tabToHide);
                        }
                    }
                }

                // 更新下拉菜单
                this.updateTabsDropdownMenu();
            }
        }
    }

    /**
     * 关闭指定的标签
     * @param {string} tabId 要关闭的标签ID
     */
    closeTab(tabId) {
        // 如果只有一个标签，不允许关闭
        if (this.tabsContainer.querySelectorAll('.tab').length <= 1) {
            return;
        }

        // 获取标签DOM元素
        const tabElement = document.getElementById(tabId);
        if (!tabElement) return;

        // 获取标签内容DOM元素
        const contentElement = document.getElementById(`tab-content-${tabId}`);

        // 如果正在关闭当前活动的标签，需要激活其他标签
        if (this.activeTabId === tabId) {
            const tabs = this.tabsContainer.querySelectorAll('.tab');
            let newActiveTab = null;

            // 找到下一个标签或前一个标签
            for (let i = 0; i < tabs.length; i++) {
                if (tabs[i].getAttribute('data-tab-id') === tabId) {
                    if (tabs[i + 1] && tabs[i + 1] !== this.newTabButton) {
                        newActiveTab = tabs[i + 1].getAttribute('data-tab-id');
                    } else if (tabs[i - 1]) {
                        newActiveTab = tabs[i - 1].getAttribute('data-tab-id');
                    }
                    break;
                }
            }

            // 如果找到了新的活动标签，激活它
            if (newActiveTab) {
                this.activateTab(newActiveTab);
            }
        }

        // 移除标签和内容DOM元素
        if (tabElement) tabElement.remove();
        if (contentElement) contentElement.remove();

        // 清除标签与会话的关联
        this.tabSessions.delete(tabId);
        this.tabSessionIds.delete(tabId);

        // 更新标签显示状态
        this.showingTabs.delete(tabId);
        this.hiddenTabs.delete(tabId);

        // 更新标签可见性
        this.updateTabsVisibility();
    }

    /**
     * 更新标签名称
     * @param {string} tabId 标签ID
     * @param {string} newName 新名称
     */
    updateTabName(tabId, newName) {
        const tabElement = document.getElementById(tabId);
        if (!tabElement) return;

        const nameSpan = tabElement.querySelector('.tab-name');
        if (nameSpan) {
            nameSpan.textContent = newName;
            nameSpan.title = newName;
        }

        // 如果标签在下拉菜单中，也更新下拉菜单中的名称
        this.updateTabsDropdownMenu();
    }

    /**
     * 获取当前活动的会话实例
     * @returns {ChatSessionService} 当前活动的会话实例
     */
    getActiveSession() {
        return this.tabSessions.get(this.activeTabId);
    }

    /**
     * 获取当前活动的会话ID
     * @returns {string} 当前活动的会话ID
     */
    getActiveSessionId() {
        return this.tabSessionIds.get(this.activeTabId);
    }

    /**
     * 在标签中打开指定的会话
     * @param {string} sessionId 会话ID
     */
    async openSessionInTab(sessionId) {
        // 检查是否已经在某个标签中打开了这个会话
        for (const [tabId, sid] of this.tabSessionIds.entries()) {
            if (sid === sessionId) {
                // 如果已经打开，切换到该标签
                this.activateTab(tabId);
                return tabId;
            }
        }

        // 创建新标签并加载会话
        return await this.createNewTab(sessionId);
    }

    /**
     * 当会话被重命名时更新对应的标签名称
     * @param {string} sessionId 被重命名的会话ID
     * @param {string} newName 新名称
     */
    updateSessionName(sessionId, newName) {
        // 查找包含该会话的所有标签
        for (const [tabId, sid] of this.tabSessionIds.entries()) {
            if (sid === sessionId) {
                this.updateTabName(tabId, newName);
            }
        }
    }

    /**
     * 当会话被删除时关闭对应的标签
     * @param {string} sessionId 被删除的会话ID
     */
    handleSessionDeleted(sessionId) {
        // 查找包含该会话的所有标签
        const tabsToClose = [];
        for (const [tabId, sid] of this.tabSessionIds.entries()) {
            if (sid === sessionId) {
                tabsToClose.push(tabId);
            }
        }

        // 关闭包含该会话的所有标签
        tabsToClose.forEach(tabId => {
            this.closeTab(tabId);
        });
    }

    /**
     * 初始化对话模式按钮
     * @param {string} tabId 标签ID
     * @param {ChatSessionService} session 会话实例
     */
    async initConversationModeToggle(tabId, session) {
        const conversationModeBtn = document.getElementById(`conversation-mode-btn-${tabId}`);

        if (!conversationModeBtn) return;

        try {
            // 获取当前会话的对话模式
            const sessionConfig = await session.getConfig();
            const isSingleTurn = sessionConfig.conversationMode === 'single-turn' || !sessionConfig.conversationMode;

            // 根据当前模式设置按钮状态和文本
            this.updateConversationModeButton(tabId, isSingleTurn);

            // 添加点击事件监听器
            conversationModeBtn.addEventListener('click', async () => {
                // 获取当前按钮文本以确定当前模式
                const currentMode = conversationModeBtn.textContent === '单次对话' ? 'single-turn' : 'multi-turn';
                // 切换到另一个模式
                const newMode = currentMode === 'single-turn' ? 'multi-turn' : 'single-turn';
                await this.setConversationMode(tabId, newMode);
            });

            log.info(`初始化标签 ${tabId} 的对话模式切换按钮完成，当前模式: ${isSingleTurn ? 'single-turn' : 'multi-turn'}`);
        } catch (error) {
            log.error(`初始化标签 ${tabId} 的对话模式切换按钮时出错:`, error.message);
        }
    }

    /**
     * 更新对话模式按钮状态
     * @param {string} tabId 标签ID
     * @param {boolean} isSingleTurn 是否为单次对话模式
     */
    updateConversationModeButton(tabId, isSingleTurn) {
        const conversationModeBtn = document.getElementById(`conversation-mode-btn-${tabId}`);

        if (!conversationModeBtn) return;

        // 更新按钮文本
        conversationModeBtn.textContent = isSingleTurn ? '单次对话' : '多轮对话';
    }

    /**
     * 设置会话的对话模式
     * @param {string} tabId 标签ID
     * @param {string} mode 对话模式 'single-turn' 或 'multi-turn'
     */
    async setConversationMode(tabId, mode) {
        try {
            const session = this.tabSessions.get(tabId);
            if (!session) return;

            // 更新UI
            this.updateConversationModeButton(tabId, mode === 'single-turn');

            // 保存到后端
            await ipcRenderer.invoke('select-session-conversation-mode', session.data.id, mode);
            log.info(`设置会话 ${session.data.id} ${session.data.name} 的对话模式为: ${mode}`);
        } catch (error) {
            log.error(`设置会话 ${tabId} 的对话模式时出错:`, error.message);
        }
    }
}

// 创建并导出标签管理服务实例
module.exports = new TabManagerService(); 