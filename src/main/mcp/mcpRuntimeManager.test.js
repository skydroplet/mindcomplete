// mock electron.app.getPath
jest.mock('electron', () => ({
    app: {
        getPath: (name) => require('path').resolve(__dirname, '../../../electron-test', name || '')
    }
}));

const McpRuntimeManager = require('./mcpRuntimeManager');

describe('下载和安装测试', () => {

    describe('Node.js下载安装', () => {
        const nodeVersion = 'v22.16.0';
        it('should install Node.js successfully', async () => {
            await McpRuntimeManager.installNodeWithProgress(nodeVersion);
            expect(McpRuntimeManager.isNodeInstalled(nodeVersion).installed).toBe(true);
        }, 300000);

        it('should remove Node.js successfully', async () => {
            // 删除
            McpRuntimeManager.removeNode(nodeVersion);
            expect(McpRuntimeManager.isNodeInstalled(nodeVersion).installed).toBe(false);
        }, 3000);
    });

    describe('Python下载安装', () => {
        const pythonVersion = '3.11.3';
        it('should install Python successfully', async () => {
            await McpRuntimeManager.installPython(pythonVersion);
            expect(McpRuntimeManager.isPythonInstalled(pythonVersion).installed).toBe(true);
        }, 300000);

        it('should remove Python successfully', async () => {
            McpRuntimeManager.removePython(pythonVersion);
            expect(McpRuntimeManager.isPythonInstalled(pythonVersion).installed).toBe(false);
        }, 3000);
    });
});