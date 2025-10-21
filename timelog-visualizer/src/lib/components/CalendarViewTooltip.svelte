<script>
	let { tooltip } = $props();
</script>

<div class="calendar-tooltip" style="{tooltip.align}:{tooltip.x - 8}px; top:{tooltip.y}px;">
	<div class="container">
		<div>
			<b>{tooltip.content.title}</b>
		</div>
		<div class="details">{tooltip.content.subtitle}</div>
		<div class="details">
			{new Date(tooltip.content.time).toLocaleString()}
		</div>
	</div>
</div>

<style>
	.calendar-tooltip {
		pointer-events: none;
		user-select: none;

		position: fixed;
		z-index: 1000;

		font-family: Roboto, sans-serif;

		.container {
			background: #fff;
			border: 1px solid #bbb;
			border-radius: 4px;
			padding: 8px 12px;
			box-shadow: 0 2px 8px #0002;
			font-size: 13px;
			min-width: 180px;
			max-width: 320px;
		}

		.details {
			color: #666;
			font-size: 12px;
		}
	}
</style>
