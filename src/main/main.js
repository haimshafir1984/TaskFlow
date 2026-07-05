const path = require('path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { startServer } = require('../backend/server');

let mainWindow;
let localServer;

async function createWindow() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  localServer = await startServer({ dataDir });

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1060,
    minHeight: 720,
    backgroundColor: '#f6f9fc',
    title: 'TaskFlow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadURL(`http://127.0.0.1:${localServer.port}/index.html`);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (localServer?.server) localServer.server.close();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('dialog:save', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('dialog:open', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result.canceled ? null : result.filePaths[0];
});
