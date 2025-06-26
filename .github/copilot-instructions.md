<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This workspace contains three main components:
- node-process-monitor: Node.js process monitor for focused window, AFK/idle, sleep/wake, and process usage logging.
- browser-extension: Browser extension for active tab info.
- sveltekit-server: SvelteKit server for log visualization.

For the process monitor, prefer using get-window, node-os-utils, and active-win for polling and logging. Only log changes, poll at most once per minute. Use environment variable MONITOR_PROCESS_SUBSTRINGS for process matching.
