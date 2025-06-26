# Node Process Monitor

This package monitors:
- Focused window (using get-window)
- AFK/idle time
- System sleep/wake/power events
- Start/stop/cpu/memory/unresponsive state of processes matching substrings in environment variables

## Usage
- Run `npm install` to install dependencies
- Run `npm start` to start monitoring

## Output
- Logs changes only, at most once per minute
- Log format: JSON lines in `logs/monitor.log`

## Configuration
- Set `MONITOR_PROCESS_SUBSTRINGS` environment variable (comma-separated list)
