import { contextBridge, ipcRenderer } from 'electron';

// Expose a minimal, typed API to the renderer process via contextBridge.
// The main process handles the actual fs/dialog operations via ipcMain handlers.
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile') as Promise<string | null>,

  saveFile: (data: Uint8Array, defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', {
      data: Array.from(data),
      defaultName,
    }) as Promise<string | null>,

  readFile: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('fs:readFile', filePath) as Promise<ArrayBuffer>,

  getAppPath: (): Promise<string> =>
    ipcRenderer.invoke('app:getPath') as Promise<string>,
});
