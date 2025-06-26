// watch-and-restart.js
import { spawn } from 'node:child_process';
import chokidar from 'chokidar';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONITOR_FILE = path.join(__dirname, 'monitor.js');
let child;

function stopChild() {
  if (!child) return;
  try {
    if (process.platform === 'win32') {
      child.kill('SIGKILL');        // no PGIDs on Windows
    } else {
      process.kill(-child.pid, 'SIGKILL'); // kill the whole group
    }
  } catch { /* already gone */ }
}

function startChild() {
  stopChild();

  child = spawn(process.execPath, [MONITOR_FILE], {
    env: { ...process.env, MONITOR_CHILD: '1' },
    stdio: 'inherit',
    detached: process.platform !== 'win32' // only useful on POSIX
  });
  if (child.detached) child.unref();       // let parent exit freely
}

startChild();

const watcher = chokidar.watch(MONITOR_FILE, { ignoreInitial: true })
  .on('all', () => {
    console.log('monitor.js changed, restarting monitor...');
    startChild();
  });

process.on('SIGINT', () => {
  watcher.close();
  stopChild();
  process.exit(0);
});
