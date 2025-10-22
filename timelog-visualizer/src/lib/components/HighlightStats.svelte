<script>
	import { formatPrefix } from 'd3';

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

    /** @type {number} Active time in milliseconds */
    let totalActiveTime = $derived.by(()=>{
        if (!data || !timeRange) return 0;
        if(!timeRange[0] || !timeRange[1]) return 0;

        const timeRangeStart = timeRange[0].getTime();
        const timeRangeEnd = Math.min(timeRange[1].getTime(), Date.now());

        // Subtract the duration of the entries that fall within the timerange
        let total = timeRangeEnd - timeRangeStart;

        /**
         * @type {{start:number,end:number}[]}
         */
        let combinedIntervals = [];
        for (const entry of data.system.filter(entry=>entry.isIdle || entry.sleepState === 'sleep_start')) {
            if(entry.start.getTime() > timeRangeEnd || (entry.end?.getTime()??timeRangeEnd) < timeRangeStart) {
                continue;
            }

            let start = Math.max(entry.start.getTime(), timeRangeStart);
            let end = Math.min(entry.end?.getTime() ?? timeRangeEnd, timeRangeEnd);

            combinedIntervals.find((interval) => {
                // Check for overlap
                if (start <= interval.end && end >= interval.start) {
                    // Merge intervals
                    interval.start = Math.min(interval.start, start);
                    interval.end = Math.max(interval.end, end);
                    return true;
                }
                return false;
            }) || combinedIntervals.push({ start, end });
        }

        return total - combinedIntervals.reduce((sum, interval) => sum + (interval.end - interval.start), 0);
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
        Total active time: {formatTime(totalActiveTime)}
    {/if}
</div>

<style>
    .highlight-stats {
        font-family: 'Roboto', sans-serif;

        margin: auto 0;
    }
</style>
