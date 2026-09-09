// Preload script — runs in a privileged context between main and renderer.
// contextIsolation: true means this is the ONLY place to safely expose
// Node/Electron APIs to the renderer via contextBridge.
//
// Example (uncomment when needed):
//
// import { contextBridge, ipcRenderer } from 'electron';
//
// contextBridge.exposeInMainWorld('electronAPI', {
//   send: (channel: string, data?: unknown) => ipcRenderer.send(channel, data),
//   on:   (channel: string, cb: (...args: unknown[]) => void) =>
//           ipcRenderer.on(channel, (_event, ...args) => cb(...args)),
// });

export {};
