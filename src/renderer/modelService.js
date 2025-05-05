/**
 * modelService.js
 * 模型服务模块
 * 
 * 该模块负责处理与AI模型相关的功能，包括：
 * - 从主进程获取模型列表
 * - 更新模型选择下拉框
 * - 处理模型选择事件
 */

const { ipcRenderer } = require('electron');
const Logger = require('../main/logger');
const log = new Logger('modelService');
const i18n = require('../locales/i18n');

/**
 * 模型服务类
 * 封装所有与模型相关的逻辑和UI交互
 */
class ModelService {
    /**
     * 创建模型服务实例
     */
    constructor() {
        // 当前选择的模型ID
        this.currentModel = null;
        this.modelSelect = null;
        // 在初始化时，DOM可能尚未准备好
    }

    /**
     * 初始化模型服务
     * 必须在DOM加载完成后调用
     */
    init() {
        this.modelSelect = document.getElementById('model-select');
    }

    /**
     * 加载模型列表
     *
     * 从主进程获取可用的AI模型列表，并填充到模型选择下拉框中
     * 同时恢复上次选择的模型
     * 
     * @returns {Promise<string>} - 当前选择的模型ID
     */
    async loadModels() {
        try {
            // 确保已经初始化
            if (!this.modelSelect) {
                this.init();
            }

            // 从主进程获取模型列表
            const models = await ipcRenderer.invoke('get-models');
            log.info(i18n.t('logs.modelList'), models);

            // 初始化变量，用于存储默认模型ID
            let defaultModelId = "";

            // 清空并重新填充模型选择下拉框
            this.modelSelect.innerHTML = `<option value="add_new">${i18n.t('settings.buttons.addModelOption')}</option>`;

            // 遍历所有模型，添加到下拉框中
            Object.entries(models || {}).forEach(([modelId, model]) => {
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = model.name;
                this.modelSelect.appendChild(option);
                defaultModelId = modelId; // 保存最后一个模型ID作为默认值
            });

            // 加载当前选择的模型（从配置中获取）
            const modelConfig = await ipcRenderer.invoke('get-config');
            if (modelConfig && modelConfig.currentModel) {
                this.currentModel = modelConfig.currentModel;
            } else {
                // 如果配置中没有选择的模型，使用默认值
                this.currentModel = defaultModelId;
            }
            log.info(i18n.t('logs.currentModel'), this.currentModel);

            // 设置下拉框的当前选中值
            this.modelSelect.value = this.currentModel || "";

            return this.currentModel;
        } catch (error) {
            log.error(i18n.t('logs.loadModelListFailed'), error.message);
            return null;
        }
    }

    /**
     * 获取当前模型
     * @returns {string} - 当前模型ID
     */
    getCurrentModel() {
        return this.currentModel;
    }

    /**
     * 处理模型选择事件
     * 
     * @param {Event} e - 事件对象
     * @param {Function} openSettingsWindowWithTab - 打开设置窗口的函数
     * @returns {Promise<void>}
     */
    async handleModelSelect(e, openSettingsWindowWithTab) {
        const modelId = e.target.value;
        if (modelId === "add_new") {
            // 重置选择框
            this.modelSelect.value = this.currentModel || "";

            // 打开配置窗口的模型标签页
            openSettingsWindowWithTab('models');
        } else if (modelId) {
            // 用户选择了一个模型
            this.currentModel = modelId;
            await ipcRenderer.invoke('select-model', modelId);
        }
    }

    /**
     * 为模型选择下拉框设置事件监听器
     * 
     * @param {Function} openSettingsWindowWithTab - 打开设置窗口的函数
     */
    setupModelSelectListeners(openSettingsWindowWithTab) {
        // 确保已经初始化
        if (!this.modelSelect) {
            this.init();
        }

        this.modelSelect.addEventListener('change', async (e) => {
            await this.handleModelSelect(e, openSettingsWindowWithTab);
        });
    }

    /**
     * 获取模型选择下拉框
     * 
     * @returns {HTMLSelectElement} - 模型选择下拉框
     */
    getModelSelect() {
        return this.modelSelect;
    }

    /**
     * 更新模型列表UI
     * @param {Object} models - 模型列表
     */
    updateModelList(models) {
        const modelList = document.getElementById('modelList');
        if (!modelList) {
            log.error('无法找到模型列表元素 #modelList');
            return;
        }

        log.info('更新模型列表, 模型数量:', Object.keys(models).length);
        modelList.innerHTML = '';

        Object.entries(models).forEach(([modelId, model]) => {
            const div = document.createElement('div');
            div.className = 'model-item';
            div.textContent = model.name;
            div.dataset.modelId = modelId;

            // 使用箭头函数来确保this绑定正确
            div.onclick = () => {
                log.info('点击模型项目:', modelId, model.name);
                this.selectModel(modelId);
            };

            modelList.appendChild(div);
        });
    }

    /**
     * 选择模型
     * @param {string} modelId - 模型ID
     */
    selectModel(modelId) {
        // 存储选中的模型ID到临时变量，而不是window全局变量
        this.selectedModelId = modelId;
        // 同时更新window全局变量，确保两边状态同步
        window.currentModelId = modelId;

        log.info('选择模型, ID:', modelId);

        const models = this.models || {};
        if (models[modelId]) {
            const model = models[modelId];
            document.getElementById('modelName').value = model.name;
            document.getElementById('modelType').value = model.type;
            document.getElementById('apiKey').value = model.apiKey || '';
            document.getElementById('apiUrl').value = model.apiBaseUrl || '';
            document.getElementById('contextWindowSize').value = (model.contextWindowSize || 4096) / 1000;
            document.getElementById('temperature').value = model.temperature || 0.7;

            // 显示删除按钮和复制按钮
            document.querySelector('.delete-btn')?.classList.remove('hidden');
            document.querySelector('#copyModelBtn')?.classList.remove('hidden');

            // 更新选中状态UI
            this.updateActiveModelItem(modelId);
        }
    }

    /**
     * 更新模型列表中的活动项
     * @param {string} activeModelId - 当前激活的模型ID
     */
    updateActiveModelItem(activeModelId) {
        // 移除所有项目的active类
        document.querySelectorAll('.model-item').forEach(item => {
            item.classList.remove('active');
        });

        // 为当前选中的模型添加active类
        if (activeModelId) {
            const activeItem = document.querySelector(`.model-item[data-model-id="${activeModelId}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
            }
        }
    }

    /**
     * 更新删除按钮状态
     */
    updateDeleteButton() {
        const deleteBtn = document.querySelector('.delete-btn');
        if (!deleteBtn) return;

        const models = this.models || {};
        deleteBtn.classList.toggle('hidden', Object.keys(models).length === 0);
    }

    /**
     * 保存当前模型
     * @returns {Promise<boolean>} - 保存是否成功
     */
    async saveCurrentModel() {
        try {
            log.info('开始保存模型...');
            const model = {
                name: document.getElementById('modelName')?.value,
                type: document.getElementById('modelType')?.value,
                apiKey: document.getElementById('apiKey')?.value,
                apiBaseUrl: document.getElementById('apiUrl')?.value,
                contextWindowSize: parseInt(document.getElementById('contextWindowSize')?.value || '4') * 1000,
                temperature: parseFloat(document.getElementById('temperature')?.value || '0.7')
            };

            let success;

            if (this.selectedModelId) {
                success = await ipcRenderer.invoke('update-model', {
                    modelId: this.selectedModelId,
                    model
                });
            } else {
                success = await ipcRenderer.invoke('add-model', model);
            }

            log.info('保存操作结果:', success);
            if (success) {
                log.info('刷新模型列表...');
                const models = await ipcRenderer.invoke('get-models');
                log.info('获取到的模型列表:', JSON.stringify(models, null, 2));
                this.models = models;
                this.updateModelList(models);
                return true;
            } else {
                throw new Error('保存失败');
            }
        } catch (error) {
            log.error('保存模型时出错:', error.message);
            return false;
        }
    }

    /**
     * 重置模型表单
     */
    resetModelForm() {
        const modelForm = document.getElementById('modelForm');
        if (modelForm) modelForm.reset();

        // 清除本地和全局的模型ID
        this.selectedModelId = null;
        window.currentModelId = null;

        const deleteBtn = document.querySelector('.delete-btn');
        const copyModelBtn = document.querySelector('#copyModelBtn');

        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (copyModelBtn) copyModelBtn.classList.add('hidden');

        // 确保所有输入框可编辑
        document.querySelectorAll('#modelForm input').forEach(input => {
            input.readOnly = false;
            input.disabled = false;
        });

        // 为了修复删除配置后无法选中输入框的问题，显式设置焦点到第一个输入框
        setTimeout(() => {
            const firstInput = document.getElementById('modelName');
            if (firstInput) {
                firstInput.focus();
            }
        }, 0);
    }

    /**
     * 复制模型
     * @returns {Promise<boolean>} - 复制是否成功
     */
    async copyModel() {
        try {
            if (!this.selectedModelId) return false;

            const models = this.models || {};
            const currentModel = models[this.selectedModelId];
            if (!currentModel) return false;

            // 创建一个复制的模型对象
            const copiedModel = {
                name: `${currentModel.name} (复制)`,
                type: currentModel.type,
                apiKey: currentModel.apiKey || '',
                apiBaseUrl: currentModel.apiBaseUrl || '',
                contextWindowSize: currentModel.contextWindowSize || 4096,
                temperature: currentModel.temperature || 0.7
            };

            // 保存新复制的模型
            const success = await ipcRenderer.invoke('add-model', copiedModel);
            if (success) {
                // 刷新模型列表
                const models = await ipcRenderer.invoke('get-models');
                this.models = models;
                this.updateModelList(models);

                // 清除当前选中状态
                this.selectedModelId = null;

                const deleteBtn = document.querySelector('.delete-btn');
                const copyModelBtn = document.querySelector('#copyModelBtn');

                if (deleteBtn) deleteBtn.classList.add('hidden');
                if (copyModelBtn) copyModelBtn.classList.add('hidden');

                // 填充复制的模型数据
                const modelName = document.getElementById('modelName');
                const modelType = document.getElementById('modelType');
                const apiKey = document.getElementById('apiKey');
                const apiUrl = document.getElementById('apiUrl');
                const contextWindowSize = document.getElementById('contextWindowSize');
                const temperature = document.getElementById('temperature');

                if (modelName) modelName.value = copiedModel.name;
                if (modelType) modelType.value = copiedModel.type;
                if (apiKey) apiKey.value = copiedModel.apiKey;
                if (apiUrl) apiUrl.value = copiedModel.apiBaseUrl;
                if (contextWindowSize) contextWindowSize.value = (copiedModel.contextWindowSize || 4096) / 1000;
                if (temperature) temperature.value = copiedModel.temperature || 0.7;

                // 确保所有输入框可编辑
                document.querySelectorAll('#modelForm input').forEach(input => {
                    input.readOnly = false;
                    input.disabled = false;
                });

                return true;
            } else {
                throw new Error('复制模型失败');
            }
        } catch (error) {
            log.error('复制模型时出错:', error.message);
            return false;
        }
    }

    /**
     * 删除模型
     * @returns {Promise<boolean>} - 删除是否成功
     */
    async deleteModel() {
        if (!confirm('确定要删除这个模型吗？')) {
            return false;
        }

        if (!this.selectedModelId) return false;

        try {
            log.info('[Config] 开始删除模型, ID:', this.selectedModelId);
            const success = await ipcRenderer.invoke('delete-model', this.selectedModelId);
            log.info('[Config] 删除操作结果:', success);
            if (success) {
                log.info('[Config] 刷新模型列表...');
                const models = await ipcRenderer.invoke('get-models');
                log.info('[Config] 获取到的模型列表:', JSON.stringify(models, null, 2));
                this.models = models;
                this.updateModelList(models);
                this.resetModelForm();
                this.updateDeleteButton();

                // 规避删除后配置窗口无法输入问题
                ipcRenderer.invoke('reset-window-focus')
                return true;
            } else {
                throw new Error('删除失败');
            }
        } catch (error) {
            log.error('删除模型时出错:', error.message);
            return false;
        }
    }

    /**
     * 初始化模型相关事件监听器
     */
    async initModelEventListeners() {
        // 确保模型数据已加载
        if (!this.models) {
            try {
                await this.fetchModels();
                log.info('模型数据已加载', Object.keys(this.models || {}).length);
            } catch (error) {
                log.error('加载模型数据失败:', error.message);
            }
        }

        // 添加模型按钮事件
        const addModelBtn = document.getElementById('addModelBtn');
        if (addModelBtn) {
            addModelBtn.addEventListener('click', () => {
                log.info('添加模型按钮被点击');
                this.resetModelForm();
            });
        }

        // 删除模型按钮事件
        const deleteModelBtn = document.getElementById('deleteModelBtn');
        if (deleteModelBtn) {
            deleteModelBtn.addEventListener('click', () => this.deleteModel());
        }

        // 保存模型按钮事件
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                log.info('保存按钮被点击');
                this.saveCurrentModel();
            });
        }

        // 取消按钮事件
        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                log.info('取消按钮被点击');
                this.resetModelForm();
            });
        }

        // 复制模型按钮事件
        const copyModelBtn = document.getElementById('copyModelBtn');
        if (copyModelBtn) {
            copyModelBtn.addEventListener('click', () => this.copyModel());
        }
    }

    /**
     * 从主进程获取所有模型
     * @returns {Promise<Object>} - 模型列表
     */
    async fetchModels() {
        try {
            const models = await ipcRenderer.invoke('get-models');
            this.models = models;
            // 同步更新window.models，确保全局状态一致
            window.models = models;
            return models;
        } catch (error) {
            log.error('获取模型列表失败:', error.message);
            return {};
        }
    }

    /**
     * 设置模型选择下拉框的值
     * 
     * @param {string} modelId - 要选择的模型ID
     */
    setModelSelection(modelId) {
        if (!this.modelSelect) {
            this.init();
        }

        if (modelId && this.modelSelect) {
            // 更新下拉框选择
            this.modelSelect.value = modelId;
            // 更新当前模型ID
            this.currentModel = modelId;
            log.info('从会话加载模型设置:', modelId);
        }
    }
}

// 创建并导出单例实例
const modelService = new ModelService();
module.exports = modelService; 