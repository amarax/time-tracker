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
     * CalendarView component props.
     * @property {Array<Entry>} entries - Array of time log entries to display in the calendar.
     * @property {Date|null} startDate - The starting date for the calendar view. If null, defaults to current date.
     * @property {number} days - Number of days to display in the calendar view (default: 7).
     * @property {number} hourStart - The starting hour of the day to display (default: 0).
     * @property {number} hourEnd - The ending hour of the day to display (default: 24).
     */
    const { entries = [], startDate = null, days = 7, hourStart = 0, hourEnd = 24 } = $props();

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
        const scaleFactor = 1 + delta / 2000; // Prevent negative or zero range
        
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
</script>

<div bind:this={container} style="flex-grow:1; position:relative">
    <svg style="width:100%;height:100%;" onwheel={handleScroll} onmousedown={handleMouseDown} tabindex="0">
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
</style>