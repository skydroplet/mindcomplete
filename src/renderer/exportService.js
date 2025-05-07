/**
 * exportService.js
 * 导出配置服务模块
 * 
 * 该模块负责处理配置导出相关的功能，包括：
 * - 显示导出配置对话框
 * - 收集用户选择的导出项
 * - 调用主进程导出配置
 */

const Logger = require('../main/logger');
const log = new Logger('export-service');
const i18n = require('../locales/i18n');

// 确保ipcRenderer可用
let ipcRenderer;
if (typeof window.ipcRenderer === 'undefined') {
    const electron = require('electron');
    ipcRenderer = electron.ipcRenderer;
    window.ipcRenderer = ipcRenderer;
} else {
    ipcRenderer = window.ipcRenderer;
}

/**
 * 导出服务类
 * 封装所有与配置导出相关的逻辑和UI交互
 */
class ExportService {
    /**
     * 初始化导出配置功能
     */
    initExportConfig() {
        const exportBtn = document.getElementById('export-config-btn');
        const exportDialog = document.getElementById('export-config-dialog');
        const closeBtn = document.getElementById('close-export-dialog');
        const cancelBtn = document.getElementById('cancel-export-btn');
        const confirmBtn = document.getElementById('confirm-export-btn');

        // 显示导出对话框
        exportBtn.addEventListener('click', () => {
            exportDialog.classList.add('active');
        });

        // 关闭导出对话框
        const closeExportDialog = () => {
            exportDialog.classList.remove('active');
        };

        closeBtn.addEventListener('click', closeExportDialog);
        cancelBtn.addEventListener('click', closeExportDialog);

        // 确认导出
        confirmBtn.addEventListener('click', async () => {
            // 获取选中的导出选项
            const exportModels = document.getElementById('export-models').checked;
            const exportPrompts = document.getElementById('export-prompts').checked;
            const exportMcp = document.getElementById('export-mcp').checked;

            // 如果没有选择任何选项，提示用户
            if (!exportModels && !exportPrompts && !exportMcp) {
                alert(i18n.t('export.noOptionSelected', '请至少选择一项配置进行导出'));
                return;
            }

            try {
                // 调用导出配置函数
                await this.exportConfig(exportModels, exportPrompts, exportMcp);
                closeExportDialog();
            } catch (error) {
                log.error('导出配置失败:', error.message);
                alert(i18n.t('export.error', `导出配置失败: ${error.message}`));
            }
        });
    }

    /**
     * 导出配置到文件
     * @param {boolean} includeModels - 是否包含模型配置
     * @param {boolean} includePrompts - 是否包含提示词
     * @param {boolean} includeMcp - 是否包含MCP配置
     * @returns {Promise<void>}
     */
    async exportConfig(includeModels, includePrompts, includeMcp) {
        try {
            log.info('导出配置，选项:', { includeModels, includePrompts, includeMcp });

            // 准备导出数据
            const exportData = {};

            // 获取最新数据
            if (includeModels) {
                const models = await ipcRenderer.invoke('get-models');
                exportData.models = models;
            }

            if (includePrompts) {
                const prompts = await ipcRenderer.invoke('get-all-prompts');
                exportData.prompts = prompts;
            }

            if (includeMcp) {
                const mcpConfig = await ipcRenderer.invoke('get-mcp-config');
                exportData.mcpServers = mcpConfig.servers;
            }

            // 创建导出文件名（使用当前日期时间）
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
            const timeStr = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
            const fileName = `mindcomplete-config-${dateStr}-${timeStr}.json`;

            // 调用主进程的保存文件对话框
            const success = await ipcRenderer.invoke('export-config', exportData, fileName);

            if (success) {
                alert(i18n.t('export.success', '配置导出成功！'));
            }
        } catch (error) {
            log.error('导出配置失败:', error.message);
            throw error;
        }
    }
}

// 创建并导出单例实例
const exportService = new ExportService();
module.exports = exportService; 