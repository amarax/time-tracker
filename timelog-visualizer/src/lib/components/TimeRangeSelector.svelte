<script>
	import { formatDate, setStartDateToMonday } from "$lib/DateHelpers";

    /**
     * @typedef {Object} Props
     * @property {Date} [startDate]
     * @property {Date} [endDate]
     * @property {(startDate: Date, endDate: Date) => void} [onchange]
     * @property {(date: Date) => string} [formatDate]
     */

    let { startDate = $bindable(setStartDateToMonday(new Date())), endDate = $bindable(), onchange } = $props();

    /**
     * Offset the current week by the specified number of weeks.
     * @param {number} offset
     */
    function offsetWeek(offset) {
        const newDate = new Date(startDate);
        newDate.setDate(newDate.getDate() + offset * 7);
        startDate = setStartDateToMonday(newDate);
    }


    $effect(() => {
        endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
    });

    let prevStartDate = startDate;
    let prevEndDate = endDate;
    $effect(() => {
        if (startDate === prevStartDate && endDate === prevEndDate) {
            return;
        }

        if (onchange) {
            onchange(startDate, endDate);
        }
        prevStartDate = startDate;
        prevEndDate = endDate;
    });
</script>

<div class="week-nav">
    <button aria-label="Today" onclick={() => (startDate = setStartDateToMonday(new Date()))}
        >Today</button
    >
    <button aria-label="Previous week" onclick={() => offsetWeek(-1)}>&lt;</button>
    <span class="week-label">{formatDate(startDate)} - {formatDate(endDate)}</span>
    <button aria-label="Next week" onclick={() => offsetWeek(1)}>&gt;</button>
</div>

<style>
    
	.week-nav {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 1rem;
		margin: 1rem;

        font-family: 'Roboto', sans-serif;
	}
	/* .week-nav button {
		font-size: 1.5rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25em 0.75em;
		border-radius: 0.25em;
		transition: 0.2s;
	} */
	.week-label {
		font-weight: bold;
		font-size: 1.1rem;
	}
</style>