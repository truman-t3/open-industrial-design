// SPDX-License-Identifier: MPL-2.0
const { app, BrowserWindow, protocol, net, session, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assetPath, prepareDataDirectory } = require('./policy.cjs');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'oid',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);
const dataArgument = process.argv.find((arg) => arg.startsWith('--data-dir='));
let dataDirectory;
try {
  dataDirectory = prepareDataDirectory(
    dataArgument
      ? dataArgument.slice(11)
      : path.join(path.dirname(process.execPath), '..', 'Open Industrial Design Data'),
  );
  app.setPath('userData', path.join(dataDirectory, 'profile'));
  app.setPath('sessionData', path.join(dataDirectory, 'cache'));
  app.setPath('crashDumps', path.join(dataDirectory, 'crashes'));
  app.setAppLogsPath(path.join(dataDirectory, 'logs'));
} catch (error) {
  dialog.showErrorBox('Open Industrial Design — data directory', error.message);
  app.exit(1);
}

let window;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    window?.restore();
    window?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      protocol.handle('oid', async (request) => {
        try {
          return await net.fetch(
            pathToFileURL(assetPath(path.join(__dirname, 'web'), request.url, request.method)).href,
          );
        } catch {
          return new Response('Not found', { status: 404 });
        }
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: '项目',
            submenu: [
              {
                label: '打开数据目录',
                click: () => {
                  shell.openPath(dataDirectory);
                },
              },
              {
                label: '数据与升级说明',
                click: () =>
                  dialog.showMessageBox(window, {
                    type: 'info',
                    message: '项目自动保存在独立数据目录。',
                    detail:
                      '升级只替换程序目录，不删除旁边的数据目录。分享前请导出 .oidproj，不要分享整个数据目录：其中可能包含记住的 API Key。此版本为未签名桌面原型。',
                  }),
              },
              { type: 'separator' },
              { role: 'quit', label: '退出' },
            ],
          },
          {
            label: '编辑',
            submenu: [
              { role: 'undo' },
              { role: 'redo' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { role: 'selectAll' },
            ],
          },
          {
            label: '视图',
            submenu: [
              { role: 'reload' },
              { role: 'resetZoom' },
              { role: 'zoomIn' },
              { role: 'zoomOut' },
              { role: 'togglefullscreen' },
            ],
          },
        ]),
      );
      window = new BrowserWindow({
        width: 1440,
        height: 1000,
        minWidth: 900,
        minHeight: 650,
        title: 'Open Industrial Design — Desktop Prototype',
        show: !process.argv.includes('--smoke-test'),
        webPreferences: {
          offscreen: process.argv.includes('--smoke-test'),
          backgroundThrottling: false,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (url !== 'oid://workspace/') event.preventDefault();
      });
      window.webContents.on('will-attach-webview', (event) => event.preventDefault());
      await window.loadURL('oid://workspace/');
    })
    .catch(() => {
      dialog.showErrorBox('Open Industrial Design', '无法启动桌面原型，请保留数据目录并反馈问题。');
      app.exit(1);
    });
}
app.on('window-all-closed', () => app.quit());
