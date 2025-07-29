<script>
	import { onMount, onDestroy } from 'svelte';
	import * as d3 from 'd3';
	import { get } from 'svelte/store';
	import { getFocusedBlocks } from '$lib/CalendarEntries';
	/**
	 * @typedef {import('$lib/CalendarEntries').FocusedEntry} FocusedEntry
	 * @typedef {import('$lib/CalendarEntries').ProcessEntryBlock} ProcessEntryBlock
	 *
	 */

	/**
	 * CalendarView component props.
	 * @property {Array<Entry>} entries - Array of time log entries to display in the calendar.
	 * @property {Array<ProcessEntryBlock>} processEntries - Array of process entries to display in the calendar.
	 * @property {Date|null} startDate - The starting date for the calendar view. If null, defaults to current date.
	 * @property {number} days - Number of days to display in the calendar view (default: 7).
	 * @property {number} hourStart - The starting hour of the day to display (default: 0).
	 * @property {number} hourEnd - The ending hour of the day to display (default: 24).
	 */
	const {
		entries = [],
		processEntries = [],
		startDate = null,
		days = 7,
		hourStart = 0,
		hourEnd = 24
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
		const centerY = event.clientY - container.getBoundingClientRect().top;
		const centerHour = timeAxis.invert(centerY);

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

	let processNameToIndex = $derived.by(() => {
		// Group the processes by name
		let processNames = new Set();
		for (let entry of processEntries) {
			if (entry.name) {
				processNames.add(entry.name);
			}
		}

		// Map each set to an index
		/** @type {Record<string, number>}*/
		const processNameToIndex = {};
		let index = 0;
		for (let name of processNames) {
			processNameToIndex[name] = index++;
		}
		return processNameToIndex;
	});

	function getProcessRects() {
		/** @type {{x:number, y:number, width:number, height:number, label?:string, color?:string, entry:ProcessEntry, cpuGraph:string}[]} */
		const rects = [];
		for (let i = 0; i < processEntries.length; i++) {
			const entry = processEntries[i];
			const start = entry.start;
			const end = entry.end;

			// If the times are out of bounds for displayed hours, skip
			if (
				end.getTime() % dayms < displayedHourStart ||
				start.getTime() % dayms > displayedHourEnd
			) {
				continue;
			}

			const dayIndex = getDayIndex(start);

			// Calculate rectangle position and size
			const colWidth = (0.5 * (svgWidth - labelWidth)) / dateRange.length;

			const x =
				labelWidth +
				(dayIndex + 0.5) * ((svgWidth - labelWidth) / dateRange.length) +
				(colWidth / Object.values(processNameToIndex).length) * processNameToIndex[entry.name];
			const y = timeAxis(start.getTime() % dayms);
			const width = colWidth / Object.values(processNameToIndex).length - 4;
			const height = Math.abs(timeAxis(end.getTime() % dayms) - timeAxis(start.getTime() % dayms));

			let secondsBetween = end.getTime() - start.getTime();
			secondsBetween /= 1000;

			// Aggregate the cpu usage into buckets based on the height of the rectangle
			let cpuBuckets = d3
				.bin()
				.value((d, i) => new Date(entry.timestamps[i]).getTime() % dayms)
				.domain([start.getTime() % dayms, end.getTime() % dayms])
				.thresholds(
					Math.ceil(Math.min(height / 2, secondsBetween / 2, (entry.cpu?.length ?? 0) / 2))
				)(entry.cpu)
				.map((bucket) => ({ mean: d3.mean(bucket), x0: bucket.x0, x1: bucket.x1 }));

			let area = d3
				.area()
				.y((d) => timeAxis((d.x0 + d.x1) / 2))
				.x0(0)
				.x1((d) => (d.mean * width) / 100)
				.defined((d) => !isNaN(d.mean));

			rects.push({
				x,
				y,
				width,
				height,
				label: entry.name || '',
				color: stringToColor(entry.name),
				entry,

				cpuGraph: area(cpuBuckets)
			});
		}

		return rects;
	}

	// D3 Y-axis setup
	let timeAxis = $derived.by(() => {
		return d3
			.scaleLinear()
			.domain([displayedHourStart, displayedHourEnd])
			.range([labelHeight, svgHeight - labelHeight]);
	});

	let hourTicks = $derived.by(() => {
		return hours.map((h) => {
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

	// Tooltip state
	let tooltip = $state({ visible: false, x: 0, align: 'left', y: 0, entry: null });

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
		let msOfDay = timeAxis.invert(svgY);
		return new Date(dateRange[dayIdx].getTime() + msOfDay - timeZoneOffset);
	}

	/**
	 * Finds the closest entry to the mouse position.
	 * @param {number} mouseX - The x-coordinate of the mouse.
	 * @param {number} mouseY - The y-coordinate of the mouse.
	 * @returns {Entry|ProcessEntry|null} The closest entry or null if none found.
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
			for (let entry of entries) {
				const start = new Date(entry.start);
				const end = entry.end ? new Date(entry.end) : new Date();
				if (hoverTimeStamp < start || hoverTimeStamp > end) continue;

				closest = entry;
			}
			return closest;
		} else {
			const dayXEnd = dayXStart + dayWidth;

			const processNameIndex = Math.floor(
				(Object.values(processNameToIndex).length * (svgX - dayXMid)) / (dayXEnd - dayXMid)
			);
			const processName = Object.entries(processNameToIndex).find(
				([name, index]) => index === processNameIndex
			)?.[0];

			// Search process entries
			for (let entry of processEntries) {
				if (entry.name !== processName) continue;

				const start = entry.start;
				const end = entry.end;
				if (hoverTimeStamp < start || hoverTimeStamp > end) continue;

				let n = entry.timestamps.findIndex((ts) => {
					const tsMs = new Date(ts).getTime() % dayms;
					return tsMs >= msOfDay;
				});

				let e = { ...entry, time: entry.timestamps[n], cpu: entry.cpu[n], memory: entry.memory[n] };

				return e;
			}
		}
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
				time: entry.time || entry.start,
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
			tooltip = { visible: false, x: 0, y: 0, content };
		}
	}

	function handleMouseLeaveTooltip() {
		tooltip = { visible: false, x: 0, y: 0, entry: null };
	}

	let focusedRects = $derived(getFocusedBlocks(entries, timeAxis, svgWidth, labelWidth, dateRange));
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
		<g transform={`translate(${labelWidth},0)`}></g>
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
					{d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })}
				</text>
			{/each}
		</g>

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
			{#each getProcessRects() as rect}
				{#if rect.height > 1}
					<rect
						x={rect.x + 2}
						y={rect.y + 2}
						width={rect.width}
						height={rect.height}
						fill={rect.color || '#ffcc80'}
						fill-opacity="0.3"
					/>
					<path
						d={rect.cpuGraph}
						fill={rect.color || '#ff9800'}
						transform={`translate(${rect.x + 2}, 0)`}
					/>
					{#if rect.label && rect.height > 20}
						<text
							x={rect.x + 2}
							y={rect.y + 2}
							dy={8}
							text-anchor="start"
							font-size="8"
							fill="#222"
							pointer-events="none"
						>
							{rect.label.slice(
								0,
								(rect.width * 2) / 8
							)}{#if rect.label.length > (rect.width * 2) / 8}...{/if}
						</text>
					{/if}
				{/if}
			{/each}
		</g>

		<!-- Entries -->
		<g class="entries">
			{#each focusedRects as rect}
				{#if rect.height > 1}
					<rect
						x={rect.x + 2}
						y={rect.y + 2}
						width={rect.width}
						height={rect.height}
						fill={stringToColor(rect.entry.process || rect.entry.pid)}
						fill-opacity="0.85"
					/>
					{#if rect.label && rect.height > 20}
						<text
							x={rect.x + 2}
							y={rect.y + 2}
							dy={8}
							text-anchor="start"
							font-size="8"
							fill="#222"
							pointer-events="none"
						>
							{rect.label.slice(
								0,
								(rect.width * 2) / 8
							)}{#if rect.label.length > (rect.width * 2) / 8}...{/if}
						</text>
					{/if}
				{/if}
			{/each}
		</g>
	</svg>
	{#if tooltip.visible && tooltip.content}
		<div
			class="calendar-tooltip"
			style="position:fixed; {tooltip.align}:{tooltip.x -
				8}px; top:{tooltip.y}px; z-index:1000; pointer-events:none;"
		>
			<div
				style="background:#fff; border:1px solid #bbb; border-radius:4px; padding:8px 12px; box-shadow:0 2px 8px #0002; font-size:13px; min-width:180px; max-width:320px;"
			>
				<div>
					<b>{tooltip.content.title}</b>
				</div>
				<div style="color:#666; font-size:12px;">{tooltip.content.subtitle}</div>
				<div style="color:#888; font-size:12px;">
					{new Date(tooltip.content.time).toLocaleString()}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Colour for the elements of the calendar */
	@property --calendar-fg-color {
		syntax: '<color>';
		inherits: false;
		initial-value: #ccc;
	}

	text {
		font-family: Roboto, sans-serif;
		user-select: none;
	}

	.calendar-grid text {
		fill: var(--calendar-fg-color);
	}

	/* Add a transition for translate transforms */
	svg g {
		/* transition: transform 0.1s ease-out; */
	}

	.calendar-tooltip {
		pointer-events: none;
		user-select: none;
	}

	.calendar-tooltip {
		font-family: Roboto, sans-serif;
	}
</style>
