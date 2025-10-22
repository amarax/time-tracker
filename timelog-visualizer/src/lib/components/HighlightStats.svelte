<script>
	import { isHighlighted } from '$lib/CalendarEntries';
	import { active, formatPrefix } from 'd3';

	/**
	 * @typedef {import('$lib/CalendarEntries').FocusedEntry} FocusedEntry
	 * @typedef {import('$lib/CalendarEntries').SystemEntry} SystemEntry
	 */

	/**
	 * @typedef {Object} Props
	 * @property {string[]} [highlightTerms] Text to highlight in entries
	 * @property {{system:SystemEntry[], focused:FocusedEntry[]}} data List of entries to analyze
	 * @property {[Date,Date]} timeRange Time range of the data
	 */

	/** @type {Props} */
	let { highlightTerms, data, timeRange } = $props();

	let timeRangeForStats = $derived([
		timeRange[0].getTime(),
		Math.min(timeRange[1].getTime(), Date.now())
	]);

	let sleepAndIdleIntervals = $derived.by(() => {
		if (!data || !timeRange) return [];
		if (!timeRange[0] || !timeRange[1]) return [];

		/**
		 * @type {{start:number,end:number}[]}
		 */
		let intervals = [];
		for (const entry of data.system.filter(
			(entry) => entry.isIdle || entry.sleepState === 'sleep_start'
		)) {
			let start = Math.max(entry.start.getTime(), timeRangeForStats[0]);
			let end = Math.min(entry.end?.getTime() ?? timeRangeForStats[1], timeRangeForStats[1]);

			if (start > timeRangeForStats[1] || end < timeRangeForStats[0]) {
				continue;
			}

			intervals.push({ start, end });
		}

		return intervals;
	});

	/** @type {number} Active time in milliseconds */
	let activeTime = $derived.by(() => {
		if (!data || !timeRange) return 0;
		if (!timeRange[0] || !timeRange[1]) return 0;

		let total = timeRangeForStats[1] - timeRangeForStats[0];
		total -= sleepAndIdleIntervals.reduce(
			(sum, interval) => sum + (interval.end - interval.start),
			0
		);

		return total;
	});

	/** @type {number} Highlighted time in milliseconds */
	let highlightedTime = $derived.by(() => {
		if (!data || !timeRange || !highlightTerms || highlightTerms.length === 0) return 0;
		if (!timeRange[0] || !timeRange[1]) return 0;

		/**
		 * @type {{start:number,end:number}[]}
		 */
		let highlightedIntervals = [];

		for (const entry of data.focused) {
			let start = Math.max(entry.start.getTime(), timeRangeForStats[0]);
			let end = Math.min(entry.end?.getTime() ?? timeRangeForStats[1], timeRangeForStats[1]);

			if (start > timeRangeForStats[1] || end < timeRangeForStats[0]) {
				continue;
			}

			if (!isHighlighted(entry, highlightTerms)) continue;

			// If we intersect any sleep or idle intervals, remove those intervals from the highlighted interval
			let intervalsToAdd = [{ start, end }];
			for (const sleepInterval of sleepAndIdleIntervals) {
				intervalsToAdd = intervalsToAdd.flatMap((interval) => {
					// No intersection
					if (interval.end <= sleepInterval.start || interval.start >= sleepInterval.end) {
						return [interval];
					}

					let result = [];
					// Before sleep interval
					if (interval.start < sleepInterval.start) {
						result.push({ start: interval.start, end: sleepInterval.start });
					}
					// After sleep interval
					if (interval.end > sleepInterval.end) {
						result.push({ start: sleepInterval.end, end: interval.end });
					}
					return result;
				});
			}
			highlightedIntervals.push(...intervalsToAdd);
		}

		return highlightedIntervals.reduce((sum, interval) => sum + (interval.end - interval.start), 0);
	});

	/**
	 * Formats a time duration in milliseconds to a human-readable string.
	 * @param {number} ms
	 * @returns {string}
	 */
	function formatTime(ms) {
		let totalSeconds = Math.floor(ms / 1000);
		let hours = Math.floor(totalSeconds / 3600);
		let minutes = Math.floor((totalSeconds % 3600) / 60);
		let seconds = totalSeconds % 60;

		return `${hours}h ${minutes}m ${seconds}s`;
	}
</script>

<div class="highlight-stats">
	{#if data.system.length}
		<div class="active-time-bar">
			{#if highlightTerms}
				<div class="highlighted-time" style="width: {(highlightedTime / activeTime) * 100}%;">
					<span class="label">{formatTime(highlightedTime)}</span>
				</div>
			{/if}
		</div>
		<span class="label">{formatTime(activeTime)}</span>
	{/if}
</div>

<style>
	.highlight-stats {
		font-family: 'Roboto', sans-serif;

		flex-grow: 1;

		display: flex;
		flex-flow: row nowrap;
	}

	.active-time-bar {
		flex-grow: 1;

		margin-right: 6px;
		background-color: #eee;
		border-radius: 4px;

		.highlighted-time {
			height: 100%;
			background-color: #90ee90;
			border-radius: 4px;

            vertical-align: middle;
            text-align: right;

            transition: width 0.1s ease-in-out;

            .label {
                margin-right: 0.2em;
                vertical-align: middle;
            }
		}
	}

	.label {
		margin: auto 0;
	}
</style>
