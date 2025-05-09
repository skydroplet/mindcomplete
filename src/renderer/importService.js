/**
 * importService.js
 * 导入配置服务模块
 * 
 * 该模块负责处理配置导入相关的功能，包括：
 * - 显示导入配置对话框
 * - 解析导入的配置文件内容
 * - 调用主进程导入配置
 */

const Logger = require('../main/logger');
const log = new Logger('import-service');
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
 * 导入服务类
 * 封装所有与配置导入相关的逻辑和UI交互
 */
class ImportService {
    constructor() {
        // 存储解析后的导入配置数据
        this.importData = {
            models: {},
            prompts: {},
            mcpServers: {}
        };
    }

    /**
     * 初始化导入配置功能
     */
    initImportConfig() {
        const importBtn = document.getElementById('import-config-btn');
        const importDialog = document.getElementById('import-config-dialog');
        const closeBtn = document.getElementById('close-import-dialog');
        const cancelBtn = document.getElementById('cancel-import-btn');
        const confirmBtn = document.getElementById('confirm-import-btn');
        const importTextArea = document.getElementById('import-config-content');
        const fileSelector = document.getElementById('import-file-selector');

        // 显示导入对话框
        importBtn.addEventListener('click', () => {
            // 清空文本框内容
            importTextArea.value = '';
            // 重置文件选择器
            fileSelector.value = '';
            // 显示对话框
            importDialog.classList.add('active');
        });

        // 关闭导入对话框
        const closeImportDialog = () => {
            importDialog.classList.remove('active');
        };

        closeBtn.addEventListener('click', closeImportDialog);
        cancelBtn.addEventListener('click', closeImportDialog);

        // 处理文件选择
        fileSelector.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // 确保是JSON文件
            if (!file.name.endsWith('.json')) {
                alert(i18n.t('import.invalidFileType', '请选择JSON文件'));
                fileSelector.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    // 尝试格式化JSON
                    const jsonText = event.target.result;
                    const jsonObj = JSON.parse(jsonText);
                    importTextArea.value = JSON.stringify(jsonObj, null, 2);
                } catch (error) {
                    log.error('解析JSON文件失败:', error.message);
                    alert(i18n.t('import.invalidJson', '所选文件不是有效的JSON文件'));
                    importTextArea.value = '';
                }
            };
            reader.readAsText(file);
        });

        // 监听文本框内容变化，尝试进行JSON格式化
        importTextArea.addEventListener('input', this.formatJsonContent.bind(this));

        // 确认导入
        confirmBtn.addEventListener('click', async () => {
            try {
                const jsonContent = importTextArea.value.trim();
                if (!jsonContent) {
                    alert(i18n.t('import.emptyContent', '请输入或选择配置文件'));
                    return;
                }

                // 解析JSON内容
                this.importData = JSON.parse(jsonContent);

                // 验证导入的数据格式
                if (!this.validateImportData()) {
                    alert(i18n.t('import.invalidFormat', '导入的配置格式无效'));
                    return;
                }

                // 确认导入操作
                const confirmed = window.confirm(i18n.t('import.confirm', '确定要导入这些配置吗？所有导入的配置项将以新建的方式添加，不会覆盖原有配置。'));
                if (!confirmed) return;

                // 执行导入操作
                await this.importConfig();
                closeImportDialog();

                // 导入成功后刷新页面
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } catch (error) {
                log.error('导入配置失败:', error.message);
                alert(i18n.t('import.error', { error: error.message }));
            }
        });
    }

    /**
     * 格式化JSON内容
     * @param {Event} event - 输入事件对象
     */
    formatJsonContent(event) {
        const textarea = event.target;
        const content = textarea.value.trim();

        if (!content) return;

        try {
            // 尝试解析JSON并重新格式化
            const jsonObj = JSON.parse(content);
            // 保留光标位置
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            // 更新内容
            textarea.value = JSON.stringify(jsonObj, null, 2);
            // 恢复光标位置
            textarea.setSelectionRange(start, end);
        } catch (error) {
            // 解析失败就不做处理，保持原有内容
            // 这样用户可以持续编辑直到形成有效的JSON
            log.debug('JSON格式化失败，可能正在编辑中');
        }
    }

    /**
     * 验证导入数据格式
     * @returns {boolean} 是否是有效的导入数据
     */
    validateImportData() {
        // 检查是否至少包含一种有效的配置类型
        return (
            (this.importData.models && typeof this.importData.models === 'object') ||
            (this.importData.prompts && typeof this.importData.prompts === 'object') ||
            (this.importData.mcpServers && typeof this.importData.mcpServers === 'object')
        );
    }

    /**
     * 导入配置到系统
     * @returns {Promise<boolean>} 导入是否成功
     */
    async importConfig() {
        try {
            log.info('开始导入配置:', Object.keys(this.importData));

            // 调用主进程处理导入
            const result = await ipcRenderer.invoke('import-config', this.importData);

            if (result.success) {
                log.info('配置导入成功');

                // 构建导入成功消息，显示导入的项目数量
                const importedItems = [];
                if (result.imported.models > 0) {
                    importedItems.push(`${result.imported.models} 个模型配置`);
                }
                if (result.imported.prompts > 0) {
                    importedItems.push(`${result.imported.prompts} 个提示词`);
                }
                if (result.imported.mcpServers > 0) {
                    importedItems.push(`${result.imported.mcpServers} 个MCP服务配置`);
                }

                const importedItemsText = importedItems.join('、');
                alert(i18n.t('import.success', importedItemsText));
                return true;
            } else {
                log.error('导入配置失败:', result.error);
                alert(i18n.t('import.error', { error: result.error }));
                return false;
            }
        } catch (error) {
            log.error('导入配置失败:', error.message);
            throw error;
        }
    }
}

module.exports = ImportService; 