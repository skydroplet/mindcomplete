/**
 * 配置模块入口文件
 * 整合并导出所有配置相关的功能
 */

const configManager = require('./configManager');
const modelConfigManager = require('./modelManager');
const mcpConfigManager = require('./mcpManager');
const promptConfigManager = require('./promptManager');
const { createConfigWindow, registerConfigIPC, openConfigWindowWithTab } = require('./configWindow');

module.exports = {
    configManager,
    modelConfigManager,
    mcpConfigManager,
    createConfigWindow,
    registerConfigIPC,
    promptConfigManager,
    openConfigWindowWithTab
};

