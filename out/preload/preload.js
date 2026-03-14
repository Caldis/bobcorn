"use strict";
const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  windowMinimize: () => ipcRenderer.send("window-minimize"),
  windowMaximize: () => ipcRenderer.send("window-maximize"),
  windowClose: () => ipcRenderer.send("window-close"),
  windowIsMaximized: () => ipcRenderer.sendSync("window-is-maximized"),
  // Dialogs (via IPC to main process)
  showOpenDialog: (options) => ipcRenderer.invoke("dialog-show-open", options),
  showSaveDialog: (options) => ipcRenderer.invoke("dialog-show-save", options),
  // App paths
  getAppPath: (name) => ipcRenderer.sendSync("get-app-path", name),
  // File system
  readFileSync: (filePath, encoding) => {
    if (encoding) {
      return fs.readFileSync(filePath, encoding);
    }
    const buf = fs.readFileSync(filePath);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  },
  writeFileSync: (filePath, data) => fs.writeFileSync(filePath, data),
  writeFile: (filePath, data, callback) => {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },
  existsSync: (filePath) => fs.existsSync(filePath),
  statSync: (filePath) => {
    const stat = fs.statSync(filePath);
    return { size: stat.size, isFile: stat.isFile(), isDirectory: stat.isDirectory() };
  },
  accessSync: (filePath) => {
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  },
  mkdirSync: (dirPath, options) => fs.mkdirSync(dirPath, options),
  // Path utilities
  pathJoin: (...args) => path.join(...args),
  pathResolve: (...args) => path.resolve(...args),
  pathBasename: (p, ext) => path.basename(p, ext),
  pathExtname: (p) => path.extname(p),
  pathDirname: (p) => path.dirname(p),
  // OS
  platform: os.platform(),
  // Auto-update
  onUpdateAvailable: (callback) => ipcRenderer.on("update-available", callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on("update-downloaded", callback),
  installUpdate: () => ipcRenderer.send("install-update")
});
