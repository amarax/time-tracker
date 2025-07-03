// monitor.js: All monitoring logic for process, focused window, and system state
import fs from "fs";
import path from "path";
import os from "os";
import { activeWindow } from "get-windows";
import si from "systeminformation";
import dotenv from "dotenv";
import desktopIdle from "desktop-idle";

import { InfluxDBClient, Point } from '@influxdata/influxdb3-client'

dotenv.config({ path: path.join(process.cwd(), ".env") });

const INFLUX_URL = process.env.INFLUX_URL || 'http://127.0.0.1:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || '';
const INFLUX_ORG = process.env.INFLUX_ORG || '';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'process-monitor'; // match API DB name

const client = new InfluxDBClient({ host: INFLUX_URL, token: INFLUX_TOKEN });

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
    const pt = Point.measurement("focused") // match API measurement name
      .setTag("process", focused.process || "")
      .setTag("path", focused.path || "")
      .setTag("url", focused.url || "")
      .setTag("title", focused.title || "") // title as tag to match schema
      .setIntegerField("dummy",0)
      .setTimestamp(new Date());
    await client.write(pt, INFLUX_BUCKET);
  } catch (e) {
    console.error("Failed to write focused window to InfluxDB:", e);
  }
}

// Write process states to InfluxDB
async function logProcessStates(processStates) {
  for (const pid in processStates) {
    const proc = processStates[pid];
    try {
      const pt = Point.measurement("process") // match API measurement name
        .setTag("pid", String(pid))
        .setTag("name", proc.name || "")
        .setTag("status", proc.status || "")
        .setTag("started", String(proc.started)) // started as tag per schema
        .setFloatField("cpu", proc.cpu)
        .setIntegerField("memory", proc.memory)
        .setBooleanField("unresponsive", !!proc.unresponsive) // bool per schema
        .setTimestamp(new Date());
      await client.write(pt, INFLUX_BUCKET);
    } catch (e) {
      console.error("Failed to write process state to InfluxDB:", e);
    }
  }
}

// Write system state to InfluxDB
async function logSystemState(isIdle, sleepState, customTimestamp) {
  try {
    const pt = Point.measurement("system") // match API measurement name
      .setBooleanField("isIdle", !!isIdle)
      .setTag("sleepState", String(sleepState)) // sleepState as tag per schema
      .setTimestamp(customTimestamp ? new Date(customTimestamp) : new Date());
    await client.write(pt, INFLUX_BUCKET);
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
