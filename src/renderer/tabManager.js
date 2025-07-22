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
const agentSelectService = require('./agentSelectService');
const { ipcRenderer } = require('electron');

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

        // 保存标签页状态的延迟时间(毫秒)
        this.saveStateDelay = 1000;
        this.saveStateTimeout = null;

        // 防重复创建的保护标志
        this._creatingTab = false;

        // 初始化事件监听器
        this.initEventListeners();

        // 初始化防抖函数
        this.debouncedUpdateTabsVisibility = this.debounce(() => {
            this.updateTabsVisibility();
        }, 100);

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            this.calculateMaxVisibleTabs();
            this.debouncedUpdateTabsVisibility();
        });
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
        this.newTabButton.addEventListener('click', async () => {
            // 防止重复点击
            if (this.newTabButton.disabled) return;
            this.newTabButton.disabled = true;

            log.info('点击新建标签按钮');
            await this.createNewTab();
            sidebarSessionService.loadSessions();

            // 重新启用按钮
            setTimeout(() => {
                this.newTabButton.disabled = false;
            }, 500);
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
        // 优先显示活动标签和最新的标签
        const activeTabIndex = tabs.findIndex(tab => tab.getAttribute('data-tab-id') === this.activeTabId);
        const tabsToShow = new Set();

        // 优先显示活动标签
        if (activeTabIndex !== -1) {
            tabsToShow.add(this.activeTabId);
        }

        // 如果还有剩余位置，优先显示最新的标签（从右到左填充）
        if (tabsToShow.size < this.maxVisibleTabs) {
            const remainingSlots = this.maxVisibleTabs - tabsToShow.size;
            let count = 0;

            // 从最新的标签开始（从右到左），优先显示新标签
            for (let i = tabs.length - 1; i >= 0 && count < remainingSlots; i--) {
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

        // 重新计算最大可见标签数（因为可能有新的标签影响布局）
        this.calculateMaxVisibleTabs();

        // 更新标签可见性
        this.updateTabsVisibility();

        // 保存标签页状态
        this.saveTabState();
    }

    /**
     * 初始化标签特定的下拉菜单
     * @param {string} tabId 标签ID
     */
    async initTabSpecificDropdowns(tabId) {
        const session = this.tabSessions.get(tabId);
        if (!session) return;

        // 初始化模型下拉菜单
        await this.initModelDropdown(tabId, session);

        // 初始化提示词下拉菜单
        await this.initPromptDropdown(tabId, session);

        // 初始化MCP下拉菜单
        await this.initMcpDropdown(tabId, session);

        // 初始化对话模式切换
        await this.initConversationModeToggle(tabId, session);

        // 初始化Agent下拉菜单
        await this.initAgentDropdown(tabId, session);

        // 初始化新建会话按钮
        const newSessionBtn = document.getElementById(`new-session-btn-${tabId}`);
        if (newSessionBtn) {
            // 先移除已有的事件监听器（如果存在）防止重复绑定
            const existingHandler = newSessionBtn._newSessionHandler;
            if (existingHandler) {
                newSessionBtn.removeEventListener('click', existingHandler);
            }

            // 创建新的事件处理器
            const newSessionHandler = async () => {
                // 防止重复触发
                if (newSessionBtn.disabled) return;
                newSessionBtn.disabled = true;

                const session = this.tabSessions.get(tabId);
                const sessionId = session.data.id
                log.info(`tab ${tabId} reset session ${sessionId}`);
                await ipcRenderer.invoke('reset-session-start-message', sessionId);

                // 重新启用按钮
                setTimeout(() => {
                    newSessionBtn.disabled = false;
                }, 1000);
            };

            // 绑定新的事件监听器
            newSessionBtn.addEventListener('click', newSessionHandler);

            // 保存处理器引用以便后续移除
            newSessionBtn._newSessionHandler = newSessionHandler;
        }

        log.info(`标签 ${tabId} 的下拉菜单初始化完成`);
    }

    /**
     * 初始化Agent下拉菜单
     * @param {string} tabId 标签ID
     * @param {ChatSessionService} session 会话实例
     */
    async initAgentDropdown(tabId, session) {
        // 初始化Agent下拉框
        const sessionConfig = await session.getConfig();
        await agentSelectService.setTabAgentDropdown(tabId, sessionConfig.agentId);

        // 初始化关联下拉框
        await this.setTabSelectors(tabId, sessionConfig.agentId)

        // 设置监听回调
        const agentSelect = document.getElementById(`agent-select-${tabId}`);
        agentSelect.addEventListener('change', async (e) => {
            const agentId = e.target.value;

            // 如果是添加新Agent，重置选择框
            if (agentId === "add_new") {
                // 保留会话原有的配置
                const session = this.tabSessions.get(tabId);
                const sessionConfig = await session.getConfig();
                agentSelect.value = sessionConfig.agentId;

                openSettingsWindowWithTab('agents');
            } else if (agentId) {
                // 标签页模式
                log.info(`标签 ${tabId} 会话 ${session.data.id} 选择Agent: ${agentId}`);
                await ipcRenderer.invoke('select-session-agent', session.data.id, agentId);

                // 更新关联下拉框
                await this.setTabSelectors(tabId, agentId)
            } else {
                log.warn('未选择Agent')
            }
        });

        // 点击刷新下拉列表
        agentSelect.addEventListener('mousedown', async (event) => {
            const session = this.tabSessions.get(tabId);
            const sessionConfig = await session.getConfig();
            await agentSelectService.setTabAgentDropdown(tabId, sessionConfig.agentId);
        });
    }

    /**
     * @param {string} tabId  
     * @param {string} agentId 
     */
    async setTabSelectors(tabId, agentId) {
        log.info(`设置标签 ${tabId} 显示配置列表, agentId: ${agentId}`);

        const agentSelect = document.getElementById(`agent-select-${tabId}`);
        const modelSelect = document.getElementById(`model-select-${tabId}`);
        const promptSelect = document.getElementById(`prompt-select-${tabId}`);
        const mcpDropdownBtn = document.getElementById(`mcp-dropdown-btn-${tabId}`);
        const mcpDropdownContent = document.getElementById(`mcp-dropdown-content-${tabId}`);

        // 根据agentId模式决定配置来源
        if (agentId && agentId !== 'free-mode') {
            // 选择Agent时：使用Agent配置填充模型、提示词、mcp下拉列表
            await this.setModelDropdownWithAgentConfig(modelSelect, tabId, agentId);
            await this.setPromptDropdownWithAgentConfig(promptSelect, tabId, agentId);
            await this.setMcpDropdownWithAgentConfig(mcpDropdownBtn, mcpDropdownContent, tabId, agentId);
        } else {
            // 选择自由模式时：使用会话配置填充模型、提示词、mcp下拉列表
            await this.setModelDropdownWithSessionConfig(modelSelect, tabId);
            await this.setPromptDropdownWithSessionConfig(promptSelect, tabId);
            await this.setMcpDropdownWithSessionConfig(mcpDropdownBtn, mcpDropdownContent, tabId);
        }

        this.updateMcpButtonDisplay(mcpDropdownBtn, mcpDropdownContent);
    }

    /**
     * 通用方法：初始化和更新模型下拉选择器
     * @param {HTMLSelectElement} select 下拉元素
     * @param {string} tabId 标签ID
     * @returns {Promise<void>}
     */
    async setModelDropdown(select, tabId) {
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
    }

    /**
     * 使用Agent配置填充模型下拉选择器
     * @param {HTMLSelectElement} select 下拉元素
     * @param {string} tabId 标签ID
     * @param {string} agentId Agent ID
     * @returns {Promise<void>}
     */
    async setModelDropdownWithAgentConfig(select, tabId, agentId) {
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

        // 获取Agent配置的模型
        const agents = await ipcRenderer.invoke('get-agents');
        const agent = agents[agentId];
        if (agent && agent.modelId) {
            select.value = agent.modelId;
            log.info(`Agent ${agentId} 使用的模型：${agent.modelId}`);
        }
    }

    /**
     * 使用会话配置填充模型下拉选择器
     * @param {HTMLSelectElement} select 下拉元素
     * @param {string} tabId 标签ID
     * @returns {Promise<void>}
     */
    async setModelDropdownWithSessionConfig(select, tabId) {
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

        // 获取会话的自定义模型配置
        const session = this.tabSessions.get(tabId);
        select.value = session.data.modelId || '';
        log.info(`会话 ${session.data.id} ${session.data.name} 的自定义模型：${session.data.modelId}`);
    }

    /**
     * 通用方法：初始化和更新提示词下拉选择器
     * @param {HTMLSelectElement} select 下拉元素
     * @param {string} tabId 标签ID
     * @returns {Promise<void>}
     */
    async setPromptDropdown(select, tabId) {
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
    }

    /**
     * 使用Agent配置填充提示词下拉选择器
     * @param {HTMLSelectElement} select 下拉元素
     * @param {string} tabId 标签ID
     * @param {string} agentId Agent ID
     * @returns {Promise<void>}
     */
    async setPromptDropdownWithAgentConfig(select, tabId, agentId) {
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

        // 获取Agent配置的提示词
        const agents = await ipcRenderer.invoke('get-agents');
        const agent = agents[agentId];
        if (agent && agent.promptId) {
            select.value = agent.promptId;
            log.info(`Agent ${agentId} 使用的提示词：${agent.promptId}`);
        }
    }

    /**
     * 使用会话配置填充提示词下拉选择器
     * @param {HTMLSelectElement} select 下拉元素
     * @param {string} tabId 标签ID
     * @returns {Promise<void>}
     */
    async setPromptDropdownWithSessionConfig(select, tabId) {
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

        // 获取会话的自定义提示词配置
        const session = this.tabSessions.get(tabId);
        select.value = session.data.promptId || '';
        log.info(`会话 ${session.data.id} ${session.data.name} 的自定义提示词：${session.data.promptId}`);
    }

    /**
     * 通用方法：初始化和更新MCP下拉选择器
     * @param {HTMLElement} mcpDropdownBtn MCP下拉按钮
     * @param {HTMLElement} mcpDropdownContent MCP下拉内容
     * @param {string} tabId 标签ID
     * @returns {Promise<void>}
     */
    async setMcpDropdown(mcpDropdownBtn, mcpDropdownContent, tabId) {
        // 获取MCP服务器列表
        const mcpServers = await ipcRenderer.invoke('get-mcp-servers');
        log.info("MCP服务数量：", mcpServers.length);

        // 获取当前会话的MCP服务列表
        const session = this.tabSessions.get(tabId);
        const sessionConfig = await session.getConfig();
        const sessionMcpServers = sessionConfig.mcpServers || []; // 确保为数组，防止undefined
        log.info(`当前会话 ${session.data.id} ${session.data.name} 的MCP服务列表：${JSON.stringify(sessionMcpServers)}`);

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
            checkbox.checked = sessionMcpServers.includes(serverId);  // 现在安全了，sessionMcpServers确保是数组

            checkbox.addEventListener('change', async (e) => {
                const isChecked = e.target.checked;
                const serverId = checkbox.getAttribute('data-server-id');
                log.info(`切换MCP服务 ${serverId} 状态为: ${isChecked}`);

                // 更新连接状态
                const statusIndicator = option.querySelector('.mcp-status-indicator');
                if (statusIndicator) {
                    if (isChecked) {
                        // 激活时设置为连接中状态
                        this.setMcpConnectionState(statusIndicator, 'connecting');
                        // 检查连接状态
                        setTimeout(() => this.checkMcpServerConnection(serverId, statusIndicator), 500);
                    } else {
                        // 停用时设置为断开状态
                        this.setMcpConnectionState(statusIndicator, 'disconnected');
                    }
                }

                // 获取当前所有选中的服务ID
                const allCheckedServerIds = Array.from(
                    mcpDropdownContent.querySelectorAll('.mcp-server-checkbox:checked')
                ).map(cb => cb.getAttribute('data-server-id'));

                log.info(`当前选中的所有MCP服务: ${JSON.stringify(allCheckedServerIds)}`);

                // 检查是否在Agent模式下修改了配置
                await this.handleConfigurationChange(tabId, 'mcp', allCheckedServerIds);

                // 更新按钮显示
                this.updateMcpButtonDisplay(mcpDropdownBtn, mcpDropdownContent);
            });

            const nameSpan = document.createElement('span');
            nameSpan.textContent = server.name;
            nameSpan.className = 'mcp-server-name';

            // 创建连接状态指示器
            const statusIndicator = document.createElement('div');
            statusIndicator.className = 'mcp-status-indicator status-disconnected';

            // 状态圆点
            const statusDot = document.createElement('div');
            statusDot.className = 'status-dot';

            // 状态圆点点击事件：触发重连
            statusDot.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                await this.reconnectMcpServer(serverId, statusIndicator);
            });

            // 状态箭头（hover时显示）
            const statusArrow = document.createElement('div');
            statusArrow.className = 'status-arrow';
            statusArrow.innerHTML = '↻'; // 重新连接箭头符号

            // 状态箭头点击事件：触发重连
            statusArrow.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                await this.reconnectMcpServer(serverId, statusIndicator);
            });

            statusIndicator.appendChild(statusDot);
            statusIndicator.appendChild(statusArrow);

            // 添加状态指示器点击事件
            statusIndicator.addEventListener('click', async (e) => {
                e.stopPropagation(); // 防止触发复选框事件
                e.preventDefault(); // 防止默认行为
                e.stopImmediatePropagation(); // 立即停止事件冒泡

                await this.reconnectMcpServer(serverId, statusIndicator);
            });

            container.appendChild(checkbox);
            container.appendChild(nameSpan);
            container.appendChild(statusIndicator);
            option.appendChild(container);

            mcpDropdownContent.appendChild(option);

            // 初始化连接状态
            if (sessionMcpServers.includes(serverId)) {
                // 对于选中的服务，先设置为连接中状态，然后检查实际连接状态
                this.setMcpConnectionState(statusIndicator, 'connecting');
                setTimeout(() => this.checkMcpServerConnection(serverId, statusIndicator), 100);
            } else {
                this.setMcpConnectionState(statusIndicator, 'disconnected');
            }
        });

        // 更新按钮显示
        this.updateMcpButtonDisplay(mcpDropdownBtn, mcpDropdownContent);
    }

    /**
     * 使用Agent配置填充MCP下拉选择器
     * @param {HTMLElement} mcpDropdownBtn MCP下拉按钮
     * @param {HTMLElement} mcpDropdownContent MCP下拉内容
     * @param {string} tabId 标签ID
     * @param {string} agentId Agent ID
     * @returns {Promise<void>}
     */
    async setMcpDropdownWithAgentConfig(mcpDropdownBtn, mcpDropdownContent, tabId, agentId) {
        // 获取MCP服务器列表
        const mcpServers = await ipcRenderer.invoke('get-mcp-servers');
        log.info("MCP服务数量：", mcpServers.length);

        // 获取Agent配置的MCP服务列表
        const agents = await ipcRenderer.invoke('get-agents');
        const agent = agents[agentId];
        const agentMcpServers = (agent && agent.mcpServers) ? agent.mcpServers : [];
        log.info(`Agent ${agentId} 的MCP服务列表：${JSON.stringify(agentMcpServers)}`);

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
            checkbox.checked = agentMcpServers.includes(serverId);  // 使用Agent配置

            checkbox.addEventListener('change', async (e) => {
                const isChecked = e.target.checked;
                const serverId = checkbox.getAttribute('data-server-id');
                log.info(`切换MCP服务 ${serverId} 状态为: ${isChecked}`);

                // 更新连接状态
                const statusIndicator = option.querySelector('.mcp-status-indicator');
                if (statusIndicator) {
                    if (isChecked) {
                        // 激活时设置为连接中状态
                        this.setMcpConnectionState(statusIndicator, 'connecting');
                        // 检查连接状态
                        setTimeout(() => this.checkMcpServerConnection(serverId, statusIndicator), 500);
                    } else {
                        // 停用时设置为断开状态
                        this.setMcpConnectionState(statusIndicator, 'disconnected');
                    }
                }

                // 获取当前所有选中的服务ID
                const allCheckedServerIds = Array.from(
                    mcpDropdownContent.querySelectorAll('.mcp-server-checkbox:checked')
                ).map(cb => cb.getAttribute('data-server-id'));

                log.info(`当前选中的所有MCP服务: ${JSON.stringify(allCheckedServerIds)}`);

                // 检查是否在Agent模式下修改了配置
                await this.handleConfigurationChange(tabId, 'mcp', allCheckedServerIds);

                // 更新按钮显示
                this.updateMcpButtonDisplay(mcpDropdownBtn, mcpDropdownContent);
            });

            const nameSpan = document.createElement('span');
            nameSpan.textContent = server.name;
            nameSpan.className = 'mcp-server-name';

            // 创建连接状态指示器
            const statusIndicator = document.createElement('div');
            statusIndicator.className = 'mcp-status-indicator status-disconnected';

            // 状态圆点
            const statusDot = document.createElement('div');
            statusDot.className = 'status-dot';

            // 状态圆点点击事件：触发重连
            statusDot.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                await this.reconnectMcpServer(serverId, statusIndicator);
            });

            // 状态箭头（hover时显示）
            const statusArrow = document.createElement('div');
            statusArrow.className = 'status-arrow';
            statusArrow.innerHTML = '↻'; // 重新连接箭头符号

            // 状态箭头点击事件：触发重连
            statusArrow.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                await this.reconnectMcpServer(serverId, statusIndicator);
            });

            statusIndicator.appendChild(statusDot);
            statusIndicator.appendChild(statusArrow);

            // 添加状态指示器点击事件
            statusIndicator.addEventListener('click', async (e) => {
                e.stopPropagation(); // 防止触发复选框事件
                e.preventDefault(); // 防止默认行为
                e.stopImmediatePropagation(); // 立即停止事件冒泡

                await this.reconnectMcpServer(serverId, statusIndicator);
            });

            container.appendChild(checkbox);
            container.appendChild(nameSpan);
            container.appendChild(statusIndicator);
            option.appendChild(container);

            mcpDropdownContent.appendChild(option);

            // 初始化连接状态
            if (agentMcpServers.includes(serverId)) {
                // 对于选中的服务，先设置为连接中状态，然后检查实际连接状态
                this.setMcpConnectionState(statusIndicator, 'connecting');
                setTimeout(() => this.checkMcpServerConnection(serverId, statusIndicator), 100);
            } else {
                this.setMcpConnectionState(statusIndicator, 'disconnected');
            }
        });

        // 更新按钮显示
        this.updateMcpButtonDisplay(mcpDropdownBtn, mcpDropdownContent);
    }

    /**
     * 使用会话配置填充MCP下拉选择器
     * @param {HTMLElement} mcpDropdownBtn MCP下拉按钮
     * @param {HTMLElement} mcpDropdownContent MCP下拉内容
     * @param {string} tabId 标签ID
     * @returns {Promise<void>}
     */
    async setMcpDropdownWithSessionConfig(mcpDropdownBtn, mcpDropdownContent, tabId) {
        // 获取MCP服务器列表
        const mcpServers = await ipcRenderer.invoke('get-mcp-servers');
        log.info("MCP服务数量：", mcpServers.length);

        // 获取会话的自定义MCP服务列表
        const session = this.tabSessions.get(tabId);
        const sessionMcpServers = session.data.mcpServers || [];
        log.info(`会话 ${session.data.id} ${session.data.name} 的自定义MCP服务列表：${JSON.stringify(sessionMcpServers)}`);

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
            checkbox.checked = sessionMcpServers.includes(serverId);  // 使用会话配置

            checkbox.addEventListener('change', async (e) => {
                const isChecked = e.target.checked;
                const serverId = checkbox.getAttribute('data-server-id');
                log.info(`切换MCP服务 ${serverId} 状态为: ${isChecked}`);

                // 更新连接状态
                const statusIndicator = option.querySelector('.mcp-status-indicator');
                if (statusIndicator) {
                    if (isChecked) {
                        // 激活时设置为连接中状态
                        this.setMcpConnectionState(statusIndicator, 'connecting');
                        // 检查连接状态
                        setTimeout(() => this.checkMcpServerConnection(serverId, statusIndicator), 500);
                    } else {
                        // 停用时设置为断开状态
                        this.setMcpConnectionState(statusIndicator, 'disconnected');
                    }
                }

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
            });

            const nameSpan = document.createElement('span');
            nameSpan.textContent = server.name;
            nameSpan.className = 'mcp-server-name';

            // 创建连接状态指示器
            const statusIndicator = document.createElement('div');
            statusIndicator.className = 'mcp-status-indicator status-disconnected';

            // 状态圆点
            const statusDot = document.createElement('div');
            statusDot.className = 'status-dot';

            // 状态圆点点击事件：触发重连
            statusDot.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                await this.reconnectMcpServer(serverId, statusIndicator);
            });

            // 状态箭头（hover时显示）
            const statusArrow = document.createElement('div');
            statusArrow.className = 'status-arrow';
            statusArrow.innerHTML = '↻'; // 重新连接箭头符号

            // 状态箭头点击事件：触发重连
            statusArrow.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                e.stopImmediatePropagation();
                await this.reconnectMcpServer(serverId, statusIndicator);
            });

            statusIndicator.appendChild(statusDot);
            statusIndicator.appendChild(statusArrow);

            // 添加状态指示器点击事件
            statusIndicator.addEventListener('click', async (e) => {
                e.stopPropagation(); // 防止触发复选框事件
                e.preventDefault(); // 防止默认行为
                e.stopImmediatePropagation(); // 立即停止事件冒泡

                await this.reconnectMcpServer(serverId, statusIndicator);
            });

            container.appendChild(checkbox);
            container.appendChild(nameSpan);
            container.appendChild(statusIndicator);
            option.appendChild(container);

            mcpDropdownContent.appendChild(option);

            // 初始化连接状态
            if (sessionMcpServers.includes(serverId)) {
                // 对于选中的服务，先设置为连接中状态，然后检查实际连接状态
                this.setMcpConnectionState(statusIndicator, 'connecting');
                setTimeout(() => this.checkMcpServerConnection(serverId, statusIndicator), 100);
            } else {
                this.setMcpConnectionState(statusIndicator, 'disconnected');
            }
        });

        // 更新按钮显示
        this.updateMcpButtonDisplay(mcpDropdownBtn, mcpDropdownContent);
    }

    /**
     * 初始化MCP服务下拉菜单
     * @param {string} tabId 标签ID
     * @param {ChatSessionService} session 会话实例
     */
    async initMcpDropdown(tabId, session) {
        const mcpDropdownBtn = document.getElementById(`mcp-dropdown-btn-${tabId}`);
        const mcpDropdownContent = document.getElementById(`mcp-dropdown-content-${tabId}`);
        if (!mcpDropdownBtn || !mcpDropdownContent || !window.mcpServer) return;

        // 初始化下拉内容
        await this.setMcpDropdown(mcpDropdownBtn, mcpDropdownContent, tabId);

        // 添加点击事件监听器
        mcpDropdownBtn.addEventListener('click', async (event) => {
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
     * 生成唯一的标签ID
     * 检查DOM中是否已存在相同ID的元素，确保ID的唯一性
     * @returns {string} 唯一的标签ID
     */
    generateUniqueTabId() {
        let tabId;
        let attempts = 0;
        const maxAttempts = 1000; // 防止无限循环

        do {
            this.tabCounter++;
            tabId = `tab-${this.tabCounter}`;
            attempts++;

            // 防止无限循环
            if (attempts > maxAttempts) {
                // 如果尝试次数过多，使用时间戳确保唯一性
                tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                log.warn(`标签ID生成尝试次数过多，使用时间戳生成: ${tabId}`);
                break;
            }

        } while (
            // 检查DOM中是否已存在该ID的元素
            document.getElementById(tabId) ||
            document.getElementById(`tab-content-${tabId}`) ||
            // 检查内存中的映射关系
            this.tabSessions.has(tabId) ||
            this.tabSessionIds.has(tabId)
        );

        log.info(`生成唯一标签ID: ${tabId} (尝试次数: ${attempts})`);
        return tabId;
    }

    /**
     * 创建新标签
     * @param {string} sessionId 可选的会话ID，如果提供则加载这个会话到新标签
     * @returns {string} 新创建的标签ID
     */
    async createNewTab(sessionId = null) {
        // 防止重复创建的保护机制
        if (this._creatingTab) {
            log.warn('正在创建标签中，忽略重复请求');
            return null;
        }

        this._creatingTab = true;

        // 生成唯一的标签ID
        const tabId = this.generateUniqueTabId();

        log.info(`开始创建新标签: ${tabId}${sessionId ? ` (会话ID: ${sessionId})` : ' (新会话)'}`);

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
            log.info(`标签 ${tabId} 加载已有会话: ${chatSession.data.name}`);
        } else {
            await chatSession.createNewSession();
            log.info(`标签 ${tabId} 创建新会话: ${chatSession.data.name}`);
        }

        chatSession.setSessionNameChangeCallback((sessionId, newSessionName) => {
            this.updateSessionName(sessionId, newSessionName);
            sidebarSessionService.loadSessions();
        });

        chatSession.setTabId(tabId);
        this.tabSessions.set(tabId, chatSession);
        this.tabSessionIds.set(tabId, chatSession.sessionId);
        this.updateTabName(tabId, chatSession.data.name);

        // 初始化标签特定的下拉菜单
        await this.initTabSpecificDropdowns(tabId);

        // 激活新标签
        this.activateTab(tabId);

        // 重新计算最大可见标签数（因为可能有新的标签影响布局）
        this.calculateMaxVisibleTabs();

        // 更新标签可见性
        this.updateTabsVisibility();

        // 保存标签页状态
        this.saveTabState();

        log.info(`成功创建标签: ${tabId} (会话: ${chatSession.data.name})`);

        this._creatingTab = false;
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
        const contentId = `tab-content-${tabId}`;

        // 检查是否已经存在该内容元素，防止重复创建
        const existingElement = document.getElementById(contentId);
        if (existingElement) {
            log.warn(`标签内容元素 ${contentId} 已存在，返回现有元素`);
            return existingElement;
        }

        const defaultContent = document.getElementById('tab-content-default');

        // 如果没有默认内容，则创建新的
        if (!defaultContent) {
            const contentElement = document.createElement('div');
            contentElement.className = 'tab-content';
            contentElement.id = contentId;

            // 创建消息区域
            const messagesDiv = document.createElement('div');
            messagesDiv.className = 'chat-messages';
            messagesDiv.id = `chat-messages-${tabId}`;
            contentElement.appendChild(messagesDiv);

            // 创建输入区域
            const inputContainer = document.createElement('div');
            inputContainer.className = 'chat-input-container';
            inputContainer.innerHTML = `
                <div class="model-selector">
                    <select id="agent-select-${tabId}" class="settings-select" title="${i18n.t('agents.selectModel')}"></select>
                    <select id="model-select-${tabId}" class="settings-select"></select>
                    <select id="prompt-select-${tabId}" class="settings-select" title="${i18n.t('modelSelector.promptTitle')}"></select>
                    
                    <div id="mcp-dropdown-${tabId}" class="mcp-dropdown">
                        <button id="mcp-dropdown-btn-${tabId}" class="mcp-dropdown-btn settings-select" type="button">${i18n.t('modelSelector.mcpServer')}</button>
                        <div id="mcp-dropdown-content-${tabId}" class="mcp-dropdown-content"></div>
                    </div>
                    
                    <button id="conversation-mode-btn-${tabId}" class="test-button" title="${i18n.t('conversationMode.toggle')}" data-i18n="conversationMode.singleTurn">${i18n.t('conversationMode.singleTurn')}</button>
                    
                    <button id="new-session-btn-${tabId}" class="test-button" title="${i18n.t('session.newSession')}" data-i18n="session.newSession">${i18n.t('session.newSession')}</button>
                </div>
                
                ${InputManagerService.createInputHTML(tabId)}
            `;
            contentElement.appendChild(inputContainer);

            log.info(`创建新的标签内容元素: ${contentId}`);
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

            const agentSelect = contentElement.querySelector('#agent-select');
            if (agentSelect) {
                agentSelect.id = `agent-select-${tabId}`;
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
                conversationModeBtn.title = i18n.t('conversationMode.toggle');
            }

            const newSessionBtn = contentElement.querySelector('#new-session-btn');
            if (newSessionBtn) {
                newSessionBtn.id = `new-session-btn-${tabId}`;
                newSessionBtn.title = i18n.t('session.newSession');
            }

            // 替换输入区域
            const inputGroup = contentElement.querySelector('.input-group');
            if (inputGroup) {
                inputGroup.outerHTML = InputManagerService.createInputHTML(tabId);
            }

            log.info(`克隆默认内容创建标签内容元素: ${contentId}`);
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

        // 保存标签页状态
        this.saveTabState();
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
                    // 优先隐藏最老的标签（除了活动标签）
                    const tabs = Array.from(this.tabsContainer.querySelectorAll('.tab'));
                    let tabToHide = null;

                    // 从最老的标签开始查找（从左到右）
                    for (let i = 0; i < tabs.length; i++) {
                        const tabId = tabs[i].getAttribute('data-tab-id');
                        if (tabId !== this.activeTabId && this.showingTabs.has(tabId)) {
                            tabToHide = tabId;
                            break;
                        }
                    }

                    if (tabToHide) {
                        const tabElement = document.getElementById(tabToHide);
                        if (tabElement) {
                            tabElement.style.display = 'none';
                            this.showingTabs.delete(tabToHide);
                            this.hiddenTabs.add(tabToHide);
                            log.info(`隐藏老标签 ${tabToHide} 以显示活动标签 ${this.activeTabId}`);
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

        // 保存标签页状态
        this.saveTabState();
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

        // 保存标签页状态
        this.saveTabState();
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

        // 获取当前会话的对话模式
        const sessionConfig = await session.getConfig();
        const isSingleTurn = sessionConfig.conversationMode === 'single-turn' || !sessionConfig.conversationMode;

        // 根据当前模式设置按钮状态和文本
        this.updateConversationModeButton(tabId, isSingleTurn);

        // 添加点击事件监听器
        conversationModeBtn.addEventListener('click', async () => {
            // 获取当前按钮文本以确定当前模式
            const currentMode = conversationModeBtn.textContent === i18n.t('conversationMode.singleTurn') ? 'single-turn' : 'multi-turn';
            // 切换到另一个模式
            const newMode = currentMode === 'single-turn' ? 'multi-turn' : 'single-turn';
            await this.setConversationMode(tabId, newMode);
        });

        log.info(`初始化标签 ${tabId} 的对话模式切换按钮完成，当前模式: ${isSingleTurn ? 'single-turn' : 'multi-turn'}`);
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
        conversationModeBtn.textContent = isSingleTurn ? i18n.t('conversationMode.singleTurn') : i18n.t('conversationMode.multiTurn');
    }

    /**
     * 设置会话的对话模式
     * @param {string} tabId 标签ID
     * @param {string} mode 对话模式 'single-turn' 或 'multi-turn'
     */
    async setConversationMode(tabId, mode) {
        const session = this.tabSessions.get(tabId);
        if (!session) return;

        // 更新UI
        this.updateConversationModeButton(tabId, mode === 'single-turn');

        // 保存到后端
        await ipcRenderer.invoke('select-session-conversation-mode', session.data.id, mode);
        log.info(`设置会话 ${session.data.id} ${session.data.name} 的对话模式为: ${mode}`);
    }

    /**
     * 保存当前标签页状态到配置文件
     */
    async saveTabState() {
        // 如果有待保存的任务，清除它
        if (this.saveStateTimeout) {
            clearTimeout(this.saveStateTimeout);
        }

        // 延迟保存，避免频繁写入
        this.saveStateTimeout = setTimeout(async () => {
            const openTabs = [];

            // 收集所有打开的标签信息
            this.tabSessionIds.forEach((sessionId, tabId) => {
                const tabElement = document.getElementById(tabId);
                if (tabElement) {
                    const tabName = tabElement.querySelector('.tab-name')?.textContent || i18n.t('tabs.newSession');
                    openTabs.push({
                        tabId: tabId,
                        sessionId: sessionId,
                        tabName: tabName
                    });
                }
            });

            const tabState = {
                openTabs: openTabs,
                activeTabId: this.activeTabId,
                tabCounter: this.tabCounter
            };

            log.info(i18n.t('logs.tabStateSaved'), tabState);
            await ipcRenderer.invoke('save-tab-state', tabState);
            this.saveStateTimeout = null;
        }, this.saveStateDelay);
    }

    /**
     * 从配置文件恢复标签页状态
     */
    async restoreTabState() {
        const tabState = await ipcRenderer.invoke('get-tab-state');
        if (!tabState || !tabState.openTabs || tabState.openTabs.length === 0) {
            log.info('没有找到标签页状态，使用默认初始化');
            return false;
        }

        log.info(i18n.t('logs.tabStateRestored'), tabState);

        // 恢复标签计数器
        if (tabState.tabCounter) {
            this.tabCounter = tabState.tabCounter;
        }

        // 清除现有标签（除了默认内容）
        this.clearAllTabs();

        // 恢复每个标签
        for (const tabInfo of tabState.openTabs) {
            await this.restoreTab(tabInfo);
        }

        // 重新校准tabCounter，确保其正确反映当前状态
        this.recalibrateTabCounter();

        // 激活之前的活动标签
        if (tabState.activeTabId && document.getElementById(tabState.activeTabId)) {
            this.activateTab(tabState.activeTabId);
        } else if (tabState.openTabs.length > 0) {
            // 如果活动标签不存在，激活第一个标签
            this.activateTab(tabState.openTabs[0].tabId);
        }

        // 更新标签可见性
        this.updateTabsVisibility();

        log.info(i18n.t('logs.tabStateRestored'));
        return true;
    }

    /**
     * 重新校准标签计数器
     * 确保tabCounter正确反映当前所有标签的最高编号
     */
    recalibrateTabCounter() {
        let maxCounter = 0;

        // 检查所有已恢复的标签ID
        this.tabSessionIds.forEach((sessionId, tabId) => {
            // 从tabId中提取数字部分（如果是标准格式 tab-{number}）
            const match = tabId.match(/^tab-(\d+)$/);
            if (match) {
                const counter = parseInt(match[1], 10);
                if (counter > maxCounter) {
                    maxCounter = counter;
                }
            }
        });

        // 检查DOM中的所有标签元素
        const tabElements = this.tabsContainer.querySelectorAll('.tab[data-tab-id]');
        tabElements.forEach(element => {
            const tabId = element.getAttribute('data-tab-id');
            const match = tabId.match(/^tab-(\d+)$/);
            if (match) {
                const counter = parseInt(match[1], 10);
                if (counter > maxCounter) {
                    maxCounter = counter;
                }
            }
        });

        // 检查DOM中的所有内容元素
        const contentElements = this.tabsContent.querySelectorAll('[id^="tab-content-tab-"]');
        contentElements.forEach(element => {
            const contentId = element.id;
            const match = contentId.match(/^tab-content-tab-(\d+)$/);
            if (match) {
                const counter = parseInt(match[1], 10);
                if (counter > maxCounter) {
                    maxCounter = counter;
                }
            }
        });

        // 设置tabCounter为最高编号，这样下次创建时会从maxCounter+1开始
        this.tabCounter = maxCounter;

        log.info(`重新校准标签计数器: ${this.tabCounter} (检测到的最高编号: ${maxCounter})`);
    }

    /**
     * 恢复单个标签
     */
    async restoreTab(tabInfo) {
        const { tabId, sessionId, tabName } = tabInfo;

        log.info(i18n.t('logs.restoringTab'), `${tabId} (${sessionId})`);

        // 创建标签DOM元素
        const tabElement = this.createTabElement(tabId, tabName);
        this.tabsContainer.insertBefore(tabElement, this.newTabButton);

        // 创建内容区域
        const contentElement = this.createTabContentElement(tabId);
        this.tabsContent.appendChild(contentElement);

        // 创建会话实例并加载
        const chatSession = new ChatSessionService(sessionId);
        await chatSession.loadSession();

        // 设置会话回调
        chatSession.setSessionNameChangeCallback((sessionId, newSessionName) => {
            this.updateSessionName(sessionId, newSessionName);
            sidebarSessionService.loadSessions();
        });

        chatSession.setTabId(tabId);
        this.tabSessions.set(tabId, chatSession);
        this.tabSessionIds.set(tabId, sessionId);

        // 初始化标签特定的下拉菜单
        await this.initTabSpecificDropdowns(tabId);

        log.info(i18n.t('logs.restoredTab'), `${tabId}`);
    }

    /**
     * 清除所有标签
     * 用于重置界面状态
     */
    clearAllTabs() {
        // 清除所有标签页
        this.tabSessions.clear();
        this.tabSessionIds.clear();

        // 清除DOM元素
        const tabs = this.tabsContainer.querySelectorAll('.tab');
        tabs.forEach(tab => {
            if (tab !== this.newTabButton) {
                tab.remove();
            }
        });

        const contents = this.tabsContent.querySelectorAll('.tab-content');
        contents.forEach(content => content.remove());

        // 重置状态
        this.activeTabId = null;
        this.showingTabs.clear();
        this.hiddenTabs.clear();

        // 重新校准tabCounter，确保从正确的值开始
        this.recalibrateTabCounter();

        // 更新下拉菜单
        this.updateTabsDropdownMenu();
    }

    /**
     * 设置MCP服务连接状态
     * @param {HTMLElement} statusIndicator - 状态指示器元素
     * @param {string} status - 连接状态: 'connected', 'connecting', 'error', 'disconnected'
     * @param {string} error - 错误信息（可选）
     */
    setMcpConnectionState(statusIndicator, status, error = null) {
        if (!statusIndicator) return;

        // 更新状态类
        statusIndicator.className = `mcp-status-indicator status-${status}`;

        // 设置tooltip
        let tooltipText = '';
        switch (status) {
            case 'connected':
                tooltipText = i18n.t('mcp.status.connected') || '已连接';
                break;
            case 'connecting':
                tooltipText = i18n.t('mcp.status.connecting') || '连接中';
                break;
            case 'error':
                tooltipText = error ? `${i18n.t('mcp.status.error') || '连接失败'}: ${error}` : (i18n.t('mcp.status.error') || '连接失败');
                break;
            default:
                tooltipText = i18n.t('mcp.status.disconnected') || '未连接';
                break;
        }
        statusIndicator.title = tooltipText;
    }

    /**
     * 检查MCP服务连接状态
     * @param {string} serverId - 服务ID
     * @param {HTMLElement} statusIndicator - 状态指示器元素
     */
    async checkMcpServerConnection(serverId, statusIndicator) {
        const result = await ipcRenderer.invoke('check-mcp-connection', serverId);

        if (result && result.connected) {
            this.setMcpConnectionState(statusIndicator, 'connected');
        } else {
            this.setMcpConnectionState(statusIndicator, 'error', '连接失败');
        }
    }

    /**
     * 重新连接MCP服务
     * @param {string} serverId - 服务ID
     * @param {HTMLElement} statusIndicator - 状态指示器元素
     */
    async reconnectMcpServer(serverId, statusIndicator) {
        log.info('重新连接MCP服务:', serverId);

        // 获取服务配置
        const mcpServers = await ipcRenderer.invoke('get-mcp-servers');
        const serverConfig = mcpServers[serverId];
        if (!serverConfig) {
            const error = new Error(`MCP服务配置不存在: ${serverId}`);
            log.error(`重新连接MCP服务失败 [${serverId}]:`, error.message);
            this.setMcpConnectionState(statusIndicator, 'error', error.message);
            return;
        }

        // 设置连接中状态
        this.setMcpConnectionState(statusIndicator, 'connecting');

        // 重置MCP客户端
        await ipcRenderer.invoke('reset-mcp-client', serverId);

        // 重新连接
        const result = await ipcRenderer.invoke('reconnect-mcp-server', {
            serverId,
            serverData: serverConfig
        });

        if (result && result.success) {
            this.setMcpConnectionState(statusIndicator, 'connected');
            log.info(`MCP服务 ${serverId} 重新连接成功`);
        } else {
            const error = result?.error || '重新连接失败';
            log.error(`重新连接MCP服务失败 [${serverId}]:`, error);
            this.setMcpConnectionState(statusIndicator, 'error', error);
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

                // 检查是否在Agent模式下修改了配置
                await this.handleConfigurationChange(tabId, 'model', modelId);
            }
        });

        // 添加点击事件监听器，在下拉框打开时刷新模型列表
        modelSelect.addEventListener('mousedown', async (event) => {
            await this.setModelDropdown(modelSelect, tabId);
        });
    }

    /**
     * 初始化提示词下拉菜单
     * @param {string} tabId 标签ID
     * @param {ChatSessionService} session 会话实例
     */
    async initPromptDropdown(tabId, session) {
        const promptSelect = document.getElementById(`prompt-select-${tabId}`);
        if (!promptSelect || !window.promptService) return;

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

                // 检查是否在Agent模式下修改了配置
                await this.handleConfigurationChange(tabId, 'prompt', promptId);
            }
        });

        // 添加点击事件监听器，在下拉框打开时刷新提示词列表
        promptSelect.addEventListener('mousedown', async (event) => {
            await this.setPromptDropdown(promptSelect, tabId);
        });
    }

    /**
     * 处理在Agent模式下修改配置的情况
     * 如果在Agent模式下修改了模型、提示词、MCP配置，则切换到自由模式并更新会话配置
     * @param {string} tabId 标签ID
     * @param {string} configType 配置类型：'model'、'prompt'、'mcp'
     * @param {string|Array} newValue 新的配置值
     * @returns {Promise<void>}
     */
    async handleConfigurationChange(tabId, configType, newValue) {
        const session = this.tabSessions.get(tabId);
        if (!session) {
            log.warn(`标签 ${tabId} 对应的会话不存在`);
            return;
        }

        // 修改其他选项 要把Agent改为free-mode
        const agentSelect = document.getElementById(`agent-select-${tabId}`);
        agentSelect.value = 'free-mode';

        // 根据配置类型更新会话配置
        if (configType === 'model') {
            await ipcRenderer.invoke('select-session-model', session.data.id, newValue);
        } else if (configType === 'prompt') {
            await ipcRenderer.invoke('select-session-prompt', session.data.id, newValue);
        } else if (configType === 'mcp') {
            await ipcRenderer.invoke('select-session-mcp-servers', session.data.id, newValue);
        }

        log.info(`更新会话 ${session.data.id} 配置: ${configType} = ${newValue} `);
    }
}

// 创建并导出标签管理服务实例
module.exports = new TabManagerService(); 