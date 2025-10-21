<script>
	import CalendarView from '$lib/components/CalendarView.svelte';

	import {
		consolidateProcessEntries,
		convertFocusedEntries,
		convertSystemEntries
	} from '$lib/CalendarEntries.js';
	import { onMount } from 'svelte';

	/**
	 * @typedef {import('$lib/CalendarEntries').FocusedEntry} FocusedEntry
	 * @typedef {import('$lib/CalendarEntries').ProcessEntry} ProcessEntry
	 * @typedef {import('$lib/CalendarEntries').SystemEntry} SystemEntry
	 */

	// Load the csv events from /logs
	async function load(logPath, startDate, endDate, timeUnit = 30) {
		const response = await fetch(
			`/logs/${logPath}?start=${startDate.getTime()}&end=${endDate.getTime()}&unit=${timeUnit}`
		);
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
			end: rows[i + 1]?.time // Use the next entry's time as the end time, or undefined if it's the last entry
		}));

		const DAY = 86_400_000; // ms in a day

		switch (logPath) {
			case 'focused':
				return convertFocusedEntries(e);
			case 'system':
				return convertSystemEntries(e);
			case 'process':
				return consolidateProcessEntries(e);
		}

		return e;
	}

	let focusedEntries = $state([]);
	let processEntries = $state([]);
	let systemEntries = $state([]);

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

	function offsetWeek(offset) {
		const newDate = new Date(startDate);
		newDate.setDate(newDate.getDate() + offset * 7);
		startDate = setStartDateToMonday(newDate);

		focusedEntries = [];
		processEntries = [];
		systemEntries = [];
	}

	let endDate = $derived(new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000));

	// If the user didn't focus the tab for a while, reload the data when they switch back
	let lastFocused = $state(Date.now());
	const focusThreshold = 60 * 1000; // 1 minute
	onMount(() => {
		lastFocused = Date.now();

		function handleFocus() {
			if (Date.now() - lastFocused > focusThreshold) {
				loadData(startDate, endDate);
			}
			lastFocused = Date.now();
		}

		window.addEventListener('focus', handleFocus);

		return () => {
			window.removeEventListener('focus', handleFocus);
		};
	});

	/**
	 * Load data for the specified time range.
	 * @param {Date} start
	 * @param {Date} end
	 */
	function loadData(start, end) {
		function rangeNotValid() {
			return start !== startDate || end !== endDate;
		}

		load('focused', start, end).then((data) => {
			if (rangeNotValid()) return;
			focusedEntries = data;
		});
		load('process', start, end).then((data) => {
			if (rangeNotValid()) return;
			processEntries = data;
		});
		load('system', start, end).then((data) => {
			if (rangeNotValid()) return;
			systemEntries = data;
		});
	}

	$effect(() => {
		loadData(startDate, endDate);
	});

	const formatDate = (date) => {
		return date.toLocaleDateString('en-SG', {
			month: 'short',
			day: 'numeric'
		});
	};
</script>

<svelte:head>
	<title>Week of {formatDate(startDate)} - Time Log Viewer</title>
</svelte:head>

<div class="container">
	<h1>Time log viewer</h1>
	<div class="week-nav">
		<button aria-label="Today" onclick={() => (startDate = setStartDateToMonday(new Date()))}
			>Today</button
		>
		<button aria-label="Previous week" onclick={() => offsetWeek(-1)}>&larr;</button>
		<span class="week-label">{formatDate(startDate)} - {formatDate(endDate)}</span>
		<button aria-label="Next week" onclick={() => offsetWeek(1)}>&rarr;</button>
	</div>
	<CalendarView
		entries={focusedEntries}
		{processEntries}
		{systemEntries}
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
		transition: 0.2s;
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
