<script>
    import { onMount, onDestroy } from 'svelte';
    import * as d3 from 'd3';
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

    /**
     * CalendarView component props.
     * @property {Array<Entry>} entries - Array of time log entries to display in the calendar.
     * @property {Date|null} startDate - The starting date for the calendar view. If null, defaults to current date.
     * @property {number} days - Number of days to display in the calendar view (default: 7).
     * @property {number} hourStart - The starting hour of the day to display (default: 0).
     * @property {number} hourEnd - The ending hour of the day to display (default: 24).
     */
    const { entries = [], processEntries = [], startDate = null, days = 7, hourStart = 0, hourEnd = 24 } = $props();

    // --- Svelte 5 runes ---
    let dateRange = $derived.by(
        () => {
            const base = startDate ? new Date(startDate) : new Date();
            base.setHours(0, 0, 0, 0);
            return Array.from({ length: days }, (_, i) => {
                const d = new Date(base);
                d.setDate(base.getDate() + i);
                return d;
            });
        }
    );

    const dayms = 24 * 60 * 60 * 1000;
    const hourms = 60 * 60 * 1000;
    const timeZoneOffset = new Date().getTimezoneOffset() * 60 * 1000;

    let displayedHourStart = $state(hourStart* hourms + timeZoneOffset);
    let displayedHourEnd = $state(hourEnd* hourms + timeZoneOffset);


    // Calculate hours as the hour of day for each hour in the range
    let hours = $derived.by(() => {
        let hours = [];
        for(let h = displayedHourStart; h <= displayedHourEnd; h += hourms) {
            // hourStart + h in ms, modulo dayms, gives hour of day
            const ms = Math.ceil(h/hourms) * hourms;
            hours.push(ms);
        }
        return hours;
    });

    // Scale the hours when the user scrolls, centered on the mouse position
    function handleScroll(event) {
        const delta = event.deltaY;
        const centerY = event.clientY - container.getBoundingClientRect().top;
        const centerHour = timeAxis.invert(centerY);

        // Scale factor: zoom in/out
        const scaleFactor = 1 + delta / 500; // Prevent negative or zero range
        
        displayedHourStart = centerHour + (displayedHourStart - centerHour) * scaleFactor;
        displayedHourEnd = centerHour + (displayedHourEnd - centerHour) * scaleFactor;

        displayedHourStart = Math.max(0+timeZoneOffset, displayedHourStart);
        displayedHourEnd = Math.min(24 * hourms+timeZoneOffset, displayedHourEnd);
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
            svgHeight = container.clientHeight || (labelHeight + hours.length * cellHeight);
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

        return (date.getDay() -1 + 7)%7;
    }


    function stringToColor(str) {
        // Simple heuristic to generate a color based on the string
        const hash = Array.from(str).reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const hue = hash % 360;
        return `hsl(${hue}, 70%, 70%)`;
    }

    // Map entries to SVG rectangles
    function getRects() {
        /** @type {{x:number, y:number, width:number, height:number, label?:string, color?:string, entry:Entry}[]} */
        const rects = [];
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const start = new Date(entry.timestamp);
            const end = new Date(start);
            if(entries[i + 1]) {
                end.setTime(new Date(entries[i + 1].timestamp).getTime()); // Use next entry's start time minus 1 ms
            } else {
                continue;
            }


            // If the times are out of bounds for displayed hours, skip
            if (end.getTime() % dayms < displayedHourStart || start.getTime() % dayms> displayedHourEnd) {
                continue;
            }

            const dayIndex = getDayIndex(start);

            // Calculate rectangle position and size
            const x = labelWidth + dayIndex * ((svgWidth - labelWidth) / dateRange.length);
            const y = timeAxis(start.getTime() % dayms);
            const width = 0.5 * (svgWidth - labelWidth) / dateRange.length;
            const height = Math.abs(timeAxis(end.getTime() % dayms) - timeAxis(start.getTime() % dayms));

            rects.push({
                x,
                y,
                width,
                height,
                label: entry.title || entry.process || entry.path || entry.url || '',
                color: stringToColor(entry.process),
                entry
            });
        }
        return rects;
    }

    function getProcessRects() {
        // Group the processes by name
        let processNames = new Set();
        for (let entry of processEntries) {
            if (entry.name) {
                processNames.add(entry.name);
            }
        }

        // Map each set to an index
        const processNameToIndex = {};
        let index = 0;
        for (let name of processNames) {
            processNameToIndex[name] = index++;
        }


        /** @type {{x:number, y:number, width:number, height:number, label?:string, color?:string, entry:ProcessEntry}[]} */
        const rects = [];
        for (let i = 0; i < processEntries.length; i++) {
            const entry = processEntries[i];
            const start = entry.start;
            const end = entry.end;

            // If the times are out of bounds for displayed hours, skip
            if (end.getTime() % dayms < displayedHourStart || start.getTime() % dayms> displayedHourEnd) {
                continue;
            }

            const dayIndex = getDayIndex(start);

            // Calculate rectangle position and size
            const colWidth = 0.5 * (svgWidth - labelWidth) / dateRange.length;
            
            const x = labelWidth + (dayIndex + 0.5) * ((svgWidth - labelWidth) / dateRange.length) + 
                (colWidth / processNames.size) * processNameToIndex[entry.name];
            const y = timeAxis(start.getTime() % dayms);
            const width = colWidth / processNames.size;
            const height = Math.abs(timeAxis(end.getTime() % dayms) - timeAxis(start.getTime() % dayms));

            rects.push({
                x,
                y,
                width,
                height,
                label: entry.name || '',
                color: stringToColor(entry.name),
                entry
            });
        }

        return rects;
    }

    // D3 Y-axis setup
    let timeAxis = $derived.by(() => {
        return d3.scaleLinear()
            .domain([displayedHourStart, displayedHourEnd])
            .range([labelHeight, svgHeight - labelHeight]);
    });

    let hourTicks = $derived.by(() => {
        return hours.map(h => {
            let date = new Date();
            date.setHours((h - timeZoneOffset)/hourms, 0, 0, 0);
            return {
                value: h,
                label: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
        });
    });

    let isMiddlePanning = false;
    let panStart = {clientY:0, timeAxisValue: 0};

    function handleMouseDown(event) {
        if (event.button === 1) { // Middle mouse button
            isMiddlePanning = true;
            
            panStart.clientY = event.clientY;
            panStart.timeAxisValue = timeAxis.invert(event.clientY - container.getBoundingClientRect().top);

            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            event.preventDefault();
        }
    }

    function handleMouseMove(event) {
        if (!isMiddlePanning) return;
        
        const deltaY = event.clientY - panStart.clientY;
        panStart.clientY = event.clientY;
        
        // Calculate how many ms to pan based on svgHeight
        const range = displayedHourEnd - displayedHourStart;
        const msPerPixel = (displayedHourEnd - displayedHourStart) / (svgHeight - 2 * labelHeight);
        const msDelta = -deltaY * msPerPixel;

        if(displayedHourStart + msDelta < 0 + timeZoneOffset) {
            displayedHourStart = 0 + timeZoneOffset;
            displayedHourEnd = displayedHourStart + range; // Keep the range the same
            return;
        }
        if(displayedHourEnd + msDelta > 24 * hourms + timeZoneOffset) {
            displayedHourEnd = 24 * hourms + timeZoneOffset;
            displayedHourStart = displayedHourEnd - range; // Keep the range the same
            return;
        }

        displayedHourStart += msDelta;
        displayedHourEnd += msDelta;
    }

    function handleMouseUp(event) {
        if (event.button === 1 && isMiddlePanning) {
            isMiddlePanning = false;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
    }

    // Tooltip state
    let tooltip = $state({ visible: false, x: 0, y: 0, entry: null });

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
        let minDist = Infinity;
        let closest = null;
        for (let entry of entries) {
            const start = new Date(entry.timestamp);
            const entryDayIdx = getDayIndex(start);
            if (entryDayIdx !== dayIdx) continue;
            const entryMs = start.getTime() % dayms;
            const dist = Math.abs(entryMs - msOfDay);
            if (dist < minDist) {
                minDist = dist;
                closest = entry;
            }
        }
        return closest;
    }

    function handleMouseMoveTooltip(event) {
        const entry = findClosestEntry(event.clientX, event.clientY);

        if (entry) {
            let x = getDayIndex(new Date(entry.timestamp)) * ((svgWidth - labelWidth) / dateRange.length) + labelWidth;
            tooltip = {
                visible: true,
                x,
                y: event.clientY + 12,
                entry
            };
        } else {
            tooltip = { visible: false, x: 0, y: 0, entry: null };
        }
    }

    function handleMouseLeaveTooltip() {
        tooltip = { visible: false, x: 0, y: 0, entry: null };
    }
</script>

<div bind:this={container} style="flex-grow:1; position:relative">
    <svg style="width:100%;height:100%;" onwheel={handleScroll} onmousedown={handleMouseDown} tabindex="0"
        onmousemove={handleMouseMoveTooltip} onmouseleave={handleMouseLeaveTooltip}>
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
                    x={labelWidth + i * ((svgWidth - labelWidth) / dateRange.length) + ((svgWidth - labelWidth) / dateRange.length) / 2}
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
                    <line
                        x1={labelWidth}
                        y1="0"
                        x2={svgWidth}
                        y2="0"
                        stroke="#ddd"
                        stroke-width="1"
                    />
                    <text
                        x={labelWidth - 5}
                        y="4"
                        text-anchor="end"
                        font-size="12"
                        fill="#555"
                    >
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
                    fill={rect.color || "#ffcc80"}
                    fill-opacity="0.85"
                />
                {#if rect.label && rect.height > 20}
                    <text
                        x={rect.x+2}
                        y={rect.y+2}
                        dy={13}
                        text-anchor="start"
                        font-size="13"
                        fill="#222"
                        pointer-events="none"
                    >
                        {rect.label}
                    </text>
                {/if}
                {/if}
            {/each}
        </g>

        <!-- Entries -->
        <g class="entries">
            {#each getRects() as rect}
                {#if rect.height > 1}
                <rect
                    x={rect.x + 2}
                    y={rect.y + 2}
                    width={rect.width}
                    height={rect.height}
                    fill={rect.color || "#90caf9"}
                    fill-opacity="0.85"
                />
                {#if rect.label && rect.height > 20}
                    <text
                        x={rect.x+2}
                        y={rect.y+2}
                        dy={13}
                        text-anchor="start"
                        font-size="13"
                        fill="#222"
                        pointer-events="none"
                    >
                        {rect.label}
                    </text>
                {/if}
                {/if}
            {/each}
        </g>
    </svg>
    {#if tooltip.visible && tooltip.entry}
        <div class="calendar-tooltip" style="position:fixed; left:{tooltip.x}px; top:{tooltip.y}px; z-index:1000; pointer-events:none;">
            <div style="background:#fff; border:1px solid #bbb; border-radius:4px; padding:8px 12px; box-shadow:0 2px 8px #0002; font-size:13px; min-width:180px; max-width:320px;">
                <div><b>{tooltip.entry.title || tooltip.entry.process || tooltip.entry.path || tooltip.entry.url}</b></div>
                <div style="color:#666; font-size:12px;">{tooltip.entry.process}</div>
                <div style="color:#888; font-size:12px;">{new Date(tooltip.entry.timestamp).toLocaleString()}</div>
                {#if tooltip.entry.url}
                    <div style="color:#0074d9; font-size:12px; overflow-wrap:anywhere;">{tooltip.entry.url}</div>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
    /* Colour for the elements of the calendar */
    @property --calendar-fg-color {
        syntax: "<color>";
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