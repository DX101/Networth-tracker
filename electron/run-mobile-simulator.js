const { spawn } = require('child_process');
const electronPath = require('electron');
const path = require('path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const scriptPath = path.join(__dirname, 'mobile-simulator.js');

const child = spawn(electronPath, [scriptPath], {
  stdio: 'inherit',
  env,
  detached: true
});

child.unref();
console.log('Mobile simulator launched successfully with PID:', child.pid);

