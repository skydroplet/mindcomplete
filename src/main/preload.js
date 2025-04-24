const { contextBridge, ipcRenderer } = require('electron');

// 暴露API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 配置相关
    getModels: () => ipcRenderer.invoke('get-models'),
    addModel: (model) => ipcRenderer.invoke('add-model', model),
    updateModel: (model) => ipcRenderer.invoke('update-model', { model }),
    deleteModel: (name) => ipcRenderer.invoke('delete-model', name),

    // 文件系统相关
    readFile: (path) => ipcRenderer.invoke('read-file', path),
    writeFile: (path, data) => ipcRenderer.invoke('write-file', { path, data }),
    existsSync: (path) => ipcRenderer.invoke('exists-sync', path),
    mkdirSync: (path, options) => ipcRenderer.invoke('mkdir-sync', { path, options }),

    // MCP服务相关
    saveMcpServer: (serverData) => ipcRenderer.invoke('save-mcp-server', serverData),
    getMcpServers: () => ipcRenderer.invoke('get-mcp-servers'),
    getMcpConfig: () => ipcRenderer.invoke('get-mcp-config'),
    deleteMcpServer: (name) => ipcRenderer.invoke('delete-mcp-server', name),
    toggleActiveMcp: (name, isActive) => ipcRenderer.invoke('toggle-active-mcp', { name, isActive }),
    setActiveMcps: (mcpNames) => ipcRenderer.invoke('set-active-mcps', mcpNames),
    getActiveMcps: () => ipcRenderer.invoke('get-active-mcps'),

    // 应用更新相关
    checkForUpdates: (force = false) => ipcRenderer.invoke('check-for-updates', force),

    // 事件监听
    onConfigData: (callback) => {
        ipcRenderer.on('config-data', (event, data) => callback(event, data));
    },
    onModelUpdated: (callback) => {
        ipcRenderer.on('model-updated', (event, data) => callback(event, data));
    },
    onMcpServerUpdated: (callback) => {
        ipcRenderer.on('mcp-server-updated', (event, data) => callback(event, data));
    },
    onUpdateAvailable: (callback) => {
        ipcRenderer.on('update-available', (event, data) => callback(event, data));
    },
    onCheckingForUpdate: (callback) => {
        ipcRenderer.on('checking-for-updates', (event) => callback(event));
    },
    onUpdateCheckResult: (callback) => {
        ipcRenderer.on('update-check-result', (event, data) => callback(event, data));
    },
    onUpdateCheckError: (callback) => {
        ipcRenderer.on('update-check-error', (event, data) => callback(event, data));
    }
});
