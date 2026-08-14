delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let serverProcess = null;

const SERVER_PORT = Number(process.env.PORT || 3001);
const SERVER_START_TIMEOUT = 15000;
const SERVER_POLL_INTERVAL = 300;

function getAppRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, 'app.asar') : path.join(__dirname, '..');
}

function getJwtSecret() {
  return process.env.JWT_SECRET || `networth-local-${app.getPath('userData')}`;
}

function waitForServer() {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() - startedAt > SERVER_START_TIMEOUT) {
        reject(new Error('Server did not become ready within timeout'));
        return;
      }
      const req = http.get(`http://127.0.0.1:${SERVER_PORT}/api/auth/me`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => setTimeout(attempt, SERVER_POLL_INTERVAL));
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(attempt, SERVER_POLL_INTERVAL);
      });
    };
    attempt();
  });
}

async function startServer() {
  if (serverProcess) return;
  const appRoot = getAppRoot();
  serverProcess = fork(path.join(appRoot, 'server', 'index.js'), [], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(SERVER_PORT),
      DB_DIR: app.getPath('userData'),
      CLIENT_BUILD_PATH: path.join(appRoot, 'client', 'dist'),
      JWT_SECRET: getJwtSecret()
    },
    silent: true
  });

  serverProcess.stdout.on('data', (data) => console.log('[server]', data.toString().trim()));
  serverProcess.stderr.on('data', (data) => console.error('[server:err]', data.toString().trim()));
  serverProcess.on('exit', () => { serverProcess = null; });
  await waitForServer();
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'NetWorth Tracker',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.setMenuBarVisibility(false);
  const url = app.isPackaged ? `http://127.0.0.1:${SERVER_PORT}` : 'http://127.0.0.1:5173';
  await mainWindow.loadURL(url);

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

function shutdownServer() {
  if (!serverProcess) return;
  serverProcess.kill('SIGTERM');
  serverProcess = null;
}

app.whenReady().then(async () => {
  try {
    if (app.isPackaged) {
      await startServer();
      
      // Auto-updater configuration
      autoUpdater.checkForUpdatesAndNotify();
      
      autoUpdater.on('update-downloaded', (info) => {
        dialog.showMessageBox({
          type: 'info',
          title: 'Update Ready',
          message: `A new version of NetWorth Tracker is ready to install! \n\nWould you like to restart the application now to apply the update?`,
          buttons: ['Restart Now', 'Later']
        }).then((result) => {
          if (result.response === 0) {
            shutdownServer();
            autoUpdater.quitAndInstall(true, true);
          }
        });
      });
      
      autoUpdater.on('error', (err) => {
        console.error('AutoUpdater Error:', err);
      });
    }
    await createWindow();
  } catch (err) {
    dialog.showErrorBox('Startup Error', `Failed to start NetWorth Tracker:\n\n${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  shutdownServer();
  app.quit();
});

app.on('before-quit', shutdownServer);
app.on('activate', () => { if (mainWindow === null) createWindow(); });