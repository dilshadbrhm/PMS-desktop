import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// app.isPackaged is false in every dev launch (electron ., npm run electron:dev)
// and becomes true only after electron-builder packages the app.
// Much more reliable than process.env.NODE_ENV.
const isDev = !app.isPackaged;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // renderer has no direct Node access
      nodeIntegration: false,   // renderer cannot use require()
      // Disable web security ONLY in dev so that fetch → external API works
      // without needing a local proxy. Production build talks to the real
      // server via HTTPS so same-origin rules are not an issue.
      webSecurity: !isDev,
    },
  });

  if (isDev) {
    // Vite is locked to port 5173 via server.strictPort in vite.config.ts
    void win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // dist/index.html uses relative asset paths (base: './') — works with file://
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS it's conventional to keep the app running until Cmd+Q
  if (process.platform !== 'darwin') app.quit();
});
