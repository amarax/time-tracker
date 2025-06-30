<script>
    import { onMount, onDestroy } from 'svelte';
    import * as d3 from 'd3';
    /**
     * @typedef {Object} Entry
     * @property {string} start - ISO string
     * @property {string} end - ISO string
     * @property {string=} label
     * @property {string=} color
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

    let hours = $derived.by(
        () => Array.from({ length: hourEnd - hourStart +1 }, (_, h) => hourStart + h)
    );

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
        for (let i = 0; i < dateRange.length; i++) {
            if (
                date.getFullYear() === dateRange[i].getFullYear() &&
                date.getMonth() === dateRange[i].getMonth() &&
                date.getDate() === dateRange[i].getDate()
            ) {
                return i;
            }
        }
        return -1;
    }

    // Map entries to SVG rectangles
    function getRects() {
        /** @type {{x:number, y:number, width:number, height:number, label?:string, color?:string, entry:Entry}[]} */
        const rects = [];
        for (const entry of entries) {
            const start = new Date(entry.start);
            const end = new Date(entry.end);
            let cur = new Date(start);
            cur.setHours(0, 0, 0, 0);
            while (cur <= end) {
                const dayIdx = getDayIndex(cur);
                if (dayIdx === -1) {
                    cur.setDate(cur.getDate() + 1);
                    continue;
                }
                let entryStart = start;
                let entryEnd = end;
                if (
                    cur.getFullYear() === start.getFullYear() &&
                    cur.getMonth() === start.getMonth() &&
                    cur.getDate() === start.getDate()
                ) {
                    entryStart = start;
                } else {
                    entryStart = new Date(cur);
                    entryStart.setHours(hourStart, 0, 0, 0);
                }
                if (
                    cur.getFullYear() === end.getFullYear() &&
                    cur.getMonth() === end.getMonth() &&
                    cur.getDate() === end.getDate()
                ) {
                    entryEnd = end;
                } else {
                    entryEnd = new Date(cur);
                    entryEnd.setHours(hourEnd, 0, 0, 0);
                }
                // Clamp to visible hours
                var startHour = Math.max(hourStart, entryStart.getHours() + entryStart.getMinutes() / 60);
                var endHour = Math.min(hourEnd, entryEnd.getHours() + entryEnd.getMinutes() / 60);
                if (endHour > startHour) {
                    // Responsive width per cell
                    var dynamicCellWidth = (svgWidth - labelWidth) / dateRange.length;
                    rects.push({
                        x: labelWidth + dayIdx * dynamicCellWidth,
                        y: labelHeight + (startHour - hourStart) * cellHeight,
                        width: dynamicCellWidth,
                        height: (endHour - startHour) * cellHeight,
                        label: entry.label,
                        color: entry.color,
                        entry
                    });
                }
                cur.setDate(cur.getDate() + 1);
            }
        }
        return rects;
    }

    // D3 Y-axis setup
    let timeAxis = $derived.by(() => {
        return d3.scaleLinear()
            .domain([hourStart, hourEnd])
            .range([labelHeight, svgHeight - labelHeight]);
    });

    let hourTicks = $derived.by(() => {
        return hours.map(h => {
            return {
                value: h,
                label: `${h}:00`
            };
        });
    });
</script>

<div bind:this={container} style="flex-grow:1; position:relative">
    <svg style="width:100%;height:100%;">
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
        <g>
            {#each hourTicks as h, i}
                <line
                    x1={labelWidth}
                    y1={timeAxis(h.value)}
                    x2={svgWidth}
                    y2={timeAxis(h.value)}
                    stroke="#ddd"
                    stroke-width="1"
                />
                <text
                    x={labelWidth - 5}
                    y={timeAxis(h.value) + 4}
                    text-anchor="end"
                    font-size="12"
                    fill="#555"
                >
                    {h.label}
                </text>
            {/each}
        </g>

        <!-- Entries -->
        <g>
            {#each getRects() as rect}
                <rect
                    x={rect.x + 2}
                    y={rect.y + 2}
                    width={rect.width - 4}
                    height={rect.height - 4}
                    rx="6"
                    fill={rect.color || "#90caf9"}
                    fill-opacity="0.85"
                    stroke="#1976d2"
                    stroke-width="1"
                />
                {#if rect.label}
                    <text
                        x={rect.x + rect.width / 2}
                        y={rect.y + rect.height / 2 + 5}
                        text-anchor="middle"
                        font-size="13"
                        fill="#222"
                        pointer-events="none"
                    >
                        {rect.label}
                    </text>
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
        fill: var(--calendar-fg-color);
    }
</style>