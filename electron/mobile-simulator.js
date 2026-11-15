const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');

// Total sandbox isolation: Use temporary user data directory so it never touches installed app data
app.setPath('userData', path.join(os.tmpdir(), 'networth-mobile-simulator-profile'));

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 420,
    height: 890,
    minWidth: 360,
    minHeight: 640,
    maxWidth: 540,
    resizable: true,
    title: '📱 NetWorth Tracker - Mobile Testbed (Android Viewport)',
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Mobile User Agent emulation
  win.webContents.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');

  win.loadURL('http://127.0.0.1:5173');

  win.on('closed', () => {
    app.quit();
  });
});

