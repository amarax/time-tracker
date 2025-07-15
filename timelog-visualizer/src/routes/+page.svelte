<script>
	import CalendarView from '$lib/components/CalendarView.svelte';

	import { onMount } from 'svelte';

	/**
	 * @typedef {Object} Entry
	 * @property {Date} timestamp - ISO string representing the start time of the entry
	 * @property {string} title - Focused window title
	 * @property {string} process - Process name
	 * @property {string} path - File path of the process
	 * @property {string} [url] - URL if the entry is a web page
	 */

	/**
	 * @typedef {Object} ProcessEntry
	 * @property {Date[]} timestamps - ISO string representing the start time of the entry
	 * @property {string} pid - Process ID
	 * @property {string} name - Process exe file
	 * @property {string[]} cpu - CPU usage percentage
	 * @property {string[]} memory - Memory usage in bytes
	 * @property {Date} started - ISO string representing the start time of the process
	 */

	let entries = $state([]);

	// Load the csv events from /logs
	async function load(logPath, startDate, endDate, timeUnit = 30) {
		const response = await fetch(`/logs/${logPath}?start=${startDate.getTime()}&end=${endDate.getTime()}&unit=${timeUnit}`);
		const text = await response.text();
		const lines = text.split('\n');
		const header = lines.shift().split(',');
		const rows = lines.map((line) => {
			// Unescape values that start and end with quotes
			const values = line.split(',').map((value) => {
				if (value.startsWith('"') && value.endsWith('"')) {
					return value.slice(1, -1).replace(/""/g, '"'); // Unescape double quotes
				}
				return value;
			});

			const entry = {};
			header.forEach((key, i) => {
				entry[key] = values[i];
			});
			return entry;
		});

		let e = rows.map((entry, i) => ({
			...entry,
			time: entry.time,
			end: rows[i + 1]?.time // Use the next entry's time as the end time, or the same time if it's the last entry
		}));

		const DAY = 86_400_000; // ms in a day

		/**
		 * Split events so each slice sits inside a single local day.
		 * @param {Array<{time:string,end:string}>} events
		 * @param {string}   tz  IANA zone, e.g. "Asia/Singapore"
		 * @returns {Array<{time:string,end:string}>}
		 */
		function splitByDay(events, tz = Intl.DateTimeFormat().resolvedOptions().timeZone) {
			// One formatter to read full Y-M-D-h-m-s parts in the target zone
			const fullFmt = new Intl.DateTimeFormat('en-US', {
				timeZone: tz,
				hour12: false,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit'
			});

			// Get zone offset (ms) for a given UTC timestamp
			const offset = (ts) => {
				const parts = Object.fromEntries(
					fullFmt
						.formatToParts(new Date(ts))
						.filter((p) => p.type !== 'literal')
						.map((p) => [p.type, +p.value])
				);
				const localEpoch = Date.UTC(
					parts.year,
					parts.month - 1,
					parts.day,
					parts.hour,
					parts.minute,
					parts.second
				);
				return localEpoch - ts; // positive east of UTC
			};

			// UTC timestamp of the next local midnight after ts
			const nextMidnight = (ts) => {
				const dParts = new Intl.DateTimeFormat('en-US', {
					timeZone: tz,
					year: 'numeric',
					month: '2-digit',
					day: '2-digit'
				})
					.formatToParts(new Date(ts))
					.filter((p) => p.type !== 'literal')
					.reduce((a, p) => ((a[p.type] = +p.value), a), {});

				const baseUTC = Date.UTC(dParts.year, dParts.month - 1, dParts.day + 1, 0, 0, 1); // 00:00 UTC of next day
				return baseUTC - offset(baseUTC); // shift back to local midnight in UTC
			};

			const out = [];

			for (const ev of events) {
				let start = Date.parse(ev.time);
				const end = Date.parse(ev.end);

				while (start < end) {
					const sliceEnd = Math.min(end, nextMidnight(start) - 1); // 23:59:59.999 local
					out.push({
						...ev,
						time: new Date(start).toISOString(),
						end: new Date(sliceEnd).toISOString()
					});
					start = sliceEnd + 1; // continue from the next ms
				}
			}
			return out;
		}

		if (logPath === 'process') {
			// Convert process entries to the expected format
			return consolidateProcessEntries(e);
		} else {
			// If the time goes across days, split the entry into multiple entries
			e = e
				.flatMap((entry) => {
					if (!entry.end) return [entry]; // If there's no end time, return the entry as is

					const start = new Date(entry.time);
					const end = entry.end ? new Date(entry.end) : new Date(start);
					if (start.getDate() !== end.getDate()) {
						let entries = splitByDay([entry]);
						console.log(entries);

						return entries;
					} else {
						// If the entry is within the same day, return it as is
						return [
							{
								...entry,
								time: start.toISOString(),
								end: end.toISOString()
							}
						];
					}
				})
				.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
		}

		return e;
	}

	let processEntries = $state([]);


	function consolidateProcessEntries(entries) {
		function key(entry) {
			return `${entry.pid}-${new Date(entry.started).getTime()}-${new Date(entry.time).getDay()}`;
		}

		const consolidated = {};
		for (const e of entries) {
			let lastEntry = consolidated[key(e)];
			if (lastEntry) {
				// If the last entry has the same PID, update it
				lastEntry.timestamps.push(new Date(e.time));
				lastEntry.cpu.push(e.cpu);
				lastEntry.memory.push(e.memory);
				lastEntry.end = new Date(e.time);
			} else {
				// Otherwise, create a new entry
				consolidated[key(e)] = {
					pid: e.pid,
					name: e.name,
					timestamps: [new Date(e.time)],
					cpu: [e.cpu],
					memory: [e.memory],
					start: new Date(e.time),
					end: new Date(e.time)
				};
			}
		}
		return Object.values(consolidated);
	}

	let startDate = $state(setStartDateToMonday(new Date()));

	// Set the start date to the Monday of the current week
	function setStartDateToMonday(date) {
		const day = date.getDay();
		// Calculate how many days to subtract to get to Monday (0 for Monday, 1 for Tuesday, ..., 6 for Sunday)
		const diff = (day + 6) % 7;
		let newDate = new Date(date);
		newDate.setDate(date.getDate() - diff);
		newDate.setHours(0, 0, 0, 0);
		return newDate;
	}

	function changeWeek(offset) {
		const newDate = new Date(startDate);
		newDate.setDate(newDate.getDate() + offset * 7);
		startDate = setStartDateToMonday(newDate);
	}

	let filteredEntries = $derived(
		entries?.filter((entry) => {
			const entryDate = new Date(entry.time);
			return (
				entryDate >= startDate &&
				entryDate <= new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
			);
		})
	);

	let filteredProcessEntries = $derived(
		processEntries?.filter((entry) => {
			return (
				entry.end >= startDate &&
				entry.start <= new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000)
			);
		})
	);

	$effect(() => {
		// Ensure the start date is always a Monday
		let endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
		load('focused', startDate, endDate).then((data) => {
			entries = data;
		});
		load('process', startDate, endDate).then((data) => {
			processEntries = data;
		});
	});
</script>

<svelte:head>
	<title>Time Log Viewer - Week of {startDate.toLocaleDateString()}</title>
</svelte:head>

<div class="container">
	<h1>Time log viewer</h1>
	<div class="week-nav">
		<button aria-label="Previous week" onclick={() => changeWeek(-1)}>&larr;</button>
		<span class="week-label"
			>{startDate.toLocaleDateString()} - {new Date(
				startDate.getTime() + 6 * 24 * 60 * 60 * 1000
			).toLocaleDateString()}</span
		>
		<button aria-label="Next week" onclick={() => changeWeek(1)}>&rarr;</button>
	</div>
	<CalendarView
		entries={filteredEntries}
		processEntries={filteredProcessEntries}
		{startDate}
		days={7}
		hourStart={7}
		hourEnd={22}
	/>
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.container {
		flex-grow: 1;

		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: center;

		overflow: hidden;
	}

	.week-nav {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.week-nav button {
		font-size: 1.5rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25em 0.75em;
		border-radius: 0.25em;
		transition: background 0.2s;
	}
	.week-nav button:hover {
		background: #eee;
	}
	.week-label {
		font-weight: bold;
		font-size: 1.1rem;
	}
	h1 {
		text-align: left;
		margin-bottom: 20px;
	}
</style>
