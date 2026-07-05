const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskflow', {
  saveFile: (options) => ipcRenderer.invoke('dialog:save', options),
  openFile: (options) => ipcRenderer.invoke('dialog:open', options)
});
