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
const { app, ipcMain } = require('electron');

class McpRuntimeManager {
    constructor() {
        const userDataPath = app.getPath('userData');
        this.mcpDir = path.join(userDataPath, 'user-data', 'mcp');

        this.downloadDir = path.join(this.mcpDir, 'download');
        fs.mkdirSync(this.downloadDir, { recursive: true });

        this.nodeDir = path.join(this.mcpDir, 'nodejs');
        fs.mkdirSync(this.nodeDir, { recursive: true });

        this.pythonDir = path.join(this.mcpDir, 'python');
        fs.mkdirSync(this.pythonDir, { recursive: true });
    }

    /**
     * 获取所有自定义安装文件查找路径
     * @returns  {string[]}
     */
    getExecutableDirs() {
        let executableDirs = [];

        // 添加 Node.js 安装目录
        if (fs.existsSync(this.nodeDir)) {
            const nodeVersions = fs.readdirSync(this.nodeDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);

            for (const version of nodeVersions) {
                if (!version.startsWith('v')) {
                    continue;
                }

                const versionDir = path.join(this.nodeDir, version);
                const binDir = path.join(versionDir, 'bin');
                if (fs.existsSync(binDir)) {
                    executableDirs.push(binDir);
                }
                executableDirs.push(versionDir);
            }
        }

        // 添加 Python 安装目录
        if (fs.existsSync(this.pythonDir)) {
            const pythonVersions = fs.readdirSync(this.pythonDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);

            for (const version of pythonVersions) {
                if (version === 'venv') {
                    continue;
                }

                const versionDir = path.join(this.pythonDir, version);
                const scriptsDir = path.join(versionDir, 'Scripts');
                const binDir = path.join(versionDir, 'bin');

                if (fs.existsSync(scriptsDir)) {
                    executableDirs.push(scriptsDir);
                }

                if (fs.existsSync(binDir)) {
                    executableDirs.push(binDir);
                }

                executableDirs.push(versionDir);
            }
        }

        log.info('exe dirs:', executableDirs);
        return executableDirs;
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
     * @param {string} [version='v22.16.0'] Node.js版本号
     * @returns {{url: string, filename: string, ext: string, version: string}}
     */
    getNodeDownloadInfo(version = 'v22.16.0') {
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

        const filename = `node-${version}-${nodePlatform}-${nodeArch}.${ext}`;
        const url = `https://nodejs.org/dist/${version}/${filename}`;

        return { url, filename, ext, version };
    }

    /**
     * 获取Python下载信息（URL、文件名、扩展名、版本），根据平台和架构自动选择
     * @param {string} [version='3.10.11'] Python版本号
     * @returns {{url: string, filename: string, ext: string, version: string}}
     */
    getPythonDownloadInfo(version = '3.10.11') {
        const { platform, arch } = this.getPlatformArch();
        let pyPlatform, pyArch, ext, filename, url;
        if (platform === 'win32') {
            pyPlatform = 'amd64';
            ext = 'exe';
            filename = `python-${version}.exe`;
            url = `https://mirrors.aliyun.com/python-release/windows/${filename}`;
            // url = `https://www.python.org/ftp/python/${version}/${filename}`;
        } else if (platform === 'darwin') {
            pyPlatform = 'macos11';
            pyArch = arch === 'arm64' ? 'arm64' : 'universal2';
            ext = 'pkg';
            filename = `python-${version}-macos11.pkg`;
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
     * @param {function} [onProgress] 进度回调 (percent, speedMB, status)
     * @returns {Promise<void>}
     */
    async downloadFile(url, dest, onProgress) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            let downloaded = 0;
            let totalSize = 0;
            let lastTime = Date.now();
            let lastBytes = 0;

            https.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error('下载失败: ' + response.statusCode));
                    return;
                }

                totalSize = parseInt(response.headers['content-length'] || 0);

                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    const now = Date.now();
                    const timeDiff = (now - lastTime) / 1000; // 秒
                    if (timeDiff >= 1) { // 每秒更新一次
                        const byteDiff = downloaded - lastBytes;
                        const speed = byteDiff / timeDiff; // 字节/秒
                        const progress = totalSize ? ((downloaded / totalSize) * 100).toFixed(2) : 0;
                        if (onProgress) {
                            onProgress(Number(progress), (speed / 1024 / 1024).toFixed(2));
                        }
                        lastTime = now;
                        lastBytes = downloaded;
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    if (onProgress) {
                        onProgress(100, '0.00');
                    }
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
     * @param {string} version Node.js版本号，例如'v22.16.0'
     * @param {string} taskKey 唯一任务key
     * @param {Electron.IpcMainInvokeEvent} event ipc事件
     * @returns {Promise<void>}
     */
    async installNodeWithProgress(version, taskKey, event) {
        const nodeInfo = await this.isNodeInstalled(version);
        if (nodeInfo.installed) {
            event.sender.send('node-install-progress', {
                taskKey,
                percent: 100,
                speed: '-',
                status: 'success',
                message: '已安装'
            });
            return;
        }

        const versionDir = path.join(this.nodeDir, version);
        fs.mkdirSync(versionDir, { recursive: true });

        const { url, filename, ext } = this.getNodeDownloadInfo(version);
        const dest = path.join(this.downloadDir, filename);
        log.info('下载Node.js:', url, dest);

        // 下载过程推送进度
        await this.downloadFile(url, dest, (percent, speed) => {
            event.sender.send('node-install-progress', {
                taskKey,
                percent,
                speed,
                status: 'installing',
                message: percent === 100 ? '下载完成，准备解压...' : '下载中'
            });
        });

        // 解压过程推送
        try {
            event.sender.send('node-install-progress', {
                taskKey,
                percent: 100,
                speed: '-',
                status: 'installing',
                message: '正在解压...'
            });
            if (ext === 'zip') {
                const { exec } = require('child_process');
                await new Promise((resolve, reject) => {
                    exec(`powershell -Command "Expand-Archive -Path '${dest}' -DestinationPath '${this.nodeDir}' -Force"`, (error) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        const baseName = filename.replace('.zip', '');
                        const extractedDir = path.join(this.nodeDir, baseName);
                        if (fs.existsSync(extractedDir)) {
                            fs.readdirSync(extractedDir).forEach(file => {
                                const src = path.join(extractedDir, file);
                                const destPath = path.join(versionDir, file);
                                fs.renameSync(src, destPath);
                            });
                            fs.rmdirSync(extractedDir);
                        }
                        resolve();
                    });
                });
            } else {
                const { exec } = require('child_process');
                await new Promise((resolve, reject) => {
                    exec(`tar -xf '${dest}' -C '${versionDir}' --strip-components=1`, (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
            }

            // 配置Node.js环境
            this.configureNode(version);

            event.sender.send('node-install-progress', {
                taskKey,
                percent: 100,
                speed: '-',
                status: 'success',
                message: '解压完成'
            });
        } catch (e) {
            event.sender.send('node-install-progress', {
                taskKey,
                percent: 100,
                speed: '-',
                status: 'error',
                error: '解压失败: ' + (e.message || '未知错误'),
                message: '解压失败'
            });
            throw e;
        }
    }

    /**
     * 配置Node.js环境
     * @param {string} version Node.js版本号，例如'v22.16.0'
     * @returns {boolean} 是否配置成功
     */
    async configureNode(version) {
        const nodeInfo = await this.isNodeInstalled(version);
        if (!nodeInfo.installed) {
            log.warn(`Node.js ${version} 未安装，无法配置`);
            return false;
        }

        const versionDir = path.join(this.nodeDir, version);
        const npmExe = path.join(versionDir, os.platform() === 'win32' ? 'npm' : path.join('bin', 'npm'));

        if (!fs.existsSync(npmExe)) {
            log.warn(`npm可执行文件不存在: ${npmExe}`);
            return false;
        }

        // 配置npm安装和缓存目录
        const libDir = path.join(this.nodeDir, 'lib', version);
        fs.mkdirSync(libDir, { recursive: true });

        const cacheDir = path.join(this.nodeDir, 'cache', version);
        fs.mkdirSync(cacheDir, { recursive: true });

        const commands = [
            `"${npmExe}" config set prefix "${libDir}" --global`,
            `"${npmExe}" config set cache "${cacheDir}" --global`,
            `"${npmExe}" config set registry "https://registry.npmmirror.com" --global`,
            `"${npmExe}" config list`,
        ]

        try {
            for (const cmd of commands) {
                log.info(`run cmd:`, cmd);
                const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
                log.info(`cmd result: `, result);
            }
        } catch (error) {
            log.error(`run cmd fail: ${error.message}`);
            return false;
        }

        return true;
    }

    /**
     * 安装Python运行环境到指定目录，带进度推送
     * @param {string} version Python版本号，例如'3.10.11'
     * @param {string} taskKey 唯一任务key
     * @param {Electron.IpcMainInvokeEvent} event ipc事件
     * @returns {Promise<void>}
     */
    async installPythonWithProgress(version, taskKey, event) {
        const pythonInfo = await this.isPythonInstalled(version);
        if (pythonInfo.installed) {
            event.sender.send('python-install-progress', {
                taskKey,
                percent: 100,
                speed: '-',
                status: 'success',
                message: '已安装'
            });
            return;
        }
        const versionDir = path.join(this.pythonDir, version);
        fs.mkdirSync(versionDir, { recursive: true });
        const { url, filename, ext } = this.getPythonDownloadInfo(version);
        const dest = path.join(this.downloadDir, filename);
        log.info('下载Python:', url, dest);
        // 下载过程推送进度
        await this.downloadFile(url, dest, (percent, speed) => {
            event.sender.send('python-install-progress', {
                taskKey,
                percent,
                speed,
                status: 'installing',
                message: percent === 100 ? '下载完成，准备安装...' : '下载中'
            });
        });
        // 安装过程推送
        try {
            event.sender.send('python-install-progress', {
                taskKey,
                percent: 100,
                speed: '-',
                status: 'installing',
                message: '正在安装...'
            });
            if (ext === 'exe') {
                const absTargetDir = path.resolve(versionDir);
                const { execFile } = require('child_process');
                await new Promise((resolve, reject) => {
                    execFile(dest, [
                        '/quiet',
                        'InstallAllUsers=0',
                        `TargetDir=${absTargetDir}`,
                        'PrependPath=1',
                        'Include_test=0'
                    ], (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
            } else if (ext === 'pkg') {
                execSync(`sudo installer -pkg "${dest}" -target /`);
            } else {
                execSync(`tar -xf "${dest}" -C "${versionDir}" --strip-components=1`);
            }
            event.sender.send('python-install-progress', {
                taskKey,
                percent: 100,
                speed: '-',
                status: 'success',
                message: '安装完成'
            });

            this.configurePythonEnv(version);
        } catch (e) {
            event.sender.send('python-install-progress', {
                taskKey,
                percent: 100,
                speed: '-',
                status: 'error',
                error: '安装失败: ' + (e.message || '未知错误'),
                message: '安装失败'
            });
            throw e;
        }
    }

    /**
     * 配置Python环境
     * @param {String} version 
     * @returns {Boolean}  是否配置成功
     */
    async configurePythonEnv(version) {
        const versionDir = path.join(this.pythonDir, version);
        const python = path.join(versionDir, os.platform() === 'win32' ? 'python.exe' : 'python');
        const pip = path.join(versionDir, os.platform() === 'win32' ? path.join('Scripts', 'pip.exe') : 'pip');
        const venvDir = path.join(this.pythonDir, 'venv', version);
        const activate = path.join(this.pythonDir, 'venv', version, 'Scripts', 'activate');

        if (!fs.existsSync(pip)) {
            log.warn(`cannot find pip: ${pip}`);
            return false;
        }

        const commands = [
            `"${python}" -m venv ${venvDir}`,
            `"${activate}"`,
            `"${pip}" config set global.index-url https://mirrors.aliyun.com/pypi/simple`,
            `"${pip}" install uv`,
        ]

        try {
            for (const cmd of commands) {
                log.info(`run cmd:`, cmd);
                const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
                log.info(`cmd result: `, result);
            }
        } catch (error) {
            log.error(`run cmd fail: ${error.message}`);
            return false;
        }

        return true;
    }

    /**
     * 判断Node.js是否已安装，先查环境变量，再查自定义目录
     * @param {string} [version] 指定版本，不传则检测是否有任意版本
     * @returns {Promise<{installed: boolean, path: string|null}>}
     */
    async isNodeInstalled(version) {
        const nodeExe = os.platform() === 'win32' ? 'node.exe' : 'node';
        // 1. 先查环境变量
        const pathEnv = process.env.PATH || process.env.Path || '';
        const pathSep = os.platform() === 'win32' ? ';' : ':';
        const exts = os.platform() === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
        for (const dir of pathEnv.split(pathSep)) {
            for (const ext of exts) {
                const nodePath = path.join(dir, 'node' + ext);
                if (fs.existsSync(nodePath)) {
                    try {
                        const result = await this.getVersionAsync(nodePath);
                        if (result && result.version.replace(/^v/, '') === version.replace(/^v/, '')) {
                            return { installed: true, path: nodePath };
                        }
                    } catch (err) {
                        log.warn(`Node.js版本检测失败: ${nodePath}`);
                    }
                }
            }
        }

        // 2. 查自定义安装目录
        if (!fs.existsSync(this.nodeDir)) {
            return { installed: false, path: null };
        }

        const versionDir = path.join(this.nodeDir, version);
        let nodePath = path.join(versionDir, nodeExe);
        if (fs.existsSync(nodePath)) {
            return { installed: true, path: nodePath };
        }

        nodePath = path.join(versionDir, 'bin', nodeExe);
        if (fs.existsSync(nodePath)) {
            return { installed: true, path: nodePath };
        }

        return { installed: false, path: null };
    }

    /**
     * 判断Python是否已安装，先查环境变量，再查自定义目录
     * @param {string} [version] 指定版本，不传则检测是否有任意版本
     * @returns {Promise<{installed: boolean, path: string|null}>}
     */
    async isPythonInstalled(version) {
        const pyNames = os.platform() === 'win32' ? ['python.exe', 'python3.exe', 'python'] : ['python3', 'python'];
        // 1. 先查环境变量
        const pathEnv = process.env.PATH || process.env.Path || '';
        const pathSep = os.platform() === 'win32' ? ';' : ':';
        for (const dir of pathEnv.split(pathSep)) {
            for (const pyName of pyNames) {
                const pyPath = path.join(dir, pyName);
                if (fs.existsSync(pyPath)) {
                    try {
                        const result = await this.getVersionAsync(pyPath, 'Python');
                        if (result && result.version.startsWith(version)) {
                            return { installed: true, path: pyPath };
                        }
                    } catch (e) {
                        log.info("获取安装版本失败", e)
                    }
                }
            }
        }

        // 2. 查自定义安装目录
        if (!fs.existsSync(this.pythonDir)) {
            return { installed: false, path: null };
        }

        const versionDir = path.join(this.pythonDir, version);
        let pyPath = os.platform() === 'win32'
            ? path.join(versionDir, 'python.exe')
            : path.join(versionDir, 'bin', 'python3');
        if (fs.existsSync(pyPath)) {
            return { installed: true, path: pyPath };
        }

        pyPath = path.join(versionDir, 'python3');
        if (fs.existsSync(pyPath)) {
            return { installed: true, path: pyPath };
        }

        pyPath = path.join(versionDir, 'python');
        if (fs.existsSync(pyPath)) {
            return { installed: true, path: pyPath };
        }

        return { installed: false, path: null };
    }

    /**
     * 删除指定版本的 Node.js
     * @param {string} version 版本号，例如 'v22.16.0'
     * @returns {Promise<void>}
     */
    async removeNode(version) {
        const versionDir = path.join(this.nodeDir, version);
        if (fs.existsSync(versionDir)) {
            await new Promise((resolve, reject) => {
                fs.rm(versionDir, { recursive: true, force: true }, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        log.info(`已删除 Node.js 版本: ${versionDir}`);
                        resolve();
                    }
                });
            });
        } else {
            log.info(`Node.js 版本目录不存在: ${versionDir}`);
        }
    }

    /**
     * 删除指定版本的 Python
     * @param {string} version 版本号，例如 '3.10.11'
     * @returns {Promise<void>}
     */
    async removePython(version) {
        const versionDir = path.join(this.pythonDir, version);
        const { filename, ext } = this.getPythonDownloadInfo(version);
        const installerPath = path.join(this.downloadDir, filename);
        if (ext === 'exe' && fs.existsSync(installerPath)) {
            // Windows下用安装包静默卸载
            const { execFile } = require('child_process');
            try {
                await new Promise((resolve, reject) => {
                    execFile(installerPath, ['/uninstall', '/quiet', 'InstallAllUsers=0'], (error) => {
                        if (error) {
                            reject(error);
                        } else {
                            log.info(`已通过安装程序卸载 Python: ${installerPath}`);
                            resolve();
                        }
                    });
                });
            } catch (err) {
                log.warn(`通过安装程序卸载 Python 失败: ${installerPath}`, err.message);
            }
        } else if (fs.existsSync(versionDir)) {
            // 其他平台或无安装包时，仍然尝试物理删除
            await new Promise((resolve, reject) => {
                fs.rm(versionDir, { recursive: true, force: true }, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        log.info(`已物理删除 Python 版本: ${versionDir}`);
                        resolve();
                    }
                });
            });
        } else {
            log.info(`Python 版本目录不存在: ${versionDir}`);
        }
    }

    /**
     * 异步获取可执行文件版本信息
     * @param {string} execPath 可执行文件路径
     * @param {string} prefix 要替换的前缀字符串
     * @returns {Promise<{path: string, version: string}|null>}
     */
    async getVersionAsync(execPath, prefix = '') {
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            const timeout = 3000; // 3秒超时

            exec(`"${execPath}" --version`, { timeout }, (error, stdout) => {
                if (error) {
                    resolve(null);
                    return;
                }

                const version = stdout.toString().replace(prefix, '').trim();
                if (version) {
                    resolve({ path: execPath, version });
                } else {
                    resolve(null);
                }
            });
        });
    }

    /**
     * 获取所有已安装的 Node.js 信息（版本和路径）
     * @returns {Promise<Array<{version: string, path: string}>>}
     */
    async getAllInstalledNodes() {
        const nodeExeNames = os.platform() === 'win32' ? ['node.exe'] : ['node'];
        const pathEnv = process.env.PATH || process.env.Path || '';
        const pathSep = os.platform() === 'win32' ? ';' : ':';
        const exts = os.platform() === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
        const found = new Map();
        const promises = [];

        // 1. 查找环境变量中的 node
        for (const dir of pathEnv.split(pathSep)) {
            for (const exe of nodeExeNames) {
                for (const ext of exts) {
                    const nodePath = path.join(dir, exe.replace('.exe', '') + ext);
                    if (fs.existsSync(nodePath)) {
                        promises.push(this.getVersionAsync(nodePath));
                    }
                }
            }
        }

        // 2. 查找自定义安装目录
        if (fs.existsSync(this.nodeDir)) {
            const versions = fs.readdirSync(this.nodeDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);
            for (const version of versions) {
                let nodePath = path.join(this.nodeDir, version, nodeExeNames[0]);
                if (!fs.existsSync(nodePath)) {
                    nodePath = path.join(this.nodeDir, version, 'bin', nodeExeNames[0]);
                }
                if (fs.existsSync(nodePath)) {
                    promises.push(this.getVersionAsync(nodePath));
                }
            }
        }

        // 等待所有版本检查完成
        try {
            const results = await Promise.allSettled(promises);
            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    const { path, version } = result.value;
                    if (!found.has(path)) {
                        found.set(path, version);
                    }
                }
            });
        } catch (error) {
            log.warn('获取Node.js版本信息时发生错误:', error.message);
        }

        // 返回数组
        return Array.from(found.entries()).map(([path, version]) => ({ version, path }));
    }

    /**
     * 获取所有已安装的 Python 信息（版本和路径）
     * @returns {Promise<Array<{version: string, path: string}>>}
     */
    async getAllInstalledPythons() {
        const pyNames = os.platform() === 'win32' ? ['python.exe', 'python3.exe', 'python'] : ['python3', 'python'];
        const pathEnv = process.env.PATH || process.env.Path || '';
        const pathSep = os.platform() === 'win32' ? ';' : ':';
        const found = new Map();
        const promises = [];

        // 1. 查找环境变量中的 python
        for (const dir of pathEnv.split(pathSep)) {
            for (const pyName of pyNames) {
                const pyPath = path.join(dir, pyName);
                if (fs.existsSync(pyPath)) {
                    promises.push(this.getVersionAsync(pyPath, 'Python'));
                }
            }
        }

        // 2. 查找自定义安装目录
        if (fs.existsSync(this.pythonDir)) {
            const versions = fs.readdirSync(this.pythonDir, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => d.name);
            for (const version of versions) {
                let pyPath = os.platform() === 'win32'
                    ? path.join(this.pythonDir, version, 'python.exe')
                    : path.join(this.pythonDir, version, 'bin', 'python3');
                if (!fs.existsSync(pyPath)) {
                    pyPath = path.join(this.pythonDir, version, 'python3');
                }
                if (!fs.existsSync(pyPath)) {
                    pyPath = path.join(this.pythonDir, version, 'python');
                }
                if (fs.existsSync(pyPath)) {
                    promises.push(this.getVersionAsync(pyPath, 'Python'));
                }
            }
        }

        // 等待所有版本检查完成
        try {
            const results = await Promise.allSettled(promises);
            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    const { path, version } = result.value;
                    if (!found.has(path)) {
                        found.set(path, version);
                    }
                }
            });
        } catch (error) {
            log.warn('获取Python版本信息时发生错误:', error.message);
        }

        // 返回数组
        return Array.from(found.entries()).map(([path, version]) => ({ version, path }));
    }

    /**
     * 获取所有运行环境信息，包括 Node.js 和 Python 的安装列表
     * @returns {Promise<{ node: Array<{version: string, path: string}>, python: Array<{version: string, path: string}> }>}
     */
    async getAllRuntimeInfo() {
        try {
            const [nodeInfo, pythonInfo] = await Promise.all([
                this.getAllInstalledNodes(),
                this.getAllInstalledPythons()
            ]);

            return {
                node: nodeInfo,
                python: pythonInfo
            };
        } catch (error) {
            log.error('获取运行环境信息失败:', error.message);
            return {
                node: [],
                python: []
            };
        }
    }

    /**
     * 从环境变量PATH、自定义安装目录搜索可执行文件
     * @param {string} filename 要搜索的可执行文件名
     * @returns {string|null} 找到的可执行文件的完整路径，如果未找到则返回null
     */
    findExecutablePath(filename) {
        try {
            // 获取系统PATH环境变量
            const pathEnv = process.env.PATH || process.env.Path || process.env.path;
            if (!pathEnv) {
                log.error('无法获取系统PATH环境变量');
                return null;
            }

            // 获取路径分隔符（Windows是分号，Linux/Mac是冒号）
            const pathSeparator = process.platform === 'win32' ? ';' : ':';

            // 获取可执行文件扩展名（Windows上需要检查.exe等扩展名）
            const exeExtensions = process.platform === 'win32'
                ? (process.env.PATHEXT || '.exe;.cmd;.bat').split(pathSeparator)
                : [''];

            // 搜索每个PATH目录
            let pathDirs = pathEnv.split(pathSeparator);
            pathDirs = pathDirs.concat(this.getExecutableDirs());

            for (const dir of pathDirs) {
                if (!dir) {
                    continue;
                }
                log.info(`search dir: ${dir}`)

                // 对于每个可能的扩展名，检查可执行文件是否存在
                for (const ext of exeExtensions) {
                    const fullPath = path.join(dir, filename + ext);
                    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
                        log.info(`在PATH中找到可执行文件: ${fullPath}`);
                        return fullPath;
                    }
                }
            }

            log.warn(`在PATH中未找到可执行文件: ${filename}`);
            return null;
        } catch (error) {
            log.error(`搜索可执行文件时出错: ${error.message}`);
            return null;
        }
    }
}

module.exports = new McpRuntimeManager();

// 处理获取MCP运行环境信息的请求
ipcMain.handle('get-mcp-runtime-info', async () => {
    return await module.exports.getAllRuntimeInfo();
});

// 处理安装Node.js运行环境的请求
ipcMain.handle('install-node-runtime', async (event, version, taskKey) => {
    // taskKey: 渲染进程传递的唯一任务key
    try {
        if (!version.startsWith('v')) {
            version = 'v' + version;
        }

        // 下载和解压过程推送进度
        await module.exports.installNodeWithProgress(version, taskKey, event);
        return { success: true };
    } catch (error) {
        // 失败时推送错误事件
        if (taskKey) {
            event.sender.send('node-install-progress', {
                taskKey,
                percent: 0,
                speed: '-',
                status: 'error',
                error: error.message || '未知错误'
            });
        }
        return { success: false, error: error.message };
    }
});

// 处理安装Python运行环境的请求
ipcMain.handle('install-python-runtime', async (event, version, taskKey) => {
    try {
        await module.exports.installPythonWithProgress(version, taskKey, event);
        return { success: true };
    } catch (error) {
        if (taskKey) {
            event.sender.send('python-install-progress', {
                taskKey,
                percent: 0,
                speed: '-',
                status: 'error',
                error: error.message || '未知错误'
            });
        }
        return { success: false, error: error.message };
    }
});

// 处理卸载Node.js运行环境的请求
ipcMain.handle('uninstall-node-runtime', async (event, version) => {
    try {
        if (!version.startsWith('v')) {
            version = 'v' + version;
        }

        await module.exports.removeNode(version);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 处理卸载Python运行环境的请求
ipcMain.handle('uninstall-python-runtime', async (event, version) => {
    try {
        await module.exports.removePython(version);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

