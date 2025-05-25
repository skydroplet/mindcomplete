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
                    nodeTbody.innerHTML = info.node.map(n => `<tr><td><b>${n.version}</b></td><td style=\"font-family:monospace;\">${n.path}</td></tr>`).join('');
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
            installBtn.disabled = true;
            installBtn.textContent = '安装中...';
            if (loadingEl) loadingEl.style.display = '';
            const result = await this.installNodeRuntime(version);
            if (result.success) {
                alert('Node.js 安装成功！');
            } else {
                alert('Node.js 安装失败: ' + (result.error || '未知错误'));
            }
            installBtn.disabled = false;
            installBtn.textContent = '安装Node.js';
            this.loadRuntimeInfo(loadingEl);
        });
    }

    /**
     * 弹出输入框让用户输入Node.js版本，支持深浅色模式
     * @returns {Promise<string|null>} 用户输入的版本号，取消返回null
     */
    async promptNodeVersion() {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'custom-dialog';
            dialog.style.zIndex = '9999';
            dialog.style.display = 'flex';
            dialog.style.flexDirection = 'column';
            dialog.style.alignItems = 'stretch';
            dialog.style.background = 'var(--dialog-bg, #fff)';
            dialog.style.borderRadius = '8px';
            dialog.style.boxShadow = '0 4px 24px rgba(0,0,0,0.18)';
            dialog.style.padding = '24px 20px 16px 20px';
            dialog.style.maxWidth = '320px';
            dialog.style.margin = 'auto';
            dialog.style.position = 'fixed';
            dialog.style.left = '50%';
            dialog.style.top = '50%';
            dialog.style.transform = 'translate(-50%, -50%)';
            dialog.style.pointerEvents = 'auto';

            // 创建遮罩层
            const mask = document.createElement('div');
            mask.style.position = 'fixed';
            mask.style.left = '0';
            mask.style.top = '0';
            mask.style.width = '100vw';
            mask.style.height = '100vh';
            mask.style.background = 'rgba(0,0,0,0.15)';
            mask.style.zIndex = '9998';

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
            btnRow.style.marginTop = '10px';
            btnRow.style.display = 'flex';
            btnRow.style.justifyContent = 'flex-end';
            btnRow.style.gap = '10px'; // 按钮之间的间距
            btnRow.style.width = '100%';

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
}

const mcpRuntimeService = new McpRuntimeService();
module.exports = mcpRuntimeService;