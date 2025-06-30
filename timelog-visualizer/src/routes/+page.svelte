<script>
    import CalendarView from '$lib/components/CalendarView.svelte';

    import { onMount } from 'svelte';

    /**
     * @typedef {Object} Entry
     * @property {Date} timestamp - ISO string representing the start time of the entry
     * @property {string} title - Focused window title
     * @property {string} process - Process name
     * @property {string} path - File path of the process
     * @property {string} [url] - URL if the entry is a web page
    */
    let entries = $state([]);

    // Load the csv events from /logs/focused
    async function load() {
        const response = await fetch('/logs/focused');
        const text = await response.text();
        const lines = text.split('\n').filter(Boolean);
        const header = lines.shift().split(',');
        const entries = lines.map(line => {
            const values = line.split(',');
            const entry = {};
            header.forEach((key, i) => {
                entry[key] = values[i];
            });
            return entry;
        }).filter(entry => Object.values(entry).every(v => v !== undefined && v !== ''))
        .map(entry => ({
            ...entry,
            timestamp: new Date(entry.timestamp),
        }));
        return entries;
    }

    onMount(async () => {
        entries = await load();
        // Here you can set the entries to a store or pass them directly to the CalendarView
        // For example, if you have a store:
        // calendarStore.set(entries);
    });

    let startDate = $state(setStartDateToMonday(new Date()));

    // Set the start date to the Monday of the current week
    function setStartDateToMonday(date) {
        const day = date.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        let newDate = new Date()
        newDate.setDate(date.getDate() + diff);
        newDate.setHours(0, 0, 0, 0);
        return newDate;
    }

    function changeWeek(offset) {
        const newDate = new Date(startDate);
        newDate.setDate(newDate.getDate() + offset * 7);
        startDate = setStartDateToMonday(newDate);
    }

    let filteredEntries = $derived(entries?.filter(entry => {
            const entryDate = new Date(entry.timestamp);
            return entryDate >= startDate && entryDate < new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        }));
</script>

<div class="container">
    <h1>Time log viewer</h1>
    <div class="week-nav">
        <button aria-label="Previous week" on:click={() => changeWeek(-1)}>&larr;</button>
        <span class="week-label">{startDate.toLocaleDateString()} - {new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString()}</span>
        <button aria-label="Next week" on:click={() => changeWeek(1)}>&rarr;</button>
    </div>
    <CalendarView
            entries={filteredEntries}
            {startDate} 
            days={7}
            hourStart={0}
            hourEnd={24} />
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
        transition: background 0.2s;
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