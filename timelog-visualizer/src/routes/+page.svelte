<script>
  import CalendarView from '$lib/components/CalendarView.svelte';


</script>

<div class="container">
    <h1>Time log viewer</h1>
    <CalendarView
            entries={[]}
            startDate={Date.now()}
            days={7}
            hourStart={7}
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

    h1 {
        text-align: left;
        margin-bottom: 20px;
    }
</style>