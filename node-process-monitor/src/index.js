// Entry point for the Node Process Monitor
// - Polls every minute
// - Logs only changes
// - Uses get-window for focused window
// - Detects AFK/idle, system sleep/wake, process events

import fs from 'fs';
import path from 'path';
import os from 'os';
import getWindow from 'get-window';
import si from 'systeminformation';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'monitor.log');
const POLL_INTERVAL = 60 * 1000; // 1 minute
const PROCESS_SUBSTRINGS = process.env.MONITOR_PROCESS_SUBSTRINGS?.split(',').map(s => s.trim()).filter(Boolean) || [];

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

function logChange(data) {
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ...data, ts: new Date().toISOString() }) + os.EOL);
}

// Polling logic
let lastState = {};
let lastAFK = false;
let lastSleepState = null;
let lastProcessStates = {};
let idleStart = null;
const IDLE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

function getFocusedWindow() {
  // Use get-window only
  try {
    return getWindow();
  } catch (e) {
    return null;
  }
}

function getIdleState() {
  // Windows only: use os-utils idle time if available, else fallback
  // Placeholder: always returns false (not idle)
  // TODO: Implement real idle detection
  return false;
}

function getSleepState() {
  // Placeholder: always returns null (no sleep/wake event)
  // TODO: Implement real sleep/wake detection
  return null;
}

async function getProcessStates() {
  const allProcs = await si.processes();
  const matches = allProcs.list.filter(proc => PROCESS_SUBSTRINGS.some(sub => proc.name && proc.name.includes(sub)));
  const states = {};
  for (const proc of matches) {
    states[proc.pid] = {
      name: proc.name,
      cpu: proc.pcpu,
      memory: proc.pmem,
      status: proc.state,
      started: proc.started,
      mem_vsz: proc.mem_vsz,
      mem_rss: proc.mem_rss,
      unresponsive: proc.state === 'uninterruptible',
    };
  }
  return states;
}

async function poll() {
  const focused = getFocusedWindow();
  const isIdle = getIdleState();
  const sleepState = getSleepState();
  const processStates = await getProcessStates();

  let changed = false;
  const state = { focused, isIdle, sleepState, processStates };

  if (JSON.stringify(state.focused) !== JSON.stringify(lastState.focused)) changed = true;
  if (state.isIdle !== lastAFK) changed = true;
  if (state.sleepState !== lastSleepState) changed = true;
  if (JSON.stringify(state.processStates) !== JSON.stringify(lastProcessStates)) changed = true;

  if (changed) {
    logChange(state);
    lastState = state;
    lastAFK = state.isIdle;
    lastSleepState = state.sleepState;
    lastProcessStates = state.processStates;
  }
}

setInterval(poll, POLL_INTERVAL);

console.log('Node Process Monitor started. Logging to', LOG_FILE);
