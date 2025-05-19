/**
 * sidebarService.js
 * 侧边栏服务模块
 *
 * 该模块负责处理应用程序侧边栏的所有功能，包括：
 * - 侧边栏折叠/展开
 * - 侧边栏宽度调整
 * - 垂直调整侧边栏上下区域的高度比例
 * - 保存和恢复侧边栏状态
 * - 处理侧边栏相关的DOM交互
 */

const Logger = require('../main/logger');
const log = new Logger('sidebarService');

// 保存状态相关变量
let sidebarCollapsed = false;
let isResizing = false;
let lastSidebarWidth = 250; // 保存侧边栏非折叠状态下的宽度

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');

/**
 * sidebarService类
 * 该类负责处理应用程序侧边栏的所有功能，包括：
 * - 侧边栏折叠/展开
 * - 侧边栏宽度调整
 * - 垂直调整侧边栏上下区域高度比例
 * - 保存和恢复侧边栏状态
 * - 处理侧边栏相关的DOM交互
 */
class SidebarService {
    constructor() {

    }

    // 侧边栏折叠/展开功能
    toggleSidebar() {
        log.info('Toggle Sidebar called, current state:', sidebarCollapsed);

        // 检查sidebar是否存在
        if (!sidebar) {
            log.error('找不到sidebar元素!');
            return;
        }
        log.info('Sidebar element:', sidebar);

        // 添加调试代码，检查事件触发时的元素状态
        log.info('触发前sidebar-toggle样式:', sidebarToggle ? window.getComputedStyle(sidebarToggle) : 'not found');
        log.info('触发前sidebarToggle可点击状态:', sidebarToggle ? window.getComputedStyle(sidebarToggle).pointerEvents : 'not found');

        // 切换前保存当前宽度（如果未折叠）
        if (!sidebarCollapsed) {
            // 获取计算后的实际宽度
            const computedStyle = window.getComputedStyle(sidebar);
            lastSidebarWidth = parseFloat(computedStyle.width);
            localStorage.setItem('sidebarWidth', lastSidebarWidth.toString());
            log.info('Saving current sidebar width:', lastSidebarWidth);
        }

        sidebarCollapsed = !sidebarCollapsed;
        log.info('New state:', sidebarCollapsed);

        try {
            const resizer = document.getElementById('sidebar-resizer');

            if (sidebarCollapsed) {
                log.info('执行折叠操作 - 进入折叠分支');
                sidebar.classList.add('collapsed');

                // 直接设置样式确保折叠效果
                sidebar.style.width = '40px';
                sidebar.style.minWidth = '40px'; // 添加最小宽度确保不会被其他样式覆盖
                sidebar.style.overflow = 'hidden';
                log.info('设置sidebar宽度为:', sidebar.style.width);

                // 设置拖动条位置为折叠状态
                if (resizer) {
                    resizer.style.left = '40px';
                    resizer.style.pointerEvents = 'none'; // 禁用拖动
                    log.info('设置拖动条位置为折叠状态:', resizer.style.left);
                }

                // 隐藏子元素
                const sidebarHeader = document.querySelector('.sidebar-header');
                const sessionsContainer = document.querySelector('.sessions-container');
                const sidebarLower = document.getElementById('sidebar-footer');

                // 确保系统区域隐藏，会话列表恢复显示（在下次展开时）
                const systemItemsContainer = document.getElementById('system-items-container');
                if (systemItemsContainer) {
                    systemItemsContainer.style.display = 'none';
                    log.info('已隐藏系统区域');
                }

                // 确保会话列表在下次展开时是可见的
                if (sessionsContainer) {
                    sessionsContainer.style.display = 'block';
                    sessionsContainer.style.opacity = '0';
                    sessionsContainer.style.pointerEvents = 'none';
                    log.info('已设置sessions-container不可见，但保持display为block');
                } else {
                    log.error('找不到sessions-container元素!');
                }

                if (sidebarHeader) {
                    sidebarHeader.style.opacity = '0';
                    sidebarHeader.style.pointerEvents = 'none';
                    log.info('已设置sidebar-header不可见');
                } else {
                    log.error('找不到sidebar-header元素!');
                }

                // 调整底部按钮区域样式为折叠状态
                if (sidebarLower) {
                    sidebarLower.classList.add('collapsed');
                    log.info('已设置底部按钮为折叠状态');
                } else {
                    log.error('找不到底部按钮容器!');
                }

                // 显示折叠图标
                const collapseIcon = document.querySelector('.sidebar-collapse-icon');
                if (collapseIcon) {
                    collapseIcon.style.display = 'flex';
                    collapseIcon.style.opacity = '1';
                    log.info('已设置collapse-icon可见');
                } else {
                    log.error('找不到sidebar-collapse-icon元素!');
                }

                // 隐藏折叠按钮，但保持可点击
                if (sidebarToggle) {
                    // 修改：让按钮始终保持可点击，只改变透明度
                    sidebarToggle.style.opacity = '0.2'; // 设置为轻微可见，以便于调试
                    // 确保按钮依然可交互
                    sidebarToggle.style.pointerEvents = 'auto';
                    log.info('已设置sidebar-toggle不可见，但保持可点击状态');
                } else {
                    log.error('找不到sidebarToggle元素!');
                }

                // 保存状态到本地存储
                localStorage.setItem('sidebarCollapsed', 'true');

                // 拖动条位置会通过CSS自动调整
                this.updateResizerPosition();

                // 强制重绘
                window.requestAnimationFrame(() => {
                    log.info('请求下一帧重绘，确保样式应用');
                    // 触发重排/重绘，但不隐藏整个body以避免闪烁
                    const _ = sidebar.offsetHeight;
                });
            } else {
                log.info('执行展开操作 - 进入展开分支');
                sidebar.classList.remove('collapsed');

                // 直接设置样式确保展开效果，恢复之前保存的宽度
                const savedWidth = localStorage.getItem('sidebarWidth');
                if (savedWidth) {
                    lastSidebarWidth = parseInt(savedWidth);
                    log.info('从本地存储恢复侧边栏宽度:', lastSidebarWidth);
                }

                sidebar.style.width = `${lastSidebarWidth}px`;
                sidebar.style.minWidth = '180px'; // 修改为一致的最小宽度
                sidebar.style.overflow = 'auto';
                log.info('恢复sidebar宽度为:', sidebar.style.width);

                // 等待页面重排并计算实际宽度后更新拖动条位置
                if (resizer) {
                    // 使用setTimeout确保DOM更新后获取正确宽度
                    setTimeout(() => {
                        // 获取计算后的实际宽度
                        const computedStyle = window.getComputedStyle(sidebar);
                        const actualWidth = parseFloat(computedStyle.width);

                        resizer.style.left = `${actualWidth}px`;
                        resizer.style.pointerEvents = 'auto'; // 恢复拖动功能
                        log.info('展开后设置拖动条位置与侧边栏右侧对齐:', actualWidth);
                    }, 50);
                }

                // 显示子元素
                const sidebarHeader = document.querySelector('.sidebar-header');
                const sessionsContainer = document.querySelector('.sessions-container');
                const sidebarLower = document.getElementById('sidebar-footer');
                const sidebarUpper = document.querySelector('.sidebar-upper');
                const verticalResizer = document.getElementById('sidebar-vertical-resizer');
                const systemItemsContainer = document.getElementById('system-items-container');

                // 恢复上下区域的高度比例
                if (sidebarUpper && sidebarLower && verticalResizer) {
                    verticalResizer.style.display = 'block';

                    // 从本地存储加载上次保存的高度比例
                    const savedUpperHeightPercent = localStorage.getItem('sidebarUpperHeightPercent');
                    if (savedUpperHeightPercent) {
                        const percent = parseFloat(savedUpperHeightPercent);
                        const sidebarHeight = sidebar.clientHeight;
                        const upperHeight = (sidebarHeight - 5) * (percent / 100);
                        const lowerHeight = (sidebarHeight - 5) * ((100 - percent) / 100);

                        // 应用保存的高度比例
                        sidebarUpper.style.height = `${upperHeight}px`;
                        sidebarLower.style.height = `${lowerHeight}px`;

                        // 移除最大最小高度限制，允许自由调整
                        sidebarLower.style.maxHeight = 'none';
                        sidebarLower.style.minHeight = 'auto';

                        // 确保会话列表高度正确设置
                        const sessionsContainer = document.getElementById('sessions-container');
                        if (sessionsContainer) {
                            const sidebarHeader = document.querySelector('.sidebar-header');
                            const headerHeight = sidebarHeader ? sidebarHeader.offsetHeight : 40;

                            // 直接计算内容区域高度并设置
                            const containerHeight = upperHeight - headerHeight;
                            sessionsContainer.style.flex = '0 0 auto'; // 确保不伸缩
                            sessionsContainer.style.height = containerHeight + 'px';
                            sessionsContainer.style.maxHeight = containerHeight + 'px';
                            sessionsContainer.style.minHeight = containerHeight + 'px';

                            log.info('切换侧边栏，更新会话列表高度:', containerHeight);
                        }
                    } else {
                        // 没有保存的比例，使用默认值
                        sidebarUpper.style.height = 'calc(100% - 80px - 5px)';
                        sidebarLower.style.height = '80px';

                        // 移除最大最小高度限制，允许自由调整
                        sidebarLower.style.maxHeight = 'none';
                        sidebarLower.style.minHeight = 'auto';

                        // 使用默认值时设置会话列表高度
                        const sessionsContainer = document.getElementById('sessions-container');
                        if (sessionsContainer) {
                            const sidebarHeader = document.querySelector('.sidebar-header');
                            const headerHeight = sidebarHeader ? sidebarHeader.offsetHeight : 40;
                            // 计算默认高度 - 假设上部区域减去分隔条和下部区域
                            const upperHeight = sidebar.clientHeight - 80 - 5;

                            // 直接计算内容区域高度并设置
                            const containerHeight = upperHeight - headerHeight;
                            sessionsContainer.style.flex = '0 0 auto'; // 确保不伸缩
                            sessionsContainer.style.height = containerHeight + 'px';
                            sessionsContainer.style.maxHeight = containerHeight + 'px';
                            sessionsContainer.style.minHeight = containerHeight + 'px';

                            log.info('使用默认值，更新会话列表高度:', containerHeight);
                        }
                    }
                }

                if (sidebarHeader) {
                    sidebarHeader.style.opacity = '1';
                    sidebarHeader.style.pointerEvents = 'auto';
                    log.info('已设置sidebar-header可见');
                } else {
                    log.error('找不到sidebar-header元素!');
                }

                if (sessionsContainer) {
                    sessionsContainer.style.opacity = '1';
                    sessionsContainer.style.pointerEvents = 'auto';
                    log.info('已设置sessions-container可见');
                } else {
                    log.error('找不到sessions-container元素!');
                }

                // 恢复底部按钮区域样式
                if (sidebarLower) {
                    sidebarLower.classList.remove('collapsed');
                    log.info('已恢复底部按钮为正常状态');
                } else {
                    log.error('找不到底部按钮容器!');
                }

                // 隐藏折叠图标
                const collapseIcon = document.querySelector('.sidebar-collapse-icon');
                if (collapseIcon) {
                    collapseIcon.style.display = 'none';
                    log.info('已设置collapse-icon不可见');
                } else {
                    log.error('找不到sidebar-collapse-icon元素!');
                }

                // 显示折叠按钮
                if (sidebarToggle) {
                    sidebarToggle.style.opacity = '1';
                    sidebarToggle.style.pointerEvents = 'auto';
                    log.info('已设置sidebar-toggle可见');
                } else {
                    log.error('找不到sidebarToggle元素!');
                }

                // 更新拖动条位置
                this.updateResizerPosition();

                // 保存状态到本地存储
                localStorage.setItem('sidebarCollapsed', 'false');

                // 强制重绘
                window.requestAnimationFrame(() => {
                    log.info('请求下一帧重绘，确保样式应用');
                    // 触发重排/重绘，但不隐藏整个body以避免闪烁
                    const _ = sidebar.offsetHeight;
                });
            }

            // 保存状态到本地存储
            localStorage.setItem('sidebarCollapsed', sidebarCollapsed.toString());

            // 更新拖动条位置
            this.updateResizerPosition();
        } catch (error) {
            log.error('应用侧边栏样式时出错:', error.message);
        }

        log.info('Current sidebar classList:', sidebar.classList);
        log.info('Current sidebar computed style:', window.getComputedStyle(sidebar).width);
    }

    // 加载侧边栏状态
    loadSidebarState() {
        log.info('Loading sidebar state');

        // 确保sidebar元素存在
        if (!sidebar) {
            log.error('初始化时找不到sidebar元素!');
            return;
        }

        // 获取保存的宽度设置
        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth) {
            lastSidebarWidth = parseInt(savedWidth);
            log.info('从本地存储读取侧边栏宽度:', lastSidebarWidth);
        }

        const collapsed = localStorage.getItem('sidebarCollapsed');
        log.info('Stored sidebar state:', collapsed);

        try {
            // 修改逻辑：默认折叠，只有明确设置为false时才展开
            if (collapsed !== 'false') {
                log.info('Setting sidebar to collapsed (default)');
                sidebarCollapsed = true;
                sidebar.classList.add('collapsed');

                // 直接设置样式确保折叠效果
                sidebar.style.width = '40px';
                sidebar.style.minWidth = '40px';
                sidebar.style.overflow = 'hidden';
                log.info('初始化时设置sidebar宽度为:', sidebar.style.width);

                // 设置拖动条位置为折叠状态 - 移动到侧边栏右侧
                const resizer = document.getElementById('sidebar-resizer');
                if (resizer) {
                    resizer.style.left = '40px';
                    resizer.style.pointerEvents = 'none'; // 禁用拖动
                    log.info('初始化时设置拖动条位置为折叠状态');
                }

                // 隐藏子元素
                const sidebarHeader = document.querySelector('.sidebar-header');
                const sessionsContainer = document.querySelector('.sessions-container');
                const sidebarLower = document.getElementById('sidebar-footer');

                // 确保系统区域隐藏，会话列表恢复显示（在下次展开时）
                const systemItemsContainer = document.getElementById('system-items-container');
                if (systemItemsContainer) {
                    systemItemsContainer.style.display = 'none';
                    log.info('已隐藏系统区域');
                }

                if (sidebarHeader) {
                    sidebarHeader.style.opacity = '0';
                    sidebarHeader.style.pointerEvents = 'none';
                    log.info('初始化时设置sidebar-header不可见');
                } else {
                    log.error('初始化时找不到sidebar-header元素!');
                }

                if (sessionsContainer) {
                    sessionsContainer.style.opacity = '0';
                    sessionsContainer.style.pointerEvents = 'none';
                    log.info('初始化时设置sessions-container不可见');
                } else {
                    log.error('初始化时找不到sessions-container元素!');
                }

                // 调整底部按钮区域样式为折叠状态
                if (sidebarLower) {
                    sidebarLower.classList.add('collapsed');
                    log.info('已设置底部按钮为折叠状态');
                } else {
                    log.error('找不到底部按钮容器!');
                }

                // 显示折叠图标
                const collapseIcon = document.querySelector('.sidebar-collapse-icon');
                if (collapseIcon) {
                    collapseIcon.style.display = 'flex';
                    collapseIcon.style.opacity = '1';
                    log.info('初始化时设置collapse-icon可见');
                } else {
                    log.error('初始化时找不到sidebar-collapse-icon元素!');
                }

                // 隐藏折叠按钮，但保持可点击状态
                if (sidebarToggle) {
                    sidebarToggle.style.opacity = '0.2'; // 设置为轻微可见
                    sidebarToggle.style.pointerEvents = 'auto'; // 确保可点击
                    log.info('初始化时设置sidebar-toggle半透明但可点击');
                } else {
                    log.error('初始化时找不到sidebarToggle元素!');
                }

                log.info('Sidebar classes after init:', sidebar.classList);
                log.info('Sidebar computed style after init:', window.getComputedStyle(sidebar).width);
            } else {
                log.info('Setting sidebar to expanded (from saved state)');
                sidebarCollapsed = false;

                // 确保侧边栏处于展开状态
                sidebar.classList.remove('collapsed');

                // 设置侧边栏宽度为保存的值或默认值
                sidebar.style.width = lastSidebarWidth ? `${lastSidebarWidth}px` : '250px';
                sidebar.style.minWidth = '180px';
                sidebar.style.overflow = 'auto';

                log.info('初始化时恢复sidebar宽度为:', sidebar.style.width);

                // 更新拖动条位置 - 使用更可靠的方法
                const resizer = document.getElementById('sidebar-resizer');
                if (resizer) {
                    // 等待布局稳定后再设置准确位置
                    setTimeout(() => {
                        // 获取计算后的实际宽度
                        const computedStyle = window.getComputedStyle(sidebar);
                        const actualWidth = parseFloat(computedStyle.width);

                        resizer.style.left = `${actualWidth}px`;
                        resizer.style.pointerEvents = 'auto'; // 确保拖动功能可用
                        log.info('初始化时设置拖动条位置与侧边栏右侧对齐:', actualWidth);
                    }, 50);
                }

                // 显示子元素
                const sidebarHeader = document.querySelector('.sidebar-header');
                const sessionsContainer = document.querySelector('.sessions-container');
                const sidebarLower = document.getElementById('sidebar-footer');
                const systemItemsContainer = document.getElementById('system-items-container');

                if (sidebarHeader) {
                    sidebarHeader.style.opacity = '1';
                    sidebarHeader.style.pointerEvents = 'auto';
                    log.info('已恢复sidebar-header可见性');
                } else {
                    log.error('找不到sidebar-header元素!');
                }

                if (sessionsContainer) {
                    sessionsContainer.style.opacity = '1';
                    sessionsContainer.style.pointerEvents = 'auto';
                    log.info('已恢复sessions-container可见性');
                } else {
                    log.error('找不到sessions-container元素!');
                }

                // 恢复底部按钮区域样式
                if (sidebarLower) {
                    sidebarLower.classList.remove('collapsed');
                    log.info('已恢复底部按钮为正常状态');
                } else {
                    log.error('找不到底部按钮容器!');
                }

                // 显示系统菜单，但初始状态为隐藏
                if (systemItemsContainer) {
                    // 保持display为none，但允许通过点击系统按钮显示
                    systemItemsContainer.style.display = 'none';
                }
            }
        } catch (error) {
            log.error('初始化侧边栏样式时出错:', error.message);
        }
    }

    // 侧边栏折叠/展开按钮的事件处理函数
    handleSidebarToggle(e) {
        log.info('Sidebar toggle button clicked!');
        log.info('Event target:', e.target);
        log.info('Button state:', window.getComputedStyle(sidebarToggle).pointerEvents);
        // 确保阻止事件冒泡和默认行为
        e.stopPropagation();
        e.preventDefault();
        // 调用切换函数
        this.toggleSidebar();
    }

    // 更新拖动条位置的辅助函数
    updateResizerPosition() {
        const resizer = document.getElementById('sidebar-resizer');
        if (!resizer) return;

        // 使用更可靠的方法计算拖动条位置
        if (sidebarCollapsed) {
            resizer.style.left = '40px';
            resizer.style.pointerEvents = 'none'; // 禁用拖动功能
        } else {
            // 使用computed style获取实际宽度，避免同步问题
            const computedStyle = window.getComputedStyle(sidebar);
            const sidebarWidth = parseFloat(computedStyle.width);

            // 确保设置准确的像素值
            resizer.style.left = `${sidebarWidth}px`;
            resizer.style.pointerEvents = 'auto'; // 确保拖动功能可用
        }
        log.info('更新拖动条位置:', resizer.style.left);
    }

    // 初始化侧边栏拖动功能
    initSidebarResize() {
        const resizer = document.getElementById('sidebar-resizer');
        if (!resizer || !sidebar) return;

        // 设置拖动条初始位置
        this.updateResizerPosition();

        // 鼠标按下事件
        resizer.addEventListener('mousedown', (e) => {
            if (sidebarCollapsed) return; // 如果侧边栏已折叠，忽略拖动

            isResizing = true;
            resizer.classList.add('active');

            // 阻止默认事件和文本选择
            e.preventDefault();
            document.body.style.userSelect = 'none';

            // 鼠标移动事件
            const mouseMoveHandler = (e) => {
                if (!isResizing) return;

                let newWidth = e.clientX;

                // 限制宽度范围
                if (newWidth < 180) newWidth = 180;
                if (newWidth > 500) newWidth = 500;

                // 更新侧边栏和拖动条的位置
                sidebar.style.width = `${newWidth}px`;
                resizer.style.left = `${newWidth}px`;

                // 保存当前宽度
                lastSidebarWidth = newWidth;
            };

            // 鼠标释放事件
            const mouseUpHandler = () => {
                if (!isResizing) return;

                isResizing = false;
                resizer.classList.remove('active');

                // 恢复文本选择
                document.body.style.userSelect = '';

                // 保存当前宽度到本地存储
                localStorage.setItem('sidebarWidth', lastSidebarWidth.toString());

                // 移除临时事件监听器
                document.removeEventListener('mousemove', mouseMoveHandler);
                document.removeEventListener('mouseup', mouseUpHandler);
            };

            // 添加临时事件监听器
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
        });
    }

    // 初始化侧边栏垂直拖动调整功能
    initSidebarVerticalResize() {
        const sidebar = document.getElementById('sidebar');
        const sidebarUpper = document.querySelector('.sidebar-upper');
        const sidebarLower = document.getElementById('sidebar-footer');
        const verticalResizer = document.getElementById('sidebar-vertical-resizer');

        if (!verticalResizer || !sidebarUpper || !sidebarLower) {
            log.error('初始化侧边栏垂直拖动功能失败: 找不到必要元素');
            return;
        }

        // 保存上次拖动位置
        let lastVerticalPosition = 0;

        // 保存初始高度比例
        let initialUpperHeight = sidebarUpper.clientHeight;
        let initialLowerHeight = sidebarLower.clientHeight;

        // 从本地存储加载上次保存的高度比例
        const savedUpperHeightPercent = localStorage.getItem('sidebarUpperHeightPercent');
        if (savedUpperHeightPercent) {
            const percent = parseFloat(savedUpperHeightPercent);
            const sidebarHeight = sidebar.clientHeight;
            const upperHeight = (sidebarHeight - 5) * (percent / 100); // 减去分隔条高度
            const lowerHeight = (sidebarHeight - 5) * ((100 - percent) / 100);

            // 应用保存的高度比例
            sidebarUpper.style.height = `${upperHeight}px`;
            sidebarLower.style.height = `${lowerHeight}px`;
        }

        // 鼠标按下事件处理
        verticalResizer.addEventListener('mousedown', (e) => {
            if (sidebar.classList.contains('collapsed')) return;

            e.preventDefault();
            verticalResizer.classList.add('active');
            lastVerticalPosition = e.clientY;
            initialUpperHeight = sidebarUpper.clientHeight;
            initialLowerHeight = sidebarLower.clientHeight;

            // 添加鼠标移动和松开事件监听
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
        });

        // 鼠标移动事件处理
        const mouseMoveHandler = (e) => {
            if (sidebar.classList.contains('collapsed')) return;

            const deltaY = e.clientY - lastVerticalPosition;
            const newUpperHeight = initialUpperHeight + deltaY;
            const newLowerHeight = initialLowerHeight - deltaY;

            // 将最小高度限制降低，只保留30px防止区域完全消失
            if (newUpperHeight < 30 || newLowerHeight < 30) return;

            // 应用新高度
            sidebarUpper.style.height = `${newUpperHeight}px`;
            sidebarLower.style.height = `${newLowerHeight}px`;

            // 移除最大/最小高度限制
            sidebarLower.style.maxHeight = 'none';
            sidebarLower.style.minHeight = 'auto';

            // 更新会话列表高度
            const sessionsContainer = document.getElementById('sessions-container');
            if (sessionsContainer) {
                const sidebarHeader = document.querySelector('.sidebar-header');
                const headerHeight = sidebarHeader ? sidebarHeader.offsetHeight : 40;
                const containerHeight = newUpperHeight - headerHeight;
                sessionsContainer.style.height = `${containerHeight}px`;
                sessionsContainer.style.flex = '0 0 auto';
            }

            // 计算并保存高度百分比
            const totalUsableHeight = initialUpperHeight + initialLowerHeight;
            const upperHeightPercent = (newUpperHeight / totalUsableHeight) * 100;
            localStorage.setItem('sidebarUpperHeightPercent', upperHeightPercent.toString());
        };

        // 鼠标松开事件处理
        const mouseUpHandler = () => {
            verticalResizer.classList.remove('active');
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        };

        // 窗口大小变化时，保持比例
        window.addEventListener('resize', () => {
            if (sidebar.classList.contains('collapsed')) return;

            const savedPercent = localStorage.getItem('sidebarUpperHeightPercent');
            if (savedPercent) {
                const percent = parseFloat(savedPercent);
                const sidebarHeight = sidebar.clientHeight;
                const totalUsableHeight = sidebarHeight - 5; // 减去分隔条高度
                const upperHeight = totalUsableHeight * (percent / 100);
                const lowerHeight = totalUsableHeight * ((100 - percent) / 100);

                sidebarUpper.style.height = `${upperHeight}px`;
                sidebarLower.style.height = `${lowerHeight}px`;

                // 移除最大/最小高度限制
                sidebarLower.style.maxHeight = 'none';
                sidebarLower.style.minHeight = 'auto';

                // 确保会话列表高度与sidebar-upper底部对齐
                const sessionsContainer = document.getElementById('sessions-container');
                if (sessionsContainer) {
                    const sidebarHeader = document.querySelector('.sidebar-header');
                    const headerHeight = sidebarHeader ? sidebarHeader.offsetHeight : 40;

                    // 直接计算内容区域高度并设置
                    const containerHeight = upperHeight - headerHeight;
                    sessionsContainer.style.flex = '0 0 auto'; // 确保不伸缩
                    sessionsContainer.style.height = containerHeight + 'px';
                    sessionsContainer.style.maxHeight = containerHeight + 'px';
                    sessionsContainer.style.minHeight = containerHeight + 'px';

                    log.info('窗口调整大小，更新会话列表高度:', containerHeight);
                }
            }
        });
    }

    // Add sidebar resizing functionality
    setupSidebarResizing() {
        const sidebar = document.querySelector('.sidebar');
        const sidebarResizer = document.querySelector('.sidebar-resizer');
        const sidebarVerticalResizer = document.querySelector('.sidebar-vertical-resizer');
        const sidebarUpper = document.querySelector('.sidebar-upper');
        const sidebarLower = document.querySelector('.sidebar-lower');

        if (!sidebar || !sidebarResizer || !sidebarVerticalResizer) {
            log.error('无法找到侧边栏拖动所需的元素!');
            return;
        }

        log.info('正在初始化侧边栏拖动功能...');

        // 更可靠的拖动条位置更新函数
        function syncResizerPosition() {
            if (!sidebar || !sidebarResizer) return;

            if (sidebar.classList.contains('collapsed')) {
                sidebarResizer.style.left = '40px';
            } else {
                // 使用computed style获取实际宽度，避免可能的同步问题
                const computedStyle = window.getComputedStyle(sidebar);
                const sidebarWidth = parseFloat(computedStyle.width);

                // 确保设置准确的像素值
                sidebarResizer.style.left = `${sidebarWidth}px`;
            }
        }

        // 设置拖动条初始位置
        syncResizerPosition();

        // 确保拖动条可以触发事件 - 这是关键修复
        if (!sidebar.classList.contains('collapsed')) {
            sidebarResizer.style.pointerEvents = 'auto';
            log.info('设置拖动条事件为可用状态');
        }

        // 移除可能已存在的事件监听器以避免重复绑定
        sidebarResizer.removeEventListener('mousedown', handleResizerMouseDown);
        document.removeEventListener('mousemove', handleResizerMouseMove);
        document.removeEventListener('mouseup', handleResizerMouseUp);

        sidebarVerticalResizer.removeEventListener('mousedown', handleVerticalResizerMouseDown);
        document.removeEventListener('mousemove', handleVerticalResizerMouseMove);
        document.removeEventListener('mouseup', handleVerticalResizerMouseUp);

        // 添加新的事件监听器
        sidebarResizer.addEventListener('mousedown', handleResizerMouseDown);
        sidebarVerticalResizer.addEventListener('mousedown', handleVerticalResizerMouseDown);

        // 水平拖动相关变量
        let isResizing = false;
        // 垂直拖动相关变量
        let isVerticalResizing = false;

        // 鼠标按下拖动条事件处理函数
        function handleResizerMouseDown(e) {
            // 只有在侧边栏非折叠状态下才能拖动
            if (sidebar.classList.contains('collapsed')) return;

            log.info('拖动条鼠标按下事件触发');
            isResizing = true;
            sidebar.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();

            // 添加临时事件监听器
            document.addEventListener('mousemove', handleResizerMouseMove);
            document.addEventListener('mouseup', handleResizerMouseUp);
        }

        // 鼠标移动事件处理函数
        function handleResizerMouseMove(e) {
            if (!isResizing) return;

            // 确保侧边栏非折叠状态
            if (sidebar.classList.contains('collapsed')) {
                isResizing = false;
                sidebar.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                return;
            }

            const newWidth = e.clientX;

            // Apply min/max constraints
            if (newWidth >= 180 && newWidth <= 500) {
                sidebar.style.width = newWidth + 'px';
                sidebarResizer.style.left = newWidth + 'px';

                // 保存当前宽度，以便在切换折叠/展开状态时使用
                lastSidebarWidth = newWidth;
                log.info('拖动调整侧边栏宽度:', newWidth);
            }
        }

        // 鼠标释放事件处理函数
        function handleResizerMouseUp() {
            if (!isResizing) return;

            log.info('拖动完成，保存宽度:', lastSidebarWidth);
            isResizing = false;
            sidebar.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // 移除临时事件监听器
            document.removeEventListener('mousemove', handleResizerMouseMove);
            document.removeEventListener('mouseup', handleResizerMouseUp);

            // Save the width in local storage for persistence
            if (!sidebar.classList.contains('collapsed')) {
                localStorage.setItem('sidebarWidth', lastSidebarWidth.toString());
                // 确保拖动完成后位置准确
                syncResizerPosition();
            }
        }

        // 垂直分隔条的鼠标按下事件处理函数
        function handleVerticalResizerMouseDown(e) {
            // 只在侧边栏非折叠状态下才能进行垂直拖动
            if (sidebar.classList.contains('collapsed')) return;

            log.info('垂直拖动条鼠标按下事件触发');
            isVerticalResizing = true;
            sidebarUpper.classList.add('resizing');
            sidebarLower.classList.add('resizing');
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();

            // 添加临时事件监听器
            document.addEventListener('mousemove', handleVerticalResizerMouseMove);
            document.addEventListener('mouseup', handleVerticalResizerMouseUp);
        }

        // 垂直拖动的鼠标移动事件处理函数
        function handleVerticalResizerMouseMove(e) {
            if (!isVerticalResizing) return;

            // 确保侧边栏非折叠状态
            if (sidebar.classList.contains('collapsed')) {
                isVerticalResizing = false;
                sidebarUpper.classList.remove('resizing');
                sidebarLower.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                return;
            }

            const sidebarRect = sidebar.getBoundingClientRect();
            const upperHeight = e.clientY - sidebarRect.top;
            const lowerHeight = sidebarRect.height - upperHeight - sidebarVerticalResizer.offsetHeight;

            // 移除最小高度限制，允许上下区域自由调整高度
            // 只保留最小值30px的限制，防止区域完全消失
            if (upperHeight >= 30 && lowerHeight >= 30) {
                sidebarUpper.style.height = upperHeight + 'px';
                sidebarLower.style.height = lowerHeight + 'px';

                // 移除最大/最小高度限制
                sidebarLower.style.maxHeight = 'none';
                sidebarLower.style.minHeight = 'auto';

                // 确保会话列表底部与sidebar-upper底部对齐
                const sessionsContainer = document.getElementById('sessions-container');
                if (sessionsContainer) {
                    const sidebarHeader = document.querySelector('.sidebar-header');
                    const headerHeight = sidebarHeader ? sidebarHeader.offsetHeight : 40;

                    // 直接计算内容区域高度并设置，移除所有可能冲突的样式
                    const containerHeight = upperHeight - headerHeight;
                    sessionsContainer.style.flex = '0 0 auto'; // 确保不伸缩
                    sessionsContainer.style.height = containerHeight + 'px';
                    sessionsContainer.style.maxHeight = containerHeight + 'px';
                    sessionsContainer.style.minHeight = containerHeight + 'px';

                    log.info('更新会话列表高度:', containerHeight);
                }

                log.info('拖动调整垂直比例，上部高度:', upperHeight, '下部高度:', lowerHeight);
            }
        }

        // 垂直拖动的鼠标释放事件处理函数
        function handleVerticalResizerMouseUp() {
            if (!isVerticalResizing) return;

            log.info('垂直拖动完成');
            isVerticalResizing = false;
            sidebarUpper.classList.remove('resizing');
            sidebarLower.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // 移除临时事件监听器
            document.removeEventListener('mousemove', handleVerticalResizerMouseMove);
            document.removeEventListener('mouseup', handleVerticalResizerMouseUp);

            // 计算并保存高度百分比，以便恢复时使用
            if (!sidebar.classList.contains('collapsed')) {
                const totalHeight = sidebar.clientHeight - sidebarVerticalResizer.offsetHeight;
                const upperHeightPercent = (sidebarUpper.clientHeight / totalHeight) * 100;
                localStorage.setItem('sidebarUpperHeightPercent', upperHeightPercent.toString());
                log.info('保存垂直比例:', upperHeightPercent);
            }
        }

        // Restore saved width on page load if exists
        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth && !sidebar.classList.contains('collapsed')) {
            sidebar.style.width = savedWidth;
            sidebarResizer.style.left = savedWidth;
            log.info('从存储恢复侧边栏宽度:', savedWidth);
        }

        // DOM完全加载后再次确认拖动条位置
        window.addEventListener('load', () => {
            // 延迟执行，确保所有CSS和布局已完成
            setTimeout(() => {
                syncResizerPosition();
                log.info('DOM完全加载后再次同步拖动条位置');
            }, 100);
        });

        // 每当侧边栏宽度变化时更新拖动条位置
        const resizeObserver = new ResizeObserver(() => {
            if (!sidebar.classList.contains('collapsed') && !isResizing) {
                syncResizerPosition();
            }
        });

        // 监视侧边栏大小变化
        resizeObserver.observe(sidebar);
    }

    setupEventListeners() {
        // 添加侧边栏折叠/展开按钮的事件监听器
        if (sidebarToggle) {
            log.info('Adding click event to sidebar toggle button');

            // 移除之前可能存在的事件监听器，避免重复
            sidebarToggle.removeEventListener('click', this.handleSidebarToggle);

            // 使用捕获模式添加事件，确保事件首先被这个处理程序接收
            sidebarToggle.addEventListener('click', this.handleSidebarToggle.bind(this), true);

            // 增强按钮的可视性，便于调试
            sidebarToggle.style.zIndex = '100';
        } else {
            log.error('Sidebar toggle button not found!');
        }

        // 获取时钟图标元素并添加点击事件
        const sidebarCollapseIcon = document.querySelector('.sidebar-collapse-icon');
        if (sidebarCollapseIcon) {
            sidebarCollapseIcon.addEventListener('click', function (e) {
                log.info('Sidebar collapse icon clicked');
                if (sidebarCollapsed) {
                    this.toggleSidebar();
                    e.stopPropagation(); // 阻止事件冒泡
                }
            }.bind(this));
        }

        // 设置按钮的点击事件
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', function (e) {
                e.stopPropagation(); // 阻止事件冒泡
                openSettingsWindow();
            });
        } else {
            log.error('Settings button not found!');
        }

        // 点击收起状态下的侧边栏区域也可以展开
        sidebar.addEventListener('click', (e) => {
            if (sidebarCollapsed) {
                this.toggleSidebar();
            }
        });
    }

    // 初始化会话列表高度
    initSessionsContainerHeight() {
        const sidebar = document.getElementById('sidebar');
        const sidebarUpper = document.querySelector('.sidebar-upper');
        const sessionsContainer = document.getElementById('sessions-container');
        const sidebarHeader = document.querySelector('.sidebar-header');

        if (!sidebar || !sidebarUpper || !sessionsContainer || !sidebarHeader) {
            log.error('初始化会话列表高度失败：找不到必要的DOM元素');
            return;
        }

        // 获取sidebar-header的实际高度
        const headerHeight = sidebarHeader.offsetHeight;

        // 计算会话列表应有的高度 = sidebar-upper高度 - header高度
        const upperHeight = sidebarUpper.offsetHeight;
        const containerHeight = upperHeight - headerHeight;

        // 直接计算内容区域高度并设置
        sessionsContainer.style.flex = '0 0 auto'; // 确保不伸缩
        sessionsContainer.style.height = containerHeight + 'px';
        sessionsContainer.style.maxHeight = containerHeight + 'px';
        sessionsContainer.style.minHeight = containerHeight + 'px';

        log.info('初始化会话列表高度：', containerHeight);
    }
}

// 修改调试功能
setTimeout(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        // 调整：不强制设置样式，避免覆盖toggleSidebar中的设置
        // sidebar.style.cssText = "width: 250px !important; min-width: 250px !important; transition: all 0.3s ease !important;";
        // 改为只设置过渡效果
        sidebar.style.transition = "all 0.3s ease";
        log.info('已设置过渡效果: ' + sidebar.style.transition);

        // 检查sidebarToggle按钮状态
        if (sidebarToggle) {
            // 确保按钮始终可点击
            sidebarToggle.style.pointerEvents = 'auto';
        }

        // 为调试添加一个全局函数
        window.debugToggleSidebar = function () {
            log.info('手动调用toggleSidebar');
            sidebarService.toggleSidebar();
        };
    }
}, 1000);


// 导出sidebarService实例 全局唯一
const sidebarService = new SidebarService();
module.exports = sidebarService;

// 将toggleSidebar函数暴露到全局，以便在HTML中直接调用
window.toggleSidebar = sidebarService.toggleSidebar.bind(sidebarService);
