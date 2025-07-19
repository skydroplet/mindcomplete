/**
 * 配置模块入口文件
 * 整合并导出所有配置相关的功能
 */

const appConfig = require('./appConfig');
const modelConfig = require('./modelConfig');
const mcpConfig = require('./mcpConfig');
const promptConfig = require('./promptConfig');
const agentConfig = require('./agentConfig');
const modelMarketConfig = require('./modelMarketConfig');
const { createConfigWindow, registerConfigIPC, openConfigWindowWithTab } = require('./configWindow');

module.exports = {
    appConfig,
    modelConfig,
    mcpConfig,
    promptConfig,
    agentConfig,
    modelMarketConfig,
    createConfigWindow,
    registerConfigIPC,
    openConfigWindowWithTab
};

