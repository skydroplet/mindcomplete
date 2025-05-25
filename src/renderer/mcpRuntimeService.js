// 获取并渲染 MCP 运行环境信息
let ipcRenderer;
if (typeof window !== 'undefined' && window.ipcRenderer) {
    ipcRenderer = window.ipcRenderer;
} else {
    try {
        ipcRenderer = require('electron').ipcRenderer;
    } catch { }
}

/**
 * 获取并渲染 MCP 运行环境信息
 * @param {HTMLElement} loadingEl 加载提示元素
 */
async function loadRuntimeInfo(loadingEl) {
    if (!ipcRenderer) return;
    if (loadingEl) loadingEl.style.display = '';
    try {
        const info = await ipcRenderer.invoke('get-mcp-runtime-info');
        if (loadingEl) loadingEl.style.display = 'none';

        // 操作config.html中的表格
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
        // 表格区域显示错误
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

module.exports = { loadRuntimeInfo };