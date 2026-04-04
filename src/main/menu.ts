import type { MenuItemConstructorOptions } from 'electron';
import { app, Menu, shell, BrowserWindow } from 'electron';
import i18n from './i18n';

export default class MenuBuilder {
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  buildMenu(): Menu {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') {
      this.setupDevelopmentEnvironment();
    }

    const template =
      process.platform === 'darwin' ? this.buildDarwinTemplate() : this.buildDefaultTemplate();

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    return menu;
  }

  setupDevelopmentEnvironment(): void {
    if (!process.env.NO_DEVTOOLS) this.mainWindow.openDevTools();
    this.mainWindow.webContents.on('context-menu', (_e, props) => {
      const { x, y } = props;
      const t = i18n.t.bind(i18n);

      Menu.buildFromTemplate([
        {
          label: t('menu.inspectElement'),
          click: () => {
            this.mainWindow.inspectElement(x, y);
          },
        },
      ]).popup({ window: this.mainWindow });
    });
  }

  private buildFileSubmenu(isMac: boolean): MenuItemConstructorOptions {
    const mod = isMac ? 'Command' : 'Ctrl';
    const t = i18n.t.bind(i18n);
    return {
      label: isMac ? t('menu.file') : '&' + t('menu.file'),
      submenu: [
        {
          label: t('menu.file.new'),
          accelerator: `${mod}+N`,
          click: () => {
            this.mainWindow.webContents.send('menu:new-project');
          },
        },
        {
          label: t('menu.file.open') + '...',
          accelerator: `${mod}+O`,
          click: () => {
            this.mainWindow.webContents.send('menu:open-project');
          },
        },
        { type: 'separator' },
        {
          label: t('menu.file.save'),
          accelerator: `${mod}+S`,
          click: () => {
            this.mainWindow.webContents.send('menu:save');
          },
        },
        {
          label: t('menu.file.saveAs') + '...',
          accelerator: `${mod}+Shift+S`,
          click: () => {
            this.mainWindow.webContents.send('menu:save-as');
          },
        },
        { type: 'separator' },
        {
          label: t('menu.file.importIcons') + '...',
          accelerator: `${mod}+I`,
          click: () => {
            this.mainWindow.webContents.send('menu:import-icons');
          },
        },
        {
          label: t('menu.file.exportFonts') + '...',
          accelerator: `${mod}+E`,
          click: () => {
            this.mainWindow.webContents.send('menu:export-fonts');
          },
        },
        // Close is in the Window menu on macOS (performClose: selector)
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              {
                label: '&' + t('menu.file.close'),
                accelerator: `${mod}+W`,
                click: () => {
                  this.mainWindow.close();
                },
              },
            ]),
      ],
    };
  }

  buildDarwinTemplate(): MenuItemConstructorOptions[] {
    const t = i18n.t.bind(i18n);

    const subMenuAbout: MenuItemConstructorOptions = {
      label: 'Bobcorn',
      submenu: [
        {
          label: t('menu.about'),
          selector: 'orderFrontStandardAboutPanel:',
        },
        { type: 'separator' },
        { label: t('menu.services'), submenu: [] },
        { type: 'separator' },
        {
          label: t('menu.hide'),
          accelerator: 'Command+H',
          selector: 'hide:',
        },
        {
          label: t('menu.hideOthers'),
          accelerator: 'Command+Shift+H',
          selector: 'hideOtherApplications:',
        },
        { label: t('menu.showAll'), selector: 'unhideAllApplications:' },
        { type: 'separator' },
        {
          label: t('menu.quit'),
          accelerator: 'Command+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    };
    const subMenuEdit: MenuItemConstructorOptions = {
      label: t('menu.edit'),
      submenu: [
        { label: t('menu.edit.undo'), accelerator: 'Command+Z', selector: 'undo:' },
        { label: t('menu.edit.redo'), accelerator: 'Shift+Command+Z', selector: 'redo:' },
        { type: 'separator' },
        { label: t('menu.edit.cut'), accelerator: 'Command+X', selector: 'cut:' },
        { label: t('menu.edit.copy'), accelerator: 'Command+C', selector: 'copy:' },
        { label: t('menu.edit.paste'), accelerator: 'Command+V', selector: 'paste:' },
        {
          label: t('menu.edit.selectAll'),
          accelerator: 'Command+A',
          selector: 'selectAll:',
        },
      ],
    };
    const subMenuViewDev: MenuItemConstructorOptions = {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.view.reload'),
          accelerator: 'Command+R',
          click: () => {
            this.mainWindow.webContents.reload();
          },
        },
        {
          label: t('menu.view.toggleFullScreen'),
          accelerator: 'Ctrl+Command+F',
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          },
        },
        {
          label: t('menu.view.toggleDevTools'),
          accelerator: 'Alt+Command+I',
          click: () => {
            this.mainWindow.toggleDevTools();
          },
        },
      ],
    };
    const subMenuViewProd: MenuItemConstructorOptions = {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.view.toggleFullScreen'),
          accelerator: 'Ctrl+Command+F',
          click: () => {
            this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
          },
        },
      ],
    };
    const subMenuWindow: MenuItemConstructorOptions = {
      label: t('menu.window'),
      submenu: [
        {
          label: t('menu.window.minimize'),
          accelerator: 'Command+M',
          selector: 'performMiniaturize:',
        },
        { label: t('menu.window.close'), accelerator: 'Command+W', selector: 'performClose:' },
        { type: 'separator' },
        { label: t('menu.window.bringAllToFront'), selector: 'arrangeInFront:' },
      ],
    };
    const subMenuHelp: MenuItemConstructorOptions = {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.help.learnMore'),
          click() {
            shell.openExternal('http://electron.atom.io');
          },
        },
        {
          label: t('menu.help.docs'),
          click() {
            shell.openExternal('https://github.com/atom/electron/tree/master/docs#readme');
          },
        },
        {
          label: t('menu.help.community'),
          click() {
            shell.openExternal('https://discuss.atom.io/c/electron');
          },
        },
        {
          label: t('menu.help.searchIssues'),
          click() {
            shell.openExternal('https://github.com/atom/electron/issues');
          },
        },
      ],
    };

    const subMenuView = process.env.NODE_ENV === 'development' ? subMenuViewDev : subMenuViewProd;

    return [
      subMenuAbout,
      this.buildFileSubmenu(true),
      subMenuEdit,
      subMenuView,
      subMenuWindow,
      subMenuHelp,
    ];
  }

  buildDefaultTemplate(): MenuItemConstructorOptions[] {
    const t = i18n.t.bind(i18n);

    const templateDefault: MenuItemConstructorOptions[] = [
      this.buildFileSubmenu(false),
      {
        label: '&' + t('menu.view'),
        submenu:
          process.env.NODE_ENV === 'development'
            ? [
                {
                  label: '&' + t('menu.view.reload'),
                  accelerator: 'Ctrl+R',
                  click: () => {
                    this.mainWindow.webContents.reload();
                  },
                },
                {
                  label: t('menu.view.toggleFullScreen'),
                  accelerator: 'F11',
                  click: () => {
                    this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
                  },
                },
                {
                  label: t('menu.view.toggleDevTools'),
                  accelerator: 'Alt+Ctrl+I',
                  click: () => {
                    this.mainWindow.toggleDevTools();
                  },
                },
              ]
            : [
                {
                  label: t('menu.view.toggleFullScreen'),
                  accelerator: 'F11',
                  click: () => {
                    this.mainWindow.setFullScreen(!this.mainWindow.isFullScreen());
                  },
                },
              ],
      },
      {
        label: t('menu.help'),
        submenu: [
          {
            label: t('menu.help.learnMore'),
            click() {
              shell.openExternal('http://electron.atom.io');
            },
          },
          {
            label: t('menu.help.docs'),
            click() {
              shell.openExternal('https://github.com/atom/electron/tree/master/docs#readme');
            },
          },
          {
            label: t('menu.help.community'),
            click() {
              shell.openExternal('https://discuss.atom.io/c/electron');
            },
          },
          {
            label: t('menu.help.searchIssues'),
            click() {
              shell.openExternal('https://github.com/atom/electron/issues');
            },
          },
        ],
      },
    ];

    return templateDefault;
  }
}
