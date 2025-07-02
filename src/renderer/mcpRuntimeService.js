// 获取并渲染 MCP 运行环境信息
let ipcRenderer;
if (typeof window !== 'undefined' && window.ipcRenderer) {
    ipcRenderer = window.ipcRenderer;
} else {
    try {
        ipcRenderer = require('electron').ipcRenderer;
    } catch { }
}

class McpRuntimeService {
    constructor() {
        this.installTasks = {}; // 记录所有安装任务 { taskKey: { version, rowEl } }
        this.activeInstallCount = 0; // 记录当前正在进行的安装任务数

        ipcRenderer.on('node-install-progress', (event, data) => {
            this.handleNodeInstallProgress(data);
        });

        // 监听Python安装进度事件
        ipcRenderer.on('python-install-progress', (event, data) => {
            this.handlePythonInstallProgress(data);
        });
    }

    /**
     * 初始化检查并安装缺失的运行环境
     */
    async initializeRuntimes() {
        try {
            const info = await ipcRenderer.invoke('get-mcp-runtime-info');

            // 检查Node.js
            if (!info.node || info.node.length === 0) {
                log.info('未检测到Node.js环境，开始安装...');
                const taskKey = 'v22.16.0';
                this.addNodeInstallRow(taskKey, 'v22.16.0');
                await this.installNodeRuntimeWithProgress(taskKey, 'v22.16.0');
            }

            // 检查Python
            if (!info.python || info.python.length === 0) {
                log.info('未检测到Python环境，开始安装...');
                const taskKey = '3.11.9';
                this.addPythonInstallRow(taskKey, '3.11.9');
                await this.installPythonRuntimeWithProgress(taskKey, '3.11.9');
            }
        } catch (e) {
            log.error('初始化运行环境失败:', e);
        }
    }

    /**
     * 禁用窗口关闭
     */
    disableWindowClose() {
        this.activeInstallCount++;
        if (this.activeInstallCount === 1) {
            ipcRenderer.invoke('disable-window-close');
        }
    }

    /**
     * 启用窗口关闭
     */
    enableWindowClose() {
        this.activeInstallCount--;
        if (this.activeInstallCount <= 0) {
            this.activeInstallCount = 0;
            ipcRenderer.invoke('enable-window-close');
        }
    }

    /**
     * 获取并渲染 MCP 运行环境信息
     * @param {HTMLElement} loadingEl 加载提示元素
     */
    async loadRuntimeInfo(loadingEl) {
        if (loadingEl) {
            loadingEl.style.display = '';
        }
        try {
            const info = await ipcRenderer.invoke('get-mcp-runtime-info');
            if (loadingEl) {
                loadingEl.style.display = 'none';
            }
            const nodeTbody = document.getElementById('nodejs-runtime-tbody');
            const nodeEmpty = document.getElementById('nodejs-runtime-empty');
            const pythonTbody = document.getElementById('python-runtime-tbody');
            const pythonEmpty = document.getElementById('python-runtime-empty');
            if (nodeTbody && nodeEmpty) {
                nodeTbody.innerHTML = '';
                if (info.node && info.node.length > 0) {
                    nodeEmpty.style.display = 'none';
                    nodeTbody.innerHTML = info.node.map(n =>
                        `<tr data-node-version="${n.version}"><td><b>${n.version}</b></td><td style=\"font-family:monospace;\">${n.path}</td><td><button class='nodejs-delete-btn' data-version='${n.version}'>删除</button></td></tr>`
                    ).join('');
                } else {
                    nodeEmpty.style.display = '';
                    nodeEmpty.innerText = '未检测到Node.js环境';
                }
            }
            if (pythonTbody && pythonEmpty) {
                pythonTbody.innerHTML = '';
                if (info.python && info.python.length > 0) {
                    pythonEmpty.style.display = 'none';
                    pythonTbody.innerHTML = info.python.map(p =>
                        `<tr data-python-version="${p.version}"><td><b>${p.version}</b></td><td style=\"font-family:monospace;\">${p.path}</td><td><button class='python-delete-btn' data-version='${p.version}'>删除</button></td></tr>`
                    ).join('');
                } else {
                    pythonEmpty.style.display = '';
                    pythonEmpty.innerText = '未检测到Python环境';
                }
            }
            // 绑定删除按钮事件
            this.bindNodeDeleteButtons();
            // 绑定Python删除按钮事件
            this.bindPythonDeleteButtons();
        } catch (e) {
            if (loadingEl) loadingEl.style.display = 'none';
            const nodeTbody = document.getElementById('nodejs-runtime-tbody');
            const nodeEmpty = document.getElementById('nodejs-runtime-empty');
            const pythonTbody = document.getElementById('python-runtime-tbody');
            const pythonEmpty = document.getElementById('python-runtime-empty');
            if (nodeTbody && nodeEmpty) {
                nodeTbody.innerHTML = '';
                nodeEmpty.style.display = '';
                nodeEmpty.innerText = '加载Node.js环境信息失败';
            }
            if (pythonTbody && pythonEmpty) {
                pythonTbody.innerHTML = '';
                pythonEmpty.style.display = '';
                pythonEmpty.innerText = '加载Python环境信息失败';
            }
        }
    }

    /**
     * 绑定Node.js安装按钮事件
     * @param {HTMLElement} installBtn 安装按钮
     */
    bindNodeInstallButton(installBtn) {
        installBtn.addEventListener('click', async () => {
            const version = await this.promptNodeVersion();
            if (version === null) {
                return; // 用户点击取消，直接返回
            }

            // 用户点击确定但没有输入时使用默认版本
            const finalVersion = version || "v22.16.0";

            // 生成唯一任务key
            const taskKey = `${finalVersion}`;
            this.addNodeInstallRow(taskKey, finalVersion);
            // 开始安装，不影响按钮状态
            this.installNodeRuntimeWithProgress(taskKey, finalVersion);
        });
    }

    /**
     * 在表格插入安装进度行
     * @param {string} taskKey 任务唯一key
     * @param {string} version 版本号
     */
    addNodeInstallRow(taskKey, version) {
        const nodeTbody = document.getElementById('nodejs-runtime-tbody');
        if (!nodeTbody) {
            return;
        }
        const tr = document.createElement('tr');
        tr.setAttribute('data-task-key', taskKey);
        tr.innerHTML = `<td><b>${version || '推荐'}</b> <span style="color:#888;">(安装中...)</span></td><td id="progress-${taskKey}" style="font-family:monospace;">0% | -</td>`;
        nodeTbody.appendChild(tr);
        this.installTasks[taskKey] = { version, rowEl: tr };
        // 隐藏"未检测到Node.js环境"
        const nodeEmpty = document.getElementById('nodejs-runtime-empty');
        if (nodeEmpty) {
            nodeEmpty.style.display = 'none';
        }
    }

    /**
     * 处理主进程发来的安装进度事件
     * @param {object} data { taskKey, percent, speed, status, error }
     */
    handleNodeInstallProgress(data) {
        const { taskKey, percent, speed, status, error } = data;
        const task = this.installTasks[taskKey];
        if (!task) {
            return;
        }

        let progressTd = document.getElementById(`progress-${taskKey}`);
        if (!progressTd) {
            this.addNodeInstallRow(taskKey, task.version);
            progressTd = document.getElementById(`progress-${taskKey}`);
        }

        if (status === 'installing') {
            progressTd.textContent = `${percent}% | ${speed || '-'} MB/s`;
        } else if (status === 'success') {
            progressTd.textContent = '安装完成';
            setTimeout(() => {
                this.removeNodeInstallRow(taskKey);
                this.loadRuntimeInfo();
                this.enableWindowClose();
            }, 1000);
        } else if (status === 'error') {
            progressTd.textContent = `安装失败: ${error || '未知错误'}`;
            setTimeout(() => {
                this.removeNodeInstallRow(taskKey);
                this.loadRuntimeInfo();
                this.enableWindowClose();
            }, 2000);
        }
    }

    /**
     * 移除安装进度行
     * @param {string} taskKey 任务唯一key
     */
    removeNodeInstallRow(taskKey) {
        const task = this.installTasks[taskKey];
        if (task && task.rowEl && task.rowEl.parentNode) {
            task.rowEl.parentNode.removeChild(task.rowEl);
        }
        delete this.installTasks[taskKey];
    }

    /**
     * 启动带进度的Node.js安装
     * @param {string} taskKey 任务唯一key
     * @param {string} version 版本号
     */
    async installNodeRuntimeWithProgress(taskKey, version) {
        try {
            this.disableWindowClose();
            // 传递 taskKey 给主进程，主进程需在进度事件中带回
            await ipcRenderer.invoke('install-node-runtime', version || '', taskKey);
            // 安装完成/失败由进度事件处理
        } catch (e) {
            this.handleNodeInstallProgress({ taskKey, status: 'error', error: e.message });
            this.enableWindowClose();
        }
    }

    /**
     * 弹出输入框让用户输入Node.js版本，支持深浅色模式
     * @returns {Promise<string|null>} 用户输入的版本号，取消返回null
     */
    async promptNodeVersion() {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'custom-dialog';
            // 样式全部交由CSS控制

            // 创建遮罩层
            const mask = document.createElement('div');
            mask.className = 'custom-dialog-mask';

            // 点击遮罩关闭弹窗
            mask.addEventListener('click', (e) => {
                if (e.target === mask) {
                    document.body.removeChild(mask);
                    document.body.removeChild(dialog);
                    resolve(null);
                }
            });

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = '如 v22.16.0，留空为推荐';
            input.className = 'custom-dialog-input';
            dialog.appendChild(input);

            const btnRow = document.createElement('div');
            btnRow.className = 'custom-dialog-btn-row';

            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            cancelBtn.className = 'custom-dialog-cancel-btn';
            cancelBtn.onclick = () => {
                if (document.body.contains(mask)) {
                    document.body.removeChild(mask);
                }
                document.body.removeChild(dialog);
                resolve(null);
            };
            btnRow.appendChild(cancelBtn);

            const okBtn = document.createElement('button');
            okBtn.textContent = '确定';
            okBtn.className = 'custom-dialog-ok-btn';
            okBtn.onclick = () => {
                const val = input.value.trim();
                if (document.body.contains(mask)) {
                    document.body.removeChild(mask);
                }
                document.body.removeChild(dialog);
                resolve(val);
            };
            btnRow.appendChild(okBtn);

            dialog.appendChild(btnRow);

            document.body.appendChild(mask);
            document.body.appendChild(dialog);

            // 阻止点击 dialog 时事件冒泡到 mask
            dialog.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            input.focus();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    okBtn.click();
                }
                if (e.key === 'Escape') {
                    cancelBtn.click();
                }
            });
        });
    }

    /**
     * 绑定Node.js删除按钮事件
     */
    bindNodeDeleteButtons() {
        const btns = document.querySelectorAll('.nodejs-delete-btn');
        btns.forEach(btn => {
            btn.onclick = async (e) => {
                const version = btn.getAttribute('data-version');
                if (!version) {
                    return;
                }
                if (!window.confirm(`确定要删除 Node.js 版本 ${version} 吗？`)) {
                    return;
                }
                const result = await this.uninstallNodeRuntime(version);
                if (result.success) {
                    alert('删除成功');
                    this.loadRuntimeInfo();
                } else {
                    alert('删除失败：' + (result.error || '未知错误'));
                }
            };
        });
    }

    /**
     * 删除指定版本Node.js
     * @param {string} version 版本号
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async uninstallNodeRuntime(version) {
        try {
            const result = await ipcRenderer.invoke('uninstall-node-runtime', version);
            return result;
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 启动带进度的Python安装
     * @param {string} taskKey 任务唯一key
     * @param {string} version 版本号
     * @param {HTMLElement} loadingEl 加载提示元素
     */
    async installPythonRuntimeWithProgress(taskKey, version) {
        try {
            this.disableWindowClose();
            // 传递 taskKey 给主进程，主进程需在进度事件中带回
            await ipcRenderer.invoke('install-python-runtime', version || '', taskKey);
            // 安装完成/失败由进度事件处理
        } catch (e) {
            this.handlePythonInstallProgress({ taskKey, status: 'error', error: e.message });
            this.enableWindowClose();
        }
    }

    /**
     * 在表格插入Python安装进度行
     * @param {string} taskKey 任务唯一key
     * @param {string} version 版本号
     */
    addPythonInstallRow(taskKey, version) {
        const pythonTbody = document.getElementById('python-runtime-tbody');
        if (!pythonTbody) {
            return;
        }
        const tr = document.createElement('tr');
        tr.setAttribute('data-task-key', taskKey);
        tr.innerHTML = `<td><b>${version || '推荐'}</b> <span style="color:#888;">(安装中...)</span></td><td id="python-progress-${taskKey}" style="font-family:monospace;">0% | -</td><td></td>`;
        pythonTbody.appendChild(tr);
        this.installTasks[taskKey] = { version, rowEl: tr, isPython: true };
        // 隐藏"未检测到Python环境"
        const pythonEmpty = document.getElementById('python-runtime-empty');
        if (pythonEmpty) {
            pythonEmpty.style.display = 'none';
        }
    }

    /**
     * 处理主进程发来的Python安装进度事件
     * @param {object} data { taskKey, percent, speed, status, error }
     */
    handlePythonInstallProgress(data) {
        const { taskKey, percent, speed, status, error } = data;
        const task = this.installTasks[taskKey];
        if (!task) {
            return;
        }
        let progressTd = document.getElementById(`python-progress-${taskKey}`);
        if (!progressTd) {
            this.addPythonInstallRow(taskKey, task.version);
            progressTd = document.getElementById(`python-progress-${taskKey}`);
        }

        if (status === 'installing') {
            progressTd.textContent = `${percent}% | ${speed || '-'} MB/s`;
        } else if (status === 'success') {
            progressTd.textContent = '安装完成';
            setTimeout(() => {
                this.removePythonInstallRow(taskKey);
                this.loadRuntimeInfo();
                this.enableWindowClose();
            }, 1000);
        } else if (status === 'error') {
            progressTd.textContent = `安装失败: ${error || '未知错误'}`;
            setTimeout(() => {
                this.removePythonInstallRow(taskKey);
                this.loadRuntimeInfo();
                this.enableWindowClose();
            }, 2000);
        }
    }

    /**
     * 移除Python安装进度行
     * @param {string} taskKey 任务唯一key
     */
    removePythonInstallRow(taskKey) {
        const task = this.installTasks[taskKey];
        if (task && task.rowEl && task.rowEl.parentNode) {
            task.rowEl.parentNode.removeChild(task.rowEl);
        }
        delete this.installTasks[taskKey];
    }

    /**
     * 绑定Python安装按钮事件
     * @param {HTMLElement} installBtn 安装按钮
     * @param {HTMLElement} loadingEl 加载提示元素
     */
    bindPythonInstallButton(installBtn) {
        installBtn.addEventListener('click', async () => {
            const version = await this.promptPythonVersion();
            if (version === null) {
                return; // 用户点击取消，直接返回
            }

            // 用户点击确定但没有输入时使用默认版本
            const finalVersion = version || "3.11.9";

            // 生成唯一任务key
            const taskKey = `${finalVersion}`;
            this.addPythonInstallRow(taskKey, finalVersion);
            // 开始安装
            this.installPythonRuntimeWithProgress(taskKey, finalVersion);
        });
    }

    /**
     * 弹出输入框让用户输入Python版本，支持深浅色模式
     * @returns {Promise<string|null>} 用户输入的版本号，取消返回null
     */
    async promptPythonVersion() {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'custom-dialog';
            const mask = document.createElement('div');
            mask.className = 'custom-dialog-mask';
            mask.addEventListener('click', (e) => {
                if (e.target === mask) {
                    document.body.removeChild(mask);
                    document.body.removeChild(dialog);
                    resolve(null);
                }
            });
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = '如 3.11.9，留空为推荐';
            input.className = 'custom-dialog-input';
            dialog.appendChild(input);
            const btnRow = document.createElement('div');
            btnRow.className = 'custom-dialog-btn-row';
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = '取消';
            cancelBtn.className = 'custom-dialog-cancel-btn';
            cancelBtn.onclick = () => {
                if (document.body.contains(mask)) {
                    document.body.removeChild(mask);
                }
                document.body.removeChild(dialog);
                resolve(null);
            };
            btnRow.appendChild(cancelBtn);
            const okBtn = document.createElement('button');
            okBtn.textContent = '确定';
            okBtn.className = 'custom-dialog-ok-btn';
            okBtn.onclick = () => {
                const val = input.value.trim();
                if (document.body.contains(mask)) {
                    document.body.removeChild(mask);
                }
                document.body.removeChild(dialog);
                resolve(val);
            };
            btnRow.appendChild(okBtn);
            dialog.appendChild(btnRow);
            document.body.appendChild(mask);
            document.body.appendChild(dialog);
            dialog.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            input.focus();
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    okBtn.click();
                }
                if (e.key === 'Escape') {
                    cancelBtn.click();
                }
            });
        });
    }

    /**
     * 绑定Python删除按钮事件
     */
    bindPythonDeleteButtons() {
        const btns = document.querySelectorAll('.python-delete-btn');
        btns.forEach(btn => {
            btn.onclick = async (e) => {
                const version = btn.getAttribute('data-version');
                if (!version) {
                    return;
                }
                if (!window.confirm(`确定要删除 Python 版本 ${version} 吗？`)) {
                    return;
                }
                const result = await this.uninstallPythonRuntime(version);
                if (result.success) {
                    alert('删除成功');
                    this.loadRuntimeInfo();
                } else {
                    alert('删除失败：' + (result.error || '未知错误'));
                }
            };
        });
    }

    /**
     * 删除指定版本Python
     * @param {string} version 版本号
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async uninstallPythonRuntime(version) {
        try {
            const result = await ipcRenderer.invoke('uninstall-python-runtime', version);
            return result;
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

// 挂载到window，便于外部调用
const mcpRuntimeService = new McpRuntimeService();
module.exports = mcpRuntimeService;

window.addEventListener('DOMContentLoaded', () => {
    // 绑定Node.js安装按钮
    const installNodeBtn = document.getElementById('installNodeBtn');
    mcpRuntimeService.bindNodeInstallButton(installNodeBtn);

    // 绑定Python安装按钮
    const installPythonBtn = document.getElementById('installPythonBtn');
    mcpRuntimeService.bindPythonInstallButton(installPythonBtn);

    setTimeout(() => {
        mcpRuntimeService.initializeRuntimes();
    }, 0);
});