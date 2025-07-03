// monitor.js: All monitoring logic for process, focused window, and system state
import fs from "fs";
import path from "path";
import os from "os";
import { activeWindow } from "get-windows";
import si from "systeminformation";
import dotenv from "dotenv";
import desktopIdle from "desktop-idle";

import { InfluxDB, Point } from '@influxdata/influxdb-client'

const INFLUX_URL = 'http://127.0.0.1:8086'
const INFLUX_TOKEN = '' // blank is fine when --without-auth is set
const INFLUX_ORG = ''   // not used with --without-auth, but required by client
const INFLUX_BUCKET = 'sys'

const influxDB = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN })
const writeApi = influxDB.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ns')

dotenv.config({ path: path.join(process.cwd(), ".env") });

const LOG_DIR = path.join(process.cwd(), "logs");
const POLL_INTERVAL = 1000; // 1 second for demo, change to 60000 for 1 min
const PROCESS_SUBSTRINGS =
  process.env.MONITOR_PROCESS_SUBSTRINGS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) || [];

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

// Write focused window info to InfluxDB
async function logFocusedWindow(focused) {
  if (!focused) return;
  try {
    const pt = new Point("focused_window")
      .tag("process", focused.process || "")
      .tag("path", focused.path || "")
      .tag("url", focused.url || "")
      .stringField("title", focused.title || "")
      .timestamp(new Date());
    writeApi.writePoint(pt);
  } catch (e) {
    console.error("Failed to write focused window to InfluxDB:", e);
  }
}

// Write process states to InfluxDB
async function logProcessStates(processStates) {
  for (const pid in processStates) {
    const proc = processStates[pid];
    try {
      const pt = new Point("process_state")
        .tag("pid", String(pid))
        .tag("name", proc.name || "")
        .tag("status", proc.status || "")
        .floatField("cpu", proc.cpu)
        .intField("memory", proc.memory)
        .stringField("started", String(proc.started))
        .intField("unresponsive", proc.unresponsive ? 1 : 0)
        .timestamp(new Date());
      writeApi.writePoint(pt);
    } catch (e) {
      console.error("Failed to write process state to InfluxDB:", e);
    }
  }
}

// Write system state to InfluxDB
async function logSystemState(isIdle, sleepState, customTimestamp) {
  try {
    const pt = new Point("system_state")
      .intField("isIdle", isIdle ? 1 : 0)
      .intField("sleepState", sleepState ? 1 : 0)
      .timestamp(customTimestamp ? new Date(customTimestamp) : new Date());
    writeApi.writePoint(pt);
  } catch (e) {
    console.error("Failed to write system state to InfluxDB:", e);
  }
}

let lastFocused = undefined;
let lastIdleState = false;
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
    if (sleepState && !lastSleepState) {
      await logSystemState(lastIdleState, 'sleep_start', new Date(lastPollTime).toISOString());
      lastSleepStart = lastPollTime;
    }
    if (!sleepState && lastSleepState && lastSleepStart) {
      await logSystemState(lastIdleState, 'sleep_stop', new Date(now).toISOString());
      lastSleepStart = null;
    }
    lastPollTime = now;
    const focused = await getFocusedWindow();
    const idleSeconds = desktopIdle.getIdleTime();
    const idleState = idleSeconds >= IDLE_THRESHOLD;
    const processStates = await getProcessStates();
    if (JSON.stringify(focused) !== JSON.stringify(lastFocused)) {
      await logFocusedWindow(focused);
      lastFocused = focused;
    }
    if (idleState !== lastIdleState || sleepState !== lastSleepState) {
      if (!sleepState && !lastSleepState) {
        await logSystemState(idleState, sleepState);
      }
      lastIdleState = idleState;
      lastSleepState = sleepState;
    }
    for (const pid in processStates) {
      const prev = lastProcessStates[pid];
      const curr = processStates[pid];
      if (!prev || JSON.stringify(prev) !== JSON.stringify(curr)) {
        await logProcessStates({ [pid]: curr });
      }
    }
    lastProcessStates = processStates;
  } catch (err) {
    console.error("Error in poll:", err);
  }
}

// Ensure data is flushed on exit
process.on('SIGINT', async () => {
  try {
    await writeApi.close();
    console.log('InfluxDB writeApi closed.');
  } catch (e) {
    console.error('Error closing InfluxDB writeApi:', e);
  }
  process.exit();
});

if (process.env.MONITOR_CHILD === "1" || !process.env.MONITOR_CHILD) {
  setInterval(() => poll(), POLL_INTERVAL);
  console.log("Node Process Monitor started.");
}
