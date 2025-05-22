const path = require('path');
const fs = require('fs');
const Logger = require('./logger');
const log = new Logger('utils');

/**
 * 从系统环境变量PATH中搜索可执行文件
 * @param {string} filename 要搜索的可执行文件名
 * @returns {string|null} 找到的可执行文件的完整路径，如果未找到则返回null
 */
function findExecutableInPath(filename) {
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
        const pathDirs = pathEnv.split(pathSeparator);

        for (const dir of pathDirs) {
            if (!dir) continue;

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

module.exports = {
    findExecutableInPath
};
