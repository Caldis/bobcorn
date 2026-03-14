"use strict";
const os = require("os");
const path = require("path");
const electron = require("electron");
const electronUpdater = require("electron-updater");
class MenuBuilder {
  constructor(mainWindow2) {
    this.mainWindow = mainWindow2;
  }
  buildMenu() {
    if (process.env.NODE_ENV === "development" || process.env.DEBUG_PROD === "true") {
      this.setupDevelopmentEnvironment();
    }
    const template = process.platform === "darwin" ? this.buildDarwinTemplate() : this.buildDefaultTemplate();
    const menu = electron.Menu.buildFromTemplate(template);
    electron.Menu.setApplicationMenu(menu);
    return menu;
  }
  setupDevelopmentEnvironment() {
    this.mainWindow.openDevTools();
    this.mainWindow.webContents.on("context-menu", (e, props) => {
      const { x, y } = props;
      electron.Menu.buildFromTemplate([
        {
          label: "Inspect element",
          click: () => {
            this.mainWindow.inspectElement(x, y);
          }
        }
      ]).popup({ window: this.mainWindow });
    });
  }
  buildDarwinTemplate() {
    const subMenuAbout = {
      label: "Electron",
      submenu: [
        {
          label: "About ElectronReact",
          selector: "orderFrontStandardAboutPanel:"
        },
        { type: "separator" },
        { label: "Services", submenu: [] },
        { type: "separator" },
        {
          label: "Hide ElectronReact",
          accelerator: "Command+H",
          selector: "hide:"
        },
        {
          label: "Hide Others",
          accelerator: "Command+Shift+H",
          selector: "hideOtherApplications:"
        },
        { label: "Show All", selector: "unhideAllApplications:" },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "Command+Q",
          click: () => {
            electron.app.quit();
          }
        }
      ]
    };
    const subMenuEdit = {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "Command+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+Command+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "Command+X", selector: "cut:" },
        { label: "Copy", accelerator: "Command+C", selector: "copy:" },
        { label: "Paste", accelerator: "Command+V", selector: "paste:" },
        {
          label: "Select All",
          accelerator: "Command+A",
          selector: "selectAll:"
        }
      ]
    };
    const subMenuViewDev = {
      label: "View",
      submenu: [
        {
          label: "Reload",
          accelerator: "Command+R",
          click: () => {
            this.mainWindow.webContents.reload();
          }
        },
        {
          label: "Toggle Full Screen",
          accelerator: "Ctrl+Command+F",
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          }
        },
        {
          label: "Toggle Developer Tools",
          accelerator: "Alt+Command+I",
          click: () => {
            this.mainWindow.toggleDevTools();
          }
        }
      ]
    };
    const subMenuViewProd = {
      label: "View",
      submenu: [
        {
          label: "Toggle Full Screen",
          accelerator: "Ctrl+Command+F",
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          }
        }
      ]
    };
    const subMenuWindow = {
      label: "Window",
      submenu: [
        {
          label: "Minimize",
          accelerator: "Command+M",
          selector: "performMiniaturize:"
        },
        { label: "Close", accelerator: "Command+W", selector: "performClose:" },
        { type: "separator" },
        { label: "Bring All to Front", selector: "arrangeInFront:" }
      ]
    };
    const subMenuHelp = {
      label: "Help",
      submenu: [
        {
          label: "Learn More",
          click() {
            electron.shell.openExternal("http://electron.atom.io");
          }
        },
        {
          label: "Documentation",
          click() {
            electron.shell.openExternal(
              "https://github.com/atom/electron/tree/master/docs#readme"
            );
          }
        },
        {
          label: "Community Discussions",
          click() {
            electron.shell.openExternal("https://discuss.atom.io/c/electron");
          }
        },
        {
          label: "Search Issues",
          click() {
            electron.shell.openExternal("https://github.com/atom/electron/issues");
          }
        }
      ]
    };
    const subMenuView = process.env.NODE_ENV === "development" ? subMenuViewDev : subMenuViewProd;
    return [subMenuAbout, subMenuEdit, subMenuView, subMenuWindow, subMenuHelp];
  }
  buildDefaultTemplate() {
    const templateDefault = [
      {
        label: "&File",
        submenu: [
          {
            label: "&Open",
            accelerator: "Ctrl+O"
          },
          {
            label: "&Close",
            accelerator: "Ctrl+W",
            click: () => {
              this.mainWindow.close();
            }
          }
        ]
      },
      {
        label: "&View",
        submenu: process.env.NODE_ENV === "development" ? [
          {
            label: "&Reload",
            accelerator: "Ctrl+R",
            click: () => {
              this.mainWindow.webContents.reload();
            }
          },
          {
            label: "Toggle &Full Screen",
            accelerator: "F11",
            click: () => {
              this.mainWindow.setFullScreen(
                !this.mainWindow.isFullScreen()
              );
            }
          },
          {
            label: "Toggle &Developer Tools",
            accelerator: "Alt+Ctrl+I",
            click: () => {
              this.mainWindow.toggleDevTools();
            }
          }
        ] : [
          {
            label: "Toggle &Full Screen",
            accelerator: "F11",
            click: () => {
              this.mainWindow.setFullScreen(
                !this.mainWindow.isFullScreen()
              );
            }
          }
        ]
      },
      {
        label: "Help",
        submenu: [
          {
            label: "Learn More",
            click() {
              electron.shell.openExternal("http://electron.atom.io");
            }
          },
          {
            label: "Documentation",
            click() {
              electron.shell.openExternal(
                "https://github.com/atom/electron/tree/master/docs#readme"
              );
            }
          },
          {
            label: "Community Discussions",
            click() {
              electron.shell.openExternal("https://discuss.atom.io/c/electron");
            }
          },
          {
            label: "Search Issues",
            click() {
              electron.shell.openExternal("https://github.com/atom/electron/issues");
            }
          }
        ]
      }
    ];
    return templateDefault;
  }
}
let mainWindow = null;
const platform = os.platform();
if (process.env.NODE_ENV === "development" || process.env.DEBUG_PROD === "true") {
  try {
    require("electron-debug")();
  } catch (e) {
  }
}
const installExtensions = async () => {
  try {
    const installer = require("electron-devtools-installer");
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ["REACT_DEVELOPER_TOOLS"];
    return Promise.all(
      extensions.map((name) => installer.default(installer[name], forceDownload))
    ).catch(console.log);
  } catch (e) {
  }
};
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("ready", async () => {
  if (process.env.NODE_ENV === "development" || process.env.DEBUG_PROD === "true") {
    await installExtensions();
  }
  mainWindow = new electron.BrowserWindow({
    show: false,
    width: 1200,
    minWidth: 1080,
    height: 800,
    minHeight: 640,
    hasShadow: true,
    // 窗口背景透明 (在非启用AERO的Win机器上会有窗口冻结的BUG
    transparent: false,
    // 无边框窗口
    frame: platform === "darwin",
    // OSX下, 窗口按钮内置
    titleBarStyle: platform === "darwin" ? "hiddenInset" : "hidden",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, "../preload/preload.js")
    }
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  mainWindow.webContents.on("did-finish-load", () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();
  electron.ipcMain.on("window-minimize", () => {
    if (mainWindow) mainWindow.minimize();
  });
  electron.ipcMain.on("window-maximize", () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  electron.ipcMain.on("window-close", () => {
    if (mainWindow) mainWindow.close();
  });
  electron.ipcMain.on("window-is-maximized", (event) => {
    event.returnValue = mainWindow ? mainWindow.isMaximized() : false;
  });
  electron.ipcMain.handle("dialog-show-open", async (event, options) => {
    return electron.dialog.showOpenDialog(mainWindow, options);
  });
  electron.ipcMain.handle("dialog-show-save", async (event, options) => {
    return electron.dialog.showSaveDialog(mainWindow, options);
  });
  electron.ipcMain.on("get-app-path", (event, name) => {
    event.returnValue = electron.app.getPath(name);
  });
  electron.ipcMain.on("install-update", () => {
    electronUpdater.autoUpdater.quitAndInstall();
  });
  electronUpdater.autoUpdater.checkForUpdatesAndNotify();
  electronUpdater.autoUpdater.on("update-available", () => {
    mainWindow?.webContents.send("update-available");
  });
  electronUpdater.autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("update-downloaded");
  });
});
