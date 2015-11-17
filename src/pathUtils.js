var pathPlatformDependent = require("path");
var path = pathPlatformDependent.posix; // This works everythere, just use forward slashes
var fs = require("fs");
function dirOfNodeModule(name) {
    return path.dirname(require.resolve(name).replace(/\\/g, "/"));
}
exports.dirOfNodeModule = dirOfNodeModule;
function currentDirectory() {
    return process.cwd().replace(/\\/g, "/");
}
exports.currentDirectory = currentDirectory;
function isAbsolutePath(name) {
    return /^([a-zA-Z]\:)?\//.test(name);
}
exports.isAbsolutePath = isAbsolutePath;
function mkpathsync(dirpath) {
    try {
        if (!fs.statSync(dirpath).isDirectory()) {
            throw new Error(dirpath + ' exists and is not a directory');
        }
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            mkpathsync(path.dirname(dirpath));
            fs.mkdirSync(dirpath);
        }
        else {
            throw err;
        }
    }
}
exports.mkpathsync = mkpathsync;
;
function fileModifiedTime(path) {
    try {
        return fs.statSync(path).mtime.getTime();
    }
    catch (er) {
        return null;
    }
}
exports.fileModifiedTime = fileModifiedTime;
