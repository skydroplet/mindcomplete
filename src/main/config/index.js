/**
 * 配置模块入口文件
 * 整合并导出所有配置相关的功能
 */

const appConfig = require('./appConfig');
const modelConfig = require('./modelConfig');
const mcpConfig = require('./mcpConfig');
const promptConfig = require('./promptConfig');
const { createConfigWindow, registerConfigIPC, openConfigWindowWithTab } = require('./configWindow');

module.exports = {
    appConfig,
    modelConfig,
    mcpConfig,
    createConfigWindow,
    registerConfigIPC,
    promptConfig,
    openConfigWindowWithTab
};

