<script>
	import CalendarView from '$lib/components/CalendarView.svelte';

	import {
		consolidateProcessEntries,
		convertFocusedEntries,
		convertSystemEntries
	} from '$lib/CalendarEntries.js';
	import { onMount } from 'svelte';
	import TimeRangeSelector from '$lib/components/TimeRangeSelector.svelte';
	import { formatDate, setStartDateToMonday } from '$lib/DateHelpers';

	/**
	 * @typedef {import('$lib/CalendarEntries').FocusedEntry} FocusedEntry
	 * @typedef {import('$lib/CalendarEntries').ProcessEntry} ProcessEntry
	 * @typedef {import('$lib/CalendarEntries').SystemEntry} SystemEntry
	 */

	// Load the csv events from /logs
	async function load(logPath, startDate, endDate, timeUnit = 30) {
		try {
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
		} catch(error) {
			console.error('Error loading log data:', error);
			return [];
		}
	}

	let focusedEntries = $state([]);
	let processEntries = $state([]);
	let systemEntries = $state([]);

	let startDate = $state(setStartDateToMonday(new Date()));
	let endDate = $state();

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

	function onTimeRangeChange() {
		focusedEntries = [];
		processEntries = [];
		systemEntries = [];
	}
</script>

<svelte:head>
	<title>Week of {formatDate(startDate)} - Time Log Viewer</title>
</svelte:head>

<div class="container">
	<h1>Time log viewer</h1>
	<TimeRangeSelector bind:startDate bind:endDate onchange={onTimeRangeChange} />
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

	h1 {
		text-align: left;
		margin-bottom: 20px;
	}
</style>
