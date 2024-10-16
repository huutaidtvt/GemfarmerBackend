const { contextBridge, ipcRenderer } = require('electron/renderer');

contextBridge.exposeInMainWorld('electronAPI', {
  getIdDevice: (data) => ipcRenderer.invoke('getIdDevice', data),
  sendData: (data) => ipcRenderer.invoke('sendData', data),
  checkLicense: (data) => ipcRenderer.invoke('checkLicense', data),
  crudScript: (data) => ipcRenderer.invoke('crudScript', data),
  startUpdate: (data) => ipcRenderer.send('startUpdate', data),
  openLink: (data) => ipcRenderer.send('openLink', data),
  excelManage: (data) => ipcRenderer.invoke('excelManage', data),
  readFileText: (data) => ipcRenderer.invoke('readFileText', data),
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  quitAndInstall: (data) => ipcRenderer.invoke('quitAndInstall', data),
  initLaucher: (data) => ipcRenderer.invoke('initLaucher', data),
  getDeviceList: (data) => ipcRenderer.invoke('getDeviceList', data),

  searchApp: (data) => ipcRenderer.invoke('searchStore', data),
  downloadApp: (data) => ipcRenderer.invoke('dowloadApp', data),
  getListApp: (data) => ipcRenderer.invoke('getListApp', data),

  onUpdate: (cb) => {
    ipcRenderer.on('onUpdate', (event, data) => cb(data));
  },
  onDevicesState: (cb) => {
    ipcRenderer.on('onDevicesState', (event, data) => cb(data));
  },
})