import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ── IPC handlers ───────────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle(
  'dialog:saveFile',
  async (_event, { data, defaultName }: { data: number[]; defaultName: string }) => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [
        { name: 'PNG Image', extensions: ['png'] },
        { name: 'PDF Document', extensions: ['pdf'] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, Buffer.from(data));
    return result.filePath;
  }
);

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  const buf = fs.readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

ipcMain.handle('app:getPath', () => app.getAppPath());

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
