/**
 * @typedef {Object} FocusedEntryRaw
 * @property {Date} time - ISO string representing the start time of the entry
 * @property {string} title - Focused window title
 * @property {string} process - Process name
 * @property {string} path - File path of the process
 * @property {string} [url] - URL if the entry is a web page
 */

/**
 * @typedef {Object} FocusedEntry
 * @property {Date} start - ISO string representing the start time of the entry
 * @property {Date} [end] - ISO string representing the end time of the entry
 * @property {string} title - Focused window title
 * @property {string} process - Process name
 * @property {string} path - File path of the process
 * @property {string} [url] - URL if the entry is a web page
 */

/**
 * @typedef {Object} ProcessEntry
 * @property {Date} time - ISO string representing the start time of the entry
 * @property {string} pid - Process ID
 * @property {string} name - Process exe file
 * @property {string} cpu - CPU usage percentage
 * @property {string} memory - Memory usage in bytes
 * @property {Date} started - ISO string representing the start time of the process
 */

/**
 * @typedef {Object} ProcessEntryBlock
 * @property {Date[]} timestamps - ISO string representing the start time of the entry
 * @property {string} pid - Process ID
 * @property {string} name - Process exe file
 * @property {string[]} cpu - CPU usage percentage
 * @property {string[]} memory - Memory usage in bytes
 * @property {Date} started - ISO string representing the start time of the process
 * @property {Date} start - Start time of the block
 * @property {Date} end - End time of the block
 */

/**
 * @typedef {Object} SystemEntryRaw
 * @property {string} time - ISO string representing the start time of the entry
 * @property {'true'|'false'} isIdle - Whether the system was idle
 * @property {'sleep_start'|'sleep_stop'|'false'|""} sleepState - Sleep state of the system
 * @property {string} [end] - ISO string representing the end time of the entry
 */

/**
 * @typedef {Object} SystemEntry
 * @property {Date} start - Start time of the entry
 * @property {Date} [end] - End time of the entry
 * @property {boolean} isIdle - Whether the system was idle
 * @property {'sleep_start'|'sleep_stop'} [sleepState] - Sleep state of the system
 */

/**
 * @typedef {Object} CalendarBlock
 * @property {Date} start - Start time of the block
 * @property {Date} end - End time of the block
 * @property {string} label - Label for the block (e.g., process name)
 * @property {FocusedEntry|ProcessEntryBlock|SystemEntry} [entry] - The entry associated with the block
 */

/**
 * Consolidates process entries by PID and start time.
 * @param {ProcessEntry[]} entries - The process entries to consolidate.
 * @returns {ProcessEntryBlock[]} - The consolidated process entries.
 */
function consolidateProcessEntries(entries) {
	/**
	 * Generates a unique key for a process entry.
	 * @param {ProcessEntry} entry - The process entry to generate a key for.
	 * @returns {string} - The generated key.
	 */
	function key(entry) {
		return `${entry.pid}-${new Date(entry.started).getTime()}-${new Date(entry.time).getDay()}`;
	}

	/** @type {Record<string, ProcessEntryBlock>} */
	const consolidated = {};
	for (const e of entries) {
		let lastEntry = consolidated[key(e)];
		if (lastEntry) {
			// If the last entry has the same PID, update it
			lastEntry.timestamps.push(new Date(e.time));
			lastEntry.cpu.push(e.cpu);
			lastEntry.memory.push(e.memory);
			lastEntry.end = new Date(e.time);
		} else {
			// Otherwise, create a new entry
			consolidated[key(e)] = {
				pid: e.pid,
				name: e.name,
				timestamps: [new Date(e.time)],
				cpu: [e.cpu],
				memory: [e.memory],
				start: new Date(e.time),
				end: new Date(e.time),
				started: new Date(e.started)
			};
		}
	}
	return Object.values(consolidated);
}

/**
 * Converts raw focused entries to a structured format.
 * @param {FocusedEntryRaw[]} entries
 * @returns {FocusedEntry[]}
 */
function convertFocusedEntries(entries) {
	return entries.map((e, i, a) => ({
		start: new Date(e.time),
		end: i < a.length - 1 ? new Date(a[i + 1].time) : undefined,
		title: e.title,
		process: e.process,
		path: e.path,
		url: e.url
	}));
}

/**
 * Converts raw system entries to a structured format.
 * @param {SystemEntryRaw[]} entries
 * @returns {SystemEntry[]}
 */
function convertSystemEntries(entries) {
	return entries.map((e) => ({
		start: new Date(e.time),
		end: e.end ? new Date(e.end) : undefined,
		isIdle: e.isIdle === 'true',
		sleepState: e.sleepState === 'false' || e.sleepState === "" ? undefined : e.sleepState
	}));
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// One formatter to read full Y-M-D-h-m-s parts in the target zone
const fullFmt = new Intl.DateTimeFormat('en-US', {
	timeZone,
	hour12: false,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit'
});

/**
 *  Get zone offset (ms) for a given UTC timestamp
 * @param {number} ts - UTC timestamp
 * @returns {number} - Offset in milliseconds (positive east of UTC)
 */
const offset = (ts) => {
	const parts = Object.fromEntries(
		fullFmt
			.formatToParts(new Date(ts))
			.filter((p) => p.type !== 'literal')
			.map((p) => [p.type, +p.value])
	);
	const localEpoch = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second
	);
	return localEpoch - ts; // positive east of UTC
};

/** 
 * UTC timestamp of the next local midnight after ts
 * @param {number|Date} ts - UTC timestamp
 * @returns {number} - UTC timestamp of next local midnight
 */
const nextMidnight = (ts) => {
	const date = new Date(ts);

	const baseUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 1); // 00:00 UTC of next day
	return baseUTC - offset(baseUTC); // shift back to local midnight in UTC
};

/**
 * UTC timestamp of the current local midnight at ts
 * @param {number|Date} ts - UTC timestamp
 * @returns {number} - UTC timestamp of current local midnight
 */
const currentMidnight = (ts) => {
	let date = new Date(ts);

	const baseUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 1); // 00:00 UTC of today
	return baseUTC; // shift back to local midnight in UTC
};

/**
 * @param {Date} date
 * @returns {number}
 */
function getDayIndex(date) {
	return (date.getDay() - 1 + 7) % 7;
}

const dayms = 24 * 60 * 60 * 1000;

/**
 * Split CalendarBlock entries by day
 * @param {CalendarBlock[]} blocks - Array of calendar blocks.
 * @return {CalendarBlock[]}
 */
function splitBlocksByDay(blocks) {
	return blocks.flatMap((block) => {
		let start = new Date(block.start);
		const end = new Date(block.end);

		let r = [];
		while (start < end) {
			const sliceEnd = nextMidnight(start) - 1000; // 23:59:59 local
			r.push({
				...block,
				start: new Date(start),
				end: new Date(Math.min(end.getTime(), sliceEnd))
			});
			start = new Date(sliceEnd + 1); // continue from the next ms
		}
		return r;
	});
}

/**
 * Maps calendar entries to SVG rectangles.
 * @param {Array<FocusedEntry>} entries - Array of calendar entries.
 * @param {Array<Date>} dateRange - Array of dates representing the range of the calendar.
 * @returns {Array<CalendarBlock>}
 */
function getFocusedBlocks(entries, dateRange) {
	/** @type {CalendarBlock[]} */
	let rects = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		let start = new Date(entry.start);
		let end = new Date(
			entry.end || Math.min(Date.now(), dateRange[dateRange.length - 1].getTime() + dayms)
		);

		rects.push({
			start: new Date(start),
			end: new Date(end),
			label: entry.title || entry.process || entry.path || entry.url || '',
			entry
		});
	}

	rects = splitBlocksByDay(rects);
	return rects;
}

/**
 * Maps system entries to SVG rectangles.
 * @param {Array<SystemEntry>} entries - Array of system entries.
 * @returns {Array<CalendarBlock>}
 */
function getSystemBlocks(entries) {
	/** @type {CalendarBlock[]} */
	let rects = [];
	let currentRect = null;

	for (const entry of entries) {
		if (!entry.isIdle) {
			if (currentRect) {
				// If we already have a current rectangle, finalize it
				rects.push(currentRect);
				currentRect = null;
			}
		} else {
			if (!currentRect) {
				currentRect = {
					start: new Date(entry.start),
					end: new Date(),
					label: 'Idle'
				};
			}

			if (entry.end) {
				currentRect.end = new Date(entry.end);
			}
		}
	}
	// If we have an open rectangle at the end, push it
	if (currentRect) {
		rects.push(currentRect);
		currentRect = null;
	}

	for (const entry of entries) {
		if (!entry.sleepState) {
			// Ignore
			continue;
		} else if (entry.sleepState === 'sleep_stop') {
			if (currentRect) {
				// If we already have a current rectangle, finalize it
				rects.push(currentRect);
				currentRect = null;
			} else {
				let end = new Date(entry.end ?? entry.start);
				// Create a sleep block from unknown start (one week before end) to this end
				
				currentRect = {
					start: new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000),
					end,
					label: 'Sleep'
				};
				rects.push(currentRect);
				currentRect = null;
			}
		} else if (entry.sleepState === 'sleep_start') {
			if (!currentRect) {
				currentRect = {
					start: new Date(entry.start),
					end: new Date(),
					label: 'Sleep'
				};
			}

			if (entry.end) {
				currentRect.end = new Date(entry.end);
			}
		}
	}
	if (currentRect) {
		// If we have an open rectangle at the end, push it
		rects.push(currentRect);
		currentRect = null;
	}

	// Split the rectangles by day
	rects = splitBlocksByDay(rects);

	return rects;
}

/**
 * Maps process entries to SVG elements
 * @param {Array<ProcessEntryBlock>} entries - Array of process entries.
 * @returns {Array<CalendarBlock>}
 */
function getProcessBlocks(entries) {
	/** @type {CalendarBlock[]} */
	let rects = [];
	for (const entry of entries) {
		let start = new Date(entry.start);
		let end = new Date(
			entry.end ||
				Math.min(Date.now(), entry.timestamps[entry.timestamps.length - 1].getTime() + dayms)
		);

		rects.push({
			start: new Date(start),
			end: new Date(end),
			label: entry.name || entry.pid,
			entry
		});
	}

	rects = splitBlocksByDay(rects);
	return rects;
}

/**
 * Maps sleep and idle system entries to SVG rectangles.
 * @param {Array<SystemEntry>} entries - Array of system entries.
 *
 */

export {
	consolidateProcessEntries,
	convertFocusedEntries,
	getFocusedBlocks,
	getSystemBlocks,
	getProcessBlocks,
	convertSystemEntries,
	currentMidnight
};
