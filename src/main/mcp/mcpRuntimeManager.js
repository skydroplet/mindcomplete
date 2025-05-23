/**
 * MCP运行环境管理类
 * 支持自动检测、下载安装Node.js和Python运行环境，
 * 根据操作系统和CPU架构自动选择版本，安装到用户主目录的mcp路径下
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');
const Logger = require('../logger');
const log = new Logger('mcpRuntime');

class McpRuntimeManager {
    constructor() {
        const userDataPath = app.getPath('userData');
        this.mcpDir = path.join(userDataPath, 'user-data', 'mcp');

        this.mcpServersDir = path.join(mcpDir, 'servers');
        fs.mkdirSync(mcpDir, { recursive: true });

        this.nodeDir = path.join(this.mcpDir, 'nodejs');
        this.pythonDir = path.join(this.mcpDir, 'python');
    }

    /**
     * 获取当前操作系统平台和CPU架构
     * @returns {{platform: string, arch: string}}
     */
    getPlatformArch() {
        const platform = os.platform();
        const arch = os.arch();
        return { platform, arch };
    }

    /**
     * 获取Node.js下载信息（URL、文件名、扩展名、版本），根据平台和架构自动选择
     * @returns {{url: string, filename: string, ext: string, version: string}}
     */
    getNodeDownloadInfo() {
        // 只支持LTS版本
        const { platform, arch } = this.getPlatformArch();
        let nodePlatform, nodeArch, ext;
        if (platform === 'win32') {
            nodePlatform = 'win';
            ext = 'zip';
        } else if (platform === 'darwin') {
            nodePlatform = 'darwin';
            ext = 'tar.gz';
        } else {
            nodePlatform = 'linux';
            ext = 'tar.xz';
        }

        if (arch === 'x64') {
            nodeArch = 'x64';
        } else if (arch === 'arm64') {
            nodeArch = 'arm64';
        } else {
            throw new Error('暂不支持的CPU架构: ' + arch);
        }

        // 这里以18.x LTS为例，可根据需要调整
        const version = 'v22.16.0';
        const filename = `node-${version}-${nodePlatform}-${nodeArch}.${ext}`;
        const url = `https://nodejs.org/dist/${version}/${filename}`;
        return { url, filename, ext, version };
    }

    /**
     * 获取Python下载信息（URL、文件名、扩展名、版本），根据平台和架构自动选择
     * @returns {{url: string, filename: string, ext: string, version: string}}
     */
    getPythonDownloadInfo() {
        const { platform, arch } = this.getPlatformArch();
        let pyPlatform, pyArch, ext, filename, url;
        // 以Python 3.10.11为例
        const version = '3.10.11';
        if (platform === 'win32') {
            pyPlatform = 'amd64';
            ext = 'exe';
            filename = `python-${version}-amd64.exe`;
            url = `https://www.python.org/ftp/python/${version}/${filename}`;
        } else if (platform === 'darwin') {
            pyPlatform = 'macos11';
            pyArch = arch === 'arm64' ? 'arm64' : 'universal2';
            ext = 'pkg';
            filename = `python-${version}-macos11.${pyArch}.pkg`;
            url = `https://www.python.org/ftp/python/${version}/${filename}`;
        } else {
            // Linux
            pyPlatform = 'linux';
            pyArch = arch;
            ext = 'tgz';
            filename = `Python-${version}.tgz`;
            url = `https://www.python.org/ftp/python/${version}/${filename}`;
        }
        return { url, filename, ext, version };
    }

    /**
     * 下载文件到指定路径
     * @param {string} url 下载链接
     * @param {string} dest 本地保存路径
     * @returns {Promise<void>}
     */
    async downloadFile(url, dest) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            https.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error('下载失败: ' + response.statusCode));
                    return;
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            }).on('error', (err) => {
                fs.unlinkSync(dest);
                reject(err);
            });
        });
    }

    /**
     * 安装Node.js运行环境到指定目录
     * @returns {Promise<void>}
     */
    async installNode() {
        const { url, filename, ext } = this.getNodeDownloadInfo();
        const dest = path.join(this.mcpDir, filename);
        log.info('下载Node.js:', url);
        await this.downloadFile(url, dest);
        // 解压
        if (ext === 'zip') {
            execSync(`powershell -Command "Expand-Archive -Path '${dest}' -DestinationPath '${this.nodeDir}' -Force"`);
        } else {
            execSync(`tar -xf '${dest}' -C '${this.nodeDir}' --strip-components=1`);
        }
        fs.unlinkSync(dest);
        log.info('Node.js安装完成:', this.nodeDir);
    }

    /**
     * 安装Python运行环境到指定目录
     * @returns {Promise<void>}
     */
    async installPython() {
        const { url, filename, ext } = this.getPythonDownloadInfo();
        const dest = path.join(this.pythonDir, filename);
        log.info('下载Python:', url);
        await this.downloadFile(url, dest);
        if (ext === 'exe') {
            // 静默安装到pythonDir
            execSync(`'${dest}' /quiet InstallAllUsers=0 TargetDir='${this.pythonDir}' PrependPath=1 Include_test=0`);
        } else if (ext === 'pkg') {
            execSync(`sudo installer -pkg '${dest}' -target /`);
        } else {
            execSync(`tar -xf '${dest}' -C '${this.pythonDir}' --strip-components=1`);
        }
        fs.unlinkSync(dest);
        log.info('Python安装完成:', this.pythonDir);
    }

    /**
     * 判断Node.js是否已安装
     * @returns {boolean}
     */
    isNodeInstalled() {
        if (!fs.existsSync(this.nodeDir)) return false;
        // 检查node可执行文件
        const nodeExe = os.platform() === 'win32' ? 'node.exe' : 'node';
        return fs.existsSync(path.join(this.nodeDir, 'bin', nodeExe)) || fs.existsSync(path.join(this.nodeDir, nodeExe));
    }

    /**
     * 判断Python是否已安装
     * @returns {boolean}
     */
    isPythonInstalled() {
        if (!fs.existsSync(this.pythonDir)) return false;
        const pyExe = os.platform() === 'win32' ? 'python.exe' : 'python3';
        return fs.existsSync(path.join(this.pythonDir, 'bin', pyExe)) || fs.existsSync(path.join(this.pythonDir, pyExe));
    }

    /**
     * 获取Node.js可执行文件路径
     * @returns {string|null}
     */
    getNodePath() {
        if (!this.isNodeInstalled()) return null;
        const nodeExe = os.platform() === 'win32' ? 'node.exe' : 'node';
        return fs.existsSync(path.join(this.nodeDir, 'bin', nodeExe))
            ? path.join(this.nodeDir, 'bin', nodeExe)
            : path.join(this.nodeDir, nodeExe);
    }

    /**
     * 获取Python可执行文件路径
     * @returns {string|null}
     */
    getPythonPath() {
        if (!this.isPythonInstalled()) return null;
        const pyExe = os.platform() === 'win32' ? 'python.exe' : 'python3';
        return fs.existsSync(path.join(this.pythonDir, 'bin', pyExe))
            ? path.join(this.pythonDir, 'bin', pyExe)
            : path.join(this.pythonDir, pyExe);
    }
}

module.exports = new McpRuntimeManager();
