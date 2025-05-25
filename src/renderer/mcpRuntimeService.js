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
        this.ipcRenderer = ipcRenderer;
        this.installTasks = {}; // 记录所有安装任务 { taskKey: { version, rowEl } }
        if (this.ipcRenderer) {
            this.ipcRenderer.on('node-install-progress', (event, data) => {
                this.handleNodeInstallProgress(data);
            });
        }
    }

    /**
     * 获取并渲染 MCP 运行环境信息
     * @param {HTMLElement} loadingEl 加载提示元素
     */
    async loadRuntimeInfo(loadingEl) {
        if (!this.ipcRenderer) return;
        if (loadingEl) loadingEl.style.display = '';
        try {
            const info = await this.ipcRenderer.invoke('get-mcp-runtime-info');
            if (loadingEl) loadingEl.style.display = 'none';
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
                    pythonTbody.innerHTML = info.python.map(p => `<tr><td><b>${p.version}</b></td><td style=\"font-family:monospace;\">${p.path}</td></tr>`).join('');
                } else {
                    pythonEmpty.style.display = '';
                    pythonEmpty.innerText = '未检测到Python环境';
                }
            }
            // 绑定删除按钮事件
            this.bindNodeDeleteButtons();
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
     * 安装Node.js运行环境
     * @param {string} version 版本号，如 'v22.16.0'，可为空
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async installNodeRuntime(version) {
        if (!this.ipcRenderer) return { success: false, error: 'ipcRenderer not available' };
        try {
            const result = await this.ipcRenderer.invoke('install-node-runtime', version || '');
            return result;
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 绑定Node.js安装按钮事件
     * @param {HTMLElement} installBtn 安装按钮
     * @param {undefined} _versionInput 兼容参数，已废弃
     * @param {HTMLElement} loadingEl 加载提示元素
     */
    bindNodeInstallButton(installBtn, _versionInput, loadingEl) {
        if (!installBtn) return;
        installBtn.addEventListener('click', async () => {
            const version = await this.promptNodeVersion();
            if (version === null) return; // 用户取消
            // 生成唯一任务key
            const taskKey = `${version || '推荐'}-${Date.now()}`;
            this.addNodeInstallRow(taskKey, version);
            // 开始安装，不影响按钮状态
            this.installNodeRuntimeWithProgress(taskKey, version, loadingEl);
        });
    }

    /**
     * 在表格插入安装进度行
     * @param {string} taskKey 任务唯一key
     * @param {string} version 版本号
     */
    addNodeInstallRow(taskKey, version) {
        const nodeTbody = document.getElementById('nodejs-runtime-tbody');
        if (!nodeTbody) return;
        const tr = document.createElement('tr');
        tr.setAttribute('data-task-key', taskKey);
        tr.innerHTML = `<td><b>${version || '推荐'}</b> <span style="color:#888;">(安装中...)</span></td><td id="progress-${taskKey}" style="font-family:monospace;">0% | -</td>`;
        nodeTbody.appendChild(tr);
        this.installTasks[taskKey] = { version, rowEl: tr };
        // 隐藏"未检测到Node.js环境"
        const nodeEmpty = document.getElementById('nodejs-runtime-empty');
        if (nodeEmpty) nodeEmpty.style.display = 'none';
    }

    /**
     * 处理主进程发来的安装进度事件
     * @param {object} data { taskKey, percent, speed, status, error }
     */
    handleNodeInstallProgress(data) {
        const { taskKey, percent, speed, status, error } = data;
        const task = this.installTasks[taskKey];
        if (!task) return;
        const progressTd = document.getElementById(`progress-${taskKey}`);
        if (progressTd) {
            if (status === 'installing') {
                progressTd.textContent = `${percent}% | ${speed || '-'} MB/s`;
            } else if (status === 'success') {
                progressTd.textContent = '安装完成';
                setTimeout(() => {
                    this.removeNodeInstallRow(taskKey);
                    this.loadRuntimeInfo();
                }, 1000);
            } else if (status === 'error') {
                progressTd.textContent = `安装失败: ${error || '未知错误'}`;
                setTimeout(() => {
                    this.removeNodeInstallRow(taskKey);
                    this.loadRuntimeInfo();
                }, 2000);
            }
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
     * @param {HTMLElement} loadingEl 加载提示元素
     */
    async installNodeRuntimeWithProgress(taskKey, version, loadingEl) {
        if (!this.ipcRenderer) return;
        try {
            // 传递 taskKey 给主进程，主进程需在进度事件中带回
            const result = await this.ipcRenderer.invoke('install-node-runtime', version || '', taskKey);
            // 安装完成/失败由进度事件处理
        } catch (e) {
            this.handleNodeInstallProgress({ taskKey, status: 'error', error: e.message });
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
                if (document.body.contains(mask)) document.body.removeChild(mask);
                document.body.removeChild(dialog);
                resolve(null);
            };
            btnRow.appendChild(cancelBtn);

            const okBtn = document.createElement('button');
            okBtn.textContent = '确定';
            okBtn.className = 'custom-dialog-ok-btn';
            okBtn.onclick = () => {
                const val = input.value.trim();
                if (document.body.contains(mask)) document.body.removeChild(mask);
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
                if (e.key === 'Enter') okBtn.click();
                if (e.key === 'Escape') cancelBtn.click();
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
                if (!version) return;
                if (!window.confirm(`确定要删除 Node.js 版本 ${version} 吗？`)) return;
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
        if (!this.ipcRenderer) return { success: false, error: 'ipcRenderer 不可用' };
        try {
            const result = await this.ipcRenderer.invoke('uninstall-node-runtime', version);
            return result;
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

const mcpRuntimeService = new McpRuntimeService();
module.exports = mcpRuntimeService;