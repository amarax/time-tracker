// monitor.js: All monitoring logic for process, focused window, and system state
import fs from "fs";
import path from "path";
import os from "os";
import { activeWindow } from "get-windows";
import si from "systeminformation";
import dotenv from "dotenv";
import RealIdle from "@paymoapp/real-idle";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const LOG_DIR = path.join(process.cwd(), "logs");
const FOCUSED_LOG_FILE = path.join(LOG_DIR, "focused.csv");
const PROCESS_LOG_FILE = path.join(LOG_DIR, "process.csv");
const SYSTEM_LOG_FILE = path.join(LOG_DIR, "system.csv");
const POLL_INTERVAL = 1000; // 1 second for demo, change to 60000 for 1 min
const PROCESS_SUBSTRINGS =
  process.env.MONITOR_PROCESS_SUBSTRINGS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) || [];

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

// Add headers if files do not exist

function logFocusedWindow(focused) {
  if (!focused) return;
  if (!fs.existsSync(FOCUSED_LOG_FILE)) {
    fs.writeFileSync(
      FOCUSED_LOG_FILE,
      "timestamp,title,process,path,url" + os.EOL
    );
  }

  // Always stringify and escape all fields to avoid CSV issues
  const line = [
    new Date().toISOString(),
    focused.title ? '"' + String(focused.title).replace(/"/g, '""') + '"' : "",
    focused.process
      ? '"' + String(focused.process).replace(/"/g, '""') + '"'
      : "",
    focused.path ? '"' + String(focused.path).replace(/"/g, '""') + '"' : "",
    focused.url ? '"' + String(focused.url).replace(/"/g, '""') + '"' : "",
  ].join(",");
  fs.appendFileSync(FOCUSED_LOG_FILE, line + os.EOL);
}

function logProcessStates(processStates) {
  if (!fs.existsSync(PROCESS_LOG_FILE)) {
    fs.writeFileSync(
      PROCESS_LOG_FILE,
      "timestamp,pid,name,cpu,memory,status,started,unresponsive" + os.EOL
    );
  }

  for (const pid in processStates) {
    const proc = processStates[pid];
    const line = `${new Date().toISOString()},${pid},${proc.name},${proc.cpu},${
      proc.memory
    },${proc.status},${proc.started},${proc.unresponsive}`;
    fs.appendFileSync(PROCESS_LOG_FILE, line + os.EOL);
  }
}

let lastFocused = undefined;
let lastIdleState = false;
let lastLockedState = false;
let lastSleepState = null;
let lastProcessStates = {};
const IDLE_THRESHOLD = 5 * 60; // 5 minutes
let lastSleepEvent = null;
let lastPollTime = Date.now();
let lastSleepStart = null;

async function getFocusedWindow() {
  try {
    const win = await activeWindow();
    if (!win) return null;
    return {
      title: win.title,
      process: win.owner?.name,
      hwnd: win.id,
      path: win.owner?.path,
      pid: win.owner?.processId,
      url: win.url || undefined,
    };
  } catch (e) {
    return null;
  }
}

const totalMemory = await si.mem().then((mem) => mem.total);

async function getProcessStates() {
  const allProcs = await si.processes();
  const matches = allProcs.list.filter((proc) =>
    PROCESS_SUBSTRINGS.some(
      (sub) =>
        proc.name && sub && proc.name.toLowerCase().includes(sub.toLowerCase())
    )
  );
  const states = {};
  for (const proc of matches) {
    states[proc.pid] = {
      name: proc.name,
      cpu: proc.cpu,
      memory: Math.round(proc.mem * totalMemory),
      status: proc.state,
      started: proc.started,
      unresponsive: proc.state === "uninterruptible",
    };
  }
  return states;
}

async function poll() {
  try {
    const now = Date.now();
    let sleepState = false;
    if (now - lastPollTime > POLL_INTERVAL * 2) {
      sleepState = true;
    }

    // If sleep detected and not already in sleep, log sleep start
    if (sleepState && !lastSleepState) {
      // Log sleep start (lastPollTime is when sleep started)
      logSystemState(lastIdleState, lastLockedState, 'sleep_start', new Date(lastPollTime).toISOString());
      lastSleepStart = lastPollTime;
    }
    // If waking up from sleep, log sleep stop (now)
    if (!sleepState && lastSleepState && lastSleepStart) {
      logSystemState(lastIdleState, lastLockedState, 'sleep_stop', new Date(now).toISOString());
      lastSleepStart = null;
    }
    lastPollTime = now;

    const focused = await getFocusedWindow();
    const idleState = RealIdle.getIdleState(IDLE_THRESHOLD);
    const lockedState = RealIdle.getLocked();
    const processStates = await getProcessStates();

    // Track focused window changes
    if (JSON.stringify(focused) !== JSON.stringify(lastFocused)) {
      logFocusedWindow(focused);
      lastFocused = focused;
    }

    // Track system (idle/locked/sleep) changes
    if (idleState !== lastIdleState || lockedState !== lastLockedState || sleepState !== lastSleepState) {
      if (!sleepState && !lastSleepState) {
        // Only log normal state if not a sleep transition
        logSystemState(idleState, lockedState, sleepState);
      }
      lastIdleState = idleState;
      lastLockedState = lockedState;
      lastSleepState = sleepState;
    }
    // Track process state changes per PID
    for (const pid in processStates) {
      const prev = lastProcessStates[pid];
      const curr = processStates[pid];
      if (!prev || JSON.stringify(prev) !== JSON.stringify(curr)) {
        // Only log if new or changed
        logProcessStates({ [pid]: curr });
      }
    }
    lastProcessStates = processStates;
  } catch (err) {
    console.error("Error in poll:", err);
  }
}

function logSystemState(isIdle, isLocked, sleepState, customTimestamp) {
  if (!fs.existsSync(SYSTEM_LOG_FILE)) {
    fs.writeFileSync(SYSTEM_LOG_FILE, "timestamp,isIdle,isLocked,sleepState" + os.EOL);
  }
  const line = `${customTimestamp || new Date().toISOString()},${isIdle},${isLocked},${sleepState}`;
  fs.appendFileSync(SYSTEM_LOG_FILE, line + os.EOL);
}

if (process.env.MONITOR_CHILD === "1" || !process.env.MONITOR_CHILD) {
  setInterval(() => poll(), POLL_INTERVAL);
  console.log("Node Process Monitor started.");
}
