import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('colorPickerAPI', {
  onScreenshotData: (callback: (dataUrl: string, width: number, height: number) => void) => {
    ipcRenderer.on('screenshot-data', (_event, dataUrl, width, height) => {
      callback(dataUrl, width, height);
    });
  },
  sendColorPicked: (colorHex: string) => {
    ipcRenderer.send('color-picked', colorHex);
  },
});
