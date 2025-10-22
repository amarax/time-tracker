<script>
	import { onMount, onDestroy } from 'svelte';
	import * as d3 from 'd3';
	import {
		currentMidnight,
		getFocusedBlocks,
		getProcessBlocks,
		getSystemBlocks,

		isHighlighted

	} from '$lib/CalendarEntries';
	import CalendarViewTooltip from './CalendarViewTooltip.svelte';

	/**
	 * @typedef {import('$lib/CalendarEntries').FocusedEntry} FocusedEntry
	 * @typedef {import('$lib/CalendarEntries').ProcessEntryBlock} ProcessEntryBlock
	 * @typedef {import('$lib/CalendarEntries').SystemEntry} SystemEntry
	 * @typedef {import('$lib/CalendarEntries').CalendarBlock} CalendarBlock
	 */

	/**
	 * @typedef {Object} Props
	 * @property {Array<FocusedEntry>} [entries] List of focused entries to display
	 * @property {Array<ProcessEntryBlock>} [processEntries] List of process entries to display
	 * @property {Array<SystemEntry>} [systemEntries] List of system entries to display
	 * @property {Date|null} [startDate] The start date of the calendar view
	 * @property {number} [days] Number of days to display
	 * @property {number} [hourStart] Start hour of the day (0-24)
	 * @property {number} [hourEnd] End hour of the day (0-24)
	 * @property {string[]} [highlightTerms] Text to highlight in entries
	*/

	/** @type {Props} */
	const {
		entries = [],
		processEntries = [],
		systemEntries = [],
		startDate = null,
		days = 7,
		hourStart = 0,
		hourEnd = 24,
		highlightTerms
	} = $props();

	let dateRange = $derived.by(() => {
		const base = startDate ? new Date(startDate) : new Date();
		base.setHours(0, 0, 0, 0);
		return Array.from({ length: days }, (_, i) => {
			const d = new Date(base);
			d.setDate(base.getDate() + i);
			return d;
		});
	});

	const dayms = 24 * 60 * 60 * 1000;
	const hourms = 60 * 60 * 1000;
	const timeZoneOffset = new Date().getTimezoneOffset() * 60 * 1000;

	let displayedHourStart = $state(hourStart * hourms + timeZoneOffset);
	let displayedHourEnd = $state(hourEnd * hourms + timeZoneOffset);

	// Calculate hours as the hour of day for each hour in the range
	let hours = $derived.by(() => {
		let hours = [];
		for (let h = displayedHourStart; h <= displayedHourEnd; h += hourms) {
			// hourStart + h in ms, modulo dayms, gives hour of day
			const ms = Math.ceil(h / hourms) * hourms;
			hours.push(ms);
		}
		return hours;
	});

	/**
	 * Handles scroll events to zoom in/out on the calendar view.
	 * @param {WheelEvent} event - The wheel event.
	 */
	function handleScroll(event) {
		const delta = event.deltaY;
		const centerY = event.clientY - (container?.getBoundingClientRect().top ?? 0);
		const centerHour = timeAxis.invert(centerY + timeAxis(displayedHourStart));

		// Scale factor: zoom in/out
		let scaleFactor = 1 + delta / 500; // Prevent negative or zero range

		// Enforce minimum zoom: at least 1 hour
		const minRange = hourms; // 1 hour in ms
		if ((displayedHourEnd - displayedHourStart) * scaleFactor < minRange) {
			scaleFactor = minRange / (displayedHourEnd - displayedHourStart);
		}

		let newStart = centerHour + (displayedHourStart - centerHour) * scaleFactor;
		let newEnd = centerHour + (displayedHourEnd - centerHour) * scaleFactor;

		displayedHourStart = Math.max(0 + timeZoneOffset, newStart);
		displayedHourEnd = Math.min(24 * hourms + timeZoneOffset, newEnd);
	}

	// SVG dimensions (responsive)

	/** @type {HTMLElement?} */
	let container;

	let svgWidth = $state(100);
	let svgHeight = $state(100);
	const cellWidth = 100;
	const cellHeight = 40;
	const labelWidth = 60;
	const labelHeight = 24;

	function updateSvgSize() {
		if (container) {
			svgWidth = container.clientWidth;
			svgHeight = container.clientHeight || labelHeight + hours.length * cellHeight;
		}
	}

	/** @type {ResizeObserver?} */
	let resizeObserver;
	onMount(() => {
		updateSvgSize();
		resizeObserver = new ResizeObserver(() => {
			updateSvgSize();
		});
		if (container) resizeObserver.observe(container);
	});
	onDestroy(() => {
		if (resizeObserver && container) resizeObserver.unobserve(container);
	});

	/**
	 * @param {Date} date
	 * @returns {number}
	 */
	function getDayIndex(date) {
		return (date.getDay() - 1 + 7) % 7;
	}

	function stringToColor(str) {
		// Simple heuristic to generate a color based on the string
		const hash = Array.from(str).reduce((acc, char) => acc + char.charCodeAt(0), 0);
		const hue = hash % 360;
		return `hsl(${hue}, 70%, 70%)`;
	}

	let displayedTimeRange = $derived(displayedHourEnd - displayedHourStart);

	// D3 Y-axis setup
	let timeAxis = $derived.by(() => {
		return d3
			.scaleLinear()
			.domain([timeZoneOffset, displayedTimeRange + timeZoneOffset])
			.range([labelHeight, svgHeight - labelHeight]);
	});

	/** @type {number[]} */
	const allHours = [];
	for (let h = 0; h <= 24 * hourms; h += hourms) {
		allHours.push(h + timeZoneOffset);
	}

	let hourTicks = $derived.by(() => {
		return allHours.map((h) => {
			let date = new Date();
			date.setHours((h - timeZoneOffset) / hourms, 0, 0, 0);
			return {
				value: h,
				label: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
			};
		});
	});

	let isMiddlePanning = false;
	let panStart = { clientY: 0, timeAxisValue: 0 };

	/**
	 * Handles mouse down events to start panning the calendar view.
	 * @param {MouseEvent} event - The mouse event.
	 */
	function handleMouseDown(event) {
		if (event.button === 1) {
			// Middle mouse button
			isMiddlePanning = true;

			panStart.clientY = event.clientY;
			panStart.timeAxisValue = timeAxis.invert(
				event.clientY - container.getBoundingClientRect().top
			);

			window.addEventListener('mousemove', handleMouseMove);
			window.addEventListener('mouseup', handleMouseUp);
			event.preventDefault();
		}
	}

	/**
	 * Handles mouse move events to pan the calendar view.
	 * @param {MouseEvent} event - The mouse event.
	 */
	function handleMouseMove(event) {
		if (!isMiddlePanning) return;

		const deltaY = event.clientY - panStart.clientY;
		panStart.clientY = event.clientY;

		// Calculate how many ms to pan based on svgHeight
		const range = displayedHourEnd - displayedHourStart;
		const msPerPixel = (displayedHourEnd - displayedHourStart) / (svgHeight - 2 * labelHeight);
		const msDelta = -deltaY * msPerPixel;

		if (displayedHourStart + msDelta < 0 + timeZoneOffset) {
			displayedHourStart = 0 + timeZoneOffset;
			displayedHourEnd = displayedHourStart + range; // Keep the range the same
			return;
		}
		if (displayedHourEnd + msDelta > 24 * hourms + timeZoneOffset) {
			displayedHourEnd = 24 * hourms + timeZoneOffset;
			displayedHourStart = displayedHourEnd - range; // Keep the range the same
			return;
		}

		displayedHourStart += msDelta;
		displayedHourEnd += msDelta;
	}

	/**
	 * Handles mouse up events to stop panning.
	 * @param {MouseEvent} event - The mouse event.
	 */
	function handleMouseUp(event) {
		if (event.button === 1 && isMiddlePanning) {
			isMiddlePanning = false;
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		}
	}

	/**
	 * @typedef {Object} Tooltip
	 * @property {true} visible - Whether the tooltip is visible
	 * @property {number} x - The x position of the tooltip
	 * @property {string} align - The alignment of the tooltip ('left' or 'right')
	 * @property {number} y - The y position of the tooltip
	 * @property {any} [content] - The content of the tooltip
	*/

	/**
	 * @typedef {Object} NoTooltip
	 * @property {false} visible - Whether the tooltip is visible
	 */

	/**
	 * @type {Tooltip|NoTooltip}
	 */
	let tooltip = $state({ visible: false, x: 0, align: 'left', y: 0 });

	/**
	 *
	 * @param {number} mouseX
	 * @param {number} mouseY
	 * @returns {Date|null} The timestamp at the mouse position, or null if outside the calendar bounds.
	 */
	function getHoveredTimestamp(mouseX, mouseY) {
		if (!container) return null;
		const rect = container.getBoundingClientRect();
		const svgX = mouseX - rect.left;
		const svgY = mouseY - rect.top;

		// Find day index
		const dayWidth = (svgWidth - labelWidth) / dateRange.length;
		let dayIdx = Math.floor((svgX - labelWidth) / dayWidth);
		if (dayIdx < 0) dayIdx = 0;
		if (dayIdx >= dateRange.length) dayIdx = dateRange.length - 1;

		// Find ms-of-day from y
		let msOfDay = timeAxis.invert(svgY + timeAxis(displayedHourStart));
		return new Date(dateRange[dayIdx].getTime() + msOfDay - timeZoneOffset);
	}

	let toggleHighlight = $state(true);
	let _highlightTerms = $derived(toggleHighlight ? highlightTerms : undefined);

	onMount(()=>{
		// Toggle highlight when CTRL is held down
		function handleKeyDown(event) {
			if (event.key === 'Control') {
				toggleHighlight = false;
			}
		}
		function handleKeyUp(event) {
			if (event.key === 'Control') {
				toggleHighlight = true;
			}
		}
		window.addEventListener('keyup', handleKeyUp);
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	});

	/**
	 * Finds the closest entry to the mouse position.
	 * @param {number} mouseX - The x-coordinate of the mouse.
	 * @param {number} mouseY - The y-coordinate of the mouse.
	 * returns {FocusedEntry|HoveredProcessEntry|null} The closest entry or null if none found.
	 */
	function findClosestEntry(mouseX, mouseY) {
		if (!container) return null;
		// Convert mouseX, mouseY to day and ms-of-day
		const rect = container.getBoundingClientRect();
		const svgX = mouseX - rect.left;
		const svgY = mouseY - rect.top;
		// Find day index
		const dayWidth = (svgWidth - labelWidth) / dateRange.length;
		let dayIdx = Math.floor((svgX - labelWidth) / dayWidth);
		if (dayIdx < 0) dayIdx = 0;
		if (dayIdx >= dateRange.length) dayIdx = dateRange.length - 1;

		// Find ms-of-day from y
		let msOfDay = timeAxis.invert(svgY);
		// Find closest entry in that day
		let closest = null;

		let hoverTimeStamp = getHoveredTimestamp(mouseX, mouseY);
		if (!hoverTimeStamp) return null;

		const dayXStart = labelWidth + dayIdx * dayWidth;

		const dayXMid = dayXStart + dayWidth / 2;
		// If mouseX is outside the day range, return null
		if (svgX <= dayXMid) {
			for (let entry of entries.filter(e=>isHighlighted(e, _highlightTerms)!==false)) {
				const start = new Date(entry.start);
				const end = entry.end ? new Date(entry.end) : new Date();
				if (hoverTimeStamp < start || hoverTimeStamp > end) continue;

				closest = entry;
			}
			return closest;
		} else {
			const dayXEnd = dayXStart + dayWidth;

			const processNameIndex = Math.floor(
				(processNameIndexLength * (svgX - dayXMid)) / (dayXEnd - dayXMid)
			);
			const uniqueProcessNames = new Set(Object.entries(processNameToIndex).filter(
				([, index]) => index === processNameIndex
			).map(([name]) => name));

			let entries = processEntries.filter(e=>isHighlighted(e, _highlightTerms)!==false);

			// Search process entries
			for (let entry of entries) {
				if (!uniqueProcessNames.has(getUniqueProcessName(entry))) continue;

				const start = entry.start;
				const end = entry.end;
				if (hoverTimeStamp < start || hoverTimeStamp > end) continue;

				/** @type { { time: Date | null, offset: number, index: number } } */
				let closest = {
					time: null,
					offset: Infinity,
					index: -1
				};
				let n = entry.timestamps.forEach((ts, i) => {
					let offset = Math.abs(ts.getTime() - hoverTimeStamp.getTime());
					if (offset < closest.offset) {
						closest.time = ts;
						closest.index = i;
						closest.offset = offset;
					}
				});

				let e = {
					...entry,
					time: closest.time,
					cpu: entry.cpu[closest.index],
					memory: entry.memory[closest.index]
				};

				return e;
			}
		}
		return null;
	}

	// Create a number formatter for CPU and memory
	const cpuFormatter = new Intl.NumberFormat(undefined, {
		style: 'decimal',
		maximumFractionDigits: 2,
		minimumFractionDigits: 0
	});
	// Format memory as bytes with appropriate units (e.g., KB, MB, GB)
	const memoryFormatter = (bytes) => {
		if (typeof bytes !== 'number') bytes = Number(bytes);
		if (isNaN(bytes)) return '';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let i = 0;
		while (bytes >= 1024 && i < units.length - 1) {
			bytes /= 1024;
			i++;
		}
		return `${bytes.toFixed(2)} ${units[i]}`;
	};

	/**
	 * Handles mouse move events to show tooltip with entry details.
	 * @param {MouseEvent} event - The mouse event.
	 */
	function handleMouseMoveTooltip(event) {
		const entry = findClosestEntry(event.clientX, event.clientY);

		// Get the hovered timestamp based on the mouse position
		const hoveredTimestamp = getHoveredTimestamp(event.clientX, event.clientY);

		let type = 'focused';
		if (entry && entry.cpu) {
			type = 'process';
		}

		let content = null;
		if (entry) {
			content = {
				title: entry.title ?? entry.name,
				subtitle:
					entry.process ||
					`${cpuFormatter.format(entry.cpu)}% CPU, ${memoryFormatter(entry.memory)} RAM`,
				time: entry.time || entry.start
			};
		}

		if (entry && hoveredTimestamp) {
			let dayIndex = getDayIndex(new Date(hoveredTimestamp));

			let x =
				(type == 'focused' ? dayIndex : 6 - dayIndex) *
					((svgWidth - labelWidth) / dateRange.length) +
				(type == 'focused' ? labelWidth : 0);
			tooltip = {
				visible: true,
				x,
				align: type == 'focused' ? 'left' : 'right',
				y: event.clientY + 12,
				content
			};
		} else {
			tooltip = { visible: false };
		}
	}

	function handleMouseLeaveTooltip() {
		tooltip = { visible: false, x: 0, y: 0, entry: null };
	}

	function handleMouseClick(event) {
		const entry = findClosestEntry(event.clientX, event.clientY);
		if (entry) {
			console.log('Clicked entry:', entry);
		}
	}

	let focusedRects = $derived(
		getFocusedBlocks(entries, dateRange)?.filter(
			(rect) =>
				rect.start.getTime() < dateRange[dateRange.length - 1].getTime() + dayms &&
				rect.end > dateRange[0]
		)
	);


	let dayWidth = $derived((svgWidth - labelWidth) / dateRange.length);

	/**
	 *
	 * @param {Date} date
	 * @return {number} The x-coordinate for the date in the calendar view.
	 */
	function dateToX(date) {
		const dayIndex = getDayIndex(date);
		return labelWidth + dayIndex * dayWidth;
	}

	/**
	 * Converts a date to a Y-coordinate based on the time axis.
	 * @param {Date} date - The date to convert.
	 * @return {number} The Y-coordinate for the date in the calendar view.
	 */
	function dateToY(date) {
		const dayStart = currentMidnight(date.getTime());
		return timeAxis(date.getTime() - dayStart);
	}

	/**
	 * Calculates the height of a rectangle based on its start and end times.
	 * @param {Date} start - The start time of the rectangle.
	 * @param {Date} end - The end time of the rectangle.
	 */
	function rectHeight(start, end) {
		const dayStart = currentMidnight(start.getTime());

		const startMs = start.getTime() - dayStart;
		const endMs = end.getTime() - dayStart;
		return Math.abs(timeAxis(endMs) - timeAxis(startMs));
	}

	let systemRects = $derived(
		getSystemBlocks(systemEntries).filter(
			(rect) =>
				rect.start.getTime() < dateRange[dateRange.length - 1].getTime() + dayms &&
				rect.end > dateRange[0]
		)
	);

	let processRects = $derived(
		getProcessBlocks(processEntries).filter(
			(rect) =>
				rect.start.getTime() < dateRange[dateRange.length - 1].getTime() + dayms &&
				rect.end > dateRange[0]
		)
	);



	/**
	 * @param {ProcessEntryBlock|undefined} entry
	 * @returns {string}
	 */
	function getUniqueProcessName(entry) {
		if (!entry) return "";
		return entry.name + "-" + entry.pid;
	}

	let processNameToIndex = $derived.by(() => {
		/**
		 * @type {Map<string, Array<[Date,Date]>>}
		 */
		const processIntervals = new Map();
		/** @type {Record<string, number>}*/
		const processNameToIndex = {};

		for (let rect of processRects) {
			let entry = /** @type {ProcessEntryBlock} */ (rect.entry);
			let groupIndex = 0;
			let group = `${entry.name}-${groupIndex}`;
			let processName = getUniqueProcessName(entry);

			/**
			 * Checks if a process entry can be placed in a specific group.
			 * @param {ProcessEntryBlock} entry
			 * @param {string} group
			 */
			function canPlaceInGroup(entry, group) {
				const intervals = processIntervals.get(group);
				if (!intervals) return true;

				for (let [start, end] of intervals) {
					if (
						(entry.start < end && entry.end > start) // Overlap
					) {
						return false;
					}
				}
				return true;
			}

			while (!canPlaceInGroup(entry, group)) {
				groupIndex++;
				group = `${entry.name}-${groupIndex}`;
			}

			if (!processIntervals.has(group)) {
				processIntervals.set(group, []);
			}
			processIntervals.get(group)?.push([entry.start, entry.end]);

			if (!(processName in processNameToIndex)) {
				processNameToIndex[processName] = [...processIntervals.keys()].indexOf(group);
			}
		}
		return processNameToIndex;
	});
	let processNameIndexLength = $derived(
		Math.max(...Object.values(processNameToIndex).map(index => index + 1), 0)
	);

	let processColWidth = $derived((dayWidth * 0.5) / processNameIndexLength);


	/**
	 * Converts a process name to an x-offset based on its index.
	 * @param {string} process - The process name.
	 * @returns {number} The x-offset for the process in the calendar view.
	 */
	function processToXOffset(process) {
		if (!processNameToIndex[process]) return 0; // If process not found, return 0 offset

		const index = processNameToIndex[process];
		return index * processColWidth;
	}

	const processGraphAreaPlot = d3
		.area()
		.x0(0)
		.x1((d) => (d.value / 100) * (processColWidth - 1) + 1)
		.y((d) => dateToY(d.timestamp))
		.defined((d) => !isNaN(d.value));

	let processGraphs = $derived(
		processRects.map((rect) => {
			if (!rect.entry || !rect.entry.timestamps || !rect.entry.cpu) return '';

			let startIndex, endIndex;
			for (let i = 0; i < rect.entry.timestamps.length; i++) {
				if (rect.entry.timestamps[i].getTime() >= rect.start.getTime()) {
					startIndex = i;
					break;
				}
			}
			for (let i = rect.entry.timestamps.length - 1; i >= startIndex; i--) {
				if (rect.entry.timestamps[i].getTime() <= rect.end.getTime()) {
					endIndex = i;
					break;
				}
			}
			if (startIndex === undefined || endIndex === undefined || startIndex > endIndex) {
				return '';
			}

			const timestamps = rect.entry.timestamps.slice(startIndex, endIndex + 1);
			const values = rect.entry.cpu.slice(startIndex, endIndex + 1);

			return processGraphAreaPlot(
				timestamps.map((timestamp, i) => {
					return { timestamp, value: values[i] };
				})
			);
		})
	);

	let timeNow = $state(new Date());

	onMount(() => {
		// Periodically update the current time while the window is focused
		const interval = setInterval(() => {
			if (document.hasFocus()) {
				timeNow = new Date();
			}
		}, 1000);
		return () => clearInterval(interval);
	});

	/**
	 * Determines the opacity of an entry based on whether it matches the highlight text.
	 * @param {CalendarBlock} rect - The entry to check.
	 * @returns {number} The opacity value (1 for match, 0.2 for no match).
	 */
	function highlightToOpacity(rect) {
		let match = isHighlighted(rect.entry, _highlightTerms);
		if (match === null) return 1; // No highlight set

		return match ? 1 : 0.2;
	}

</script>

<div bind:this={container} style="flex-grow:1; position:relative">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<svg
		style="width:100%;height:100%;"
		onwheel={handleScroll}
		onmousedown={handleMouseDown}
		onmousemove={handleMouseMoveTooltip}
		onmouseleave={handleMouseLeaveTooltip}
	>
		<g transform={`translate(0,${-timeAxis(displayedHourStart)})`}>
			<!-- Hour labels and grid -->
			<g class="calendar-grid">
				{#each hourTicks as h, i (h.value)}
					<g transform={`translate(0, ${timeAxis(h.value)})`}>
						<line x1={labelWidth} y1="0" x2={svgWidth} y2="0" stroke="#ddd" stroke-width="1" />
						<text x={labelWidth - 5} y="4" text-anchor="end" font-size="12" fill="#555">
							{h.label}
						</text>
					</g>
				{/each}
			</g>

			<!-- Process Entries -->
			<g class="process-entries">
				{#each processRects as rect, i}
					<g
						transform={`translate(${dateToX(rect.start) + dayWidth / 2 + processToXOffset(getUniqueProcessName(rect.entry))}, ${dateToY(rect.start)})`}
						opacity={highlightToOpacity(rect)}
					>
						<rect
							x={2}
							y={2}
							width={processColWidth - 4}
							height={rectHeight(rect.start, rect.end)}
							fill={stringToColor(rect.entry?.name)}
							fill-opacity="0.3"
						/>
						<path
							d={processGraphs[i]}
							fill={stringToColor(rect.entry?.name)}
							transform={`translate(2, ${-dateToY(rect.start)})`}
						/>
						{#if rect.label && rectHeight(rect.start, rect.end) > 20}
							<text
								x={2}
								y={2}
								dy={8}
								text-anchor="start"
								font-size="8"
								fill="#222"
								pointer-events="none"
							>
								{rect.label.slice(
									0,
									processColWidth / 8
								)}{#if rect.label.length > processColWidth / 8}...{/if}
							</text>
						{/if}
					</g>
				{/each}
			</g>

			<!-- Entries -->
			<g class="entries">
				{#each focusedRects as rect}
					<g transform={`translate(${dateToX(rect.start)}, ${dateToY(rect.start)})`} opacity={highlightToOpacity(rect)}>
						<rect
							x={2}
							y={2}
							width={dayWidth / 2 - 4}
							height={rectHeight(rect.start, rect.end)}
							fill={stringToColor(rect.entry?.process || rect.entry?.pid)}
							fill-opacity="0.85"
						/>
						{#if rect.label && rectHeight(rect.start, rect.end) > 20}
							<text
								x={2}
								y={2}
								dy={8}
								text-anchor="start"
								font-size="8"
								fill="#222"
								pointer-events="none"
							>
								{rect.label.slice(0, dayWidth / 8)}{#if rect.label.length > dayWidth / 8}...{/if}
							</text>
						{/if}
					</g>
				{/each}
			</g>

			<g class="system-entries">
				{#each systemRects as rect}
					<rect
						class:sleep={rect.label === 'Sleep'}
						width={dayWidth}
						height={rectHeight(rect.start, rect.end)}
						transform={`translate(${dateToX(rect.start)}, ${dateToY(rect.start)})`}
					/>
				{/each}
			</g>

			<!-- Current Time Marker -->
			{#if dateRange[0] <= timeNow && timeNow <= dateRange[dateRange.length - 1]}
				<g
					class="current-time-marker"
					transform={`translate(${dateToX(timeNow)}, ${dateToY(timeNow)})`}
				>
					<circle r="4" />
					<line x1={0} y1={0} x2={dayWidth} y2={0} />
				</g>
			{/if}
		</g>

		<!-- Day labels -->
		<g>
			<rect x="0" y="0" width={labelWidth} height={labelHeight} fill="#f8f8f8" />
			{#each dateRange as d, i}
				<rect
					x={labelWidth + i * ((svgWidth - labelWidth) / dateRange.length)}
					y="0"
					width={(svgWidth - labelWidth) / dateRange.length}
					height={labelHeight}
					fill="#f8f8f8"
					stroke="#ddd"
				/>
				<text
					x={labelWidth +
						i * ((svgWidth - labelWidth) / dateRange.length) +
						(svgWidth - labelWidth) / dateRange.length / 2}
					y={labelHeight / 2 + 7}
					text-anchor="middle"
					font-size="14"
					fill="#333"
				>
					{d.toLocaleDateString('en-SG', { weekday: 'short', month: 'numeric', day: 'numeric' })}
				</text>
			{/each}
		</g>
	</svg>
	{#if tooltip.visible && tooltip.content}
		<CalendarViewTooltip {tooltip} />
	{/if}
</div>

<style>
	/* Colour for the elements of the calendar */
	@property --calendar-fg-color {
		syntax: '<color>';
		inherits: false;
		initial-value: #ccc;
	}

	svg {
		width: 100%;
		height: 100%;
		background-color: var(--input-bg);
	}

	text {
		font-family: Roboto, sans-serif;
		user-select: none;
	}

	.calendar-grid text {
		fill: var(--calendar-fg-color);
	}

	.system-entries rect {
		fill: rgba(194, 194, 194, 0.4);

		&.sleep {
			fill: rgba(194, 194, 194, 0.8);
		}
	}

	.current-time-marker {
		--current-time-marker-color: rgb(231, 40, 40);

		circle {
			fill: var(--current-time-marker-color);
		}

		line {
			stroke: var(--current-time-marker-color);
			stroke-width: 1;
		}
	}
</style>
