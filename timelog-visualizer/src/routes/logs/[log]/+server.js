import fs from 'fs';
import path from 'path';
import { InfluxDB } from '@influxdata/influxdb-client';
import { select } from 'd3';

const LOG_DIR = path.resolve('../node-process-monitor/logs');

// InfluxDB connection config (no org or token needed for local influxdbcore)
const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_DB = 'process-monitor';

const TABLES = {
	focused: 'focused',
	system: 'system',
	process: 'process'
};

const influxDB = new InfluxDB({ url: INFLUX_URL });

/**
 * GET /logs/[log]?format=json|csv
 * - Queries InfluxDB for the requested log table using InfluxQL.
 */
export async function GET({ params, url }) {
	const log = /** @type {'focused'|'system'|'process'} */ (params.log);
	if (!Object.prototype.hasOwnProperty.call(TABLES, log)) {
		return new Response('Log not found', { status: 404 });
	}
	const table = TABLES[log];
	const format = url.searchParams.get('format') || 'csv';

	// Optional aggregation unit (in seconds)
	const unit = url.searchParams.get('unit');
	let groupBy = '';
	let selectClause = '*';
	if (unit && !isNaN(Number(unit)) && Number(unit) > 0 && log === 'process') {
		// Use aggregate functions for numeric columns, fallback to MEAN for all except time and tags
		// For simplicity, use MEAN for all columns except 'time', 'pid', 'name', 'title', 'process', 'path', 'url'
		// This can be improved if schema is known

		selectClause = '';

		const tagCols = ['pid', 'name'];
		// selectClause += tagCols.map(col => `MODE(${col}) AS ${col}`).join(', ');
		// selectClause += tagCols.map(col => `${col}`).join(', ');
		// selectClause += ', ';

		const aggCols = {
			process: ['cpu', 'memory']
		};
		const tableAggCols = aggCols[table] || [];
		// If no known numeric columns, fallback to MEAN(*)
		if (tableAggCols.length > 0) {
			selectClause += tableAggCols.map((col) => `MEAN(${col}) AS ${col}`).join(', ');
		}

		groupBy = ` GROUP BY ${tagCols.map((col) => `${col}`).join(', ')}, time(${unit}s)`;

		groupBy = ` GROUP BY time(${unit}s), *`;
	}

	// Optional start and end time (ISO 8601 or unix timestamp)
	const startRaw = url.searchParams.get('start');
	const endRaw = url.searchParams.get('end');
	let where = '';
	function toInfluxTime(val) {
		if (!val) return undefined;
		// If it's all digits, treat as unix timestamp (seconds or ms)
		if (/^\d+$/.test(val)) {
			let num = Number(val);
			// If it's 13 digits, treat as ms; if 10, treat as seconds
			if (val.length === 13) {
				return new Date(num).toISOString();
			} else if (val.length === 10) {
				return new Date(num * 1000).toISOString();
			}
		}
		// Otherwise, assume ISO8601 string
		return val;
	}
	const start = toInfluxTime(startRaw);
	const end = toInfluxTime(endRaw);
	if (start || end) {
		const clauses = [];
		if (start) {
			clauses.push(`time >= '${start}'`);
		}
		if (end) {
			clauses.push(`time <= '${end}'`);
		}
		where = ` WHERE ${clauses.join(' AND ')}`;
	}

	// InfluxQL query for the requested range
	const influxql = `SELECT ${selectClause} FROM "${table}"${where}${groupBy} ORDER BY time ASC`;
	const urlObj = new URL(INFLUX_URL);
	urlObj.pathname = '/query';
	urlObj.searchParams.set('db', INFLUX_DB);
	urlObj.searchParams.set('q', influxql);

	let result;
	try {
		const res = await fetch(urlObj.toString());
		if (!res.ok) {
			throw new Error(await res.text());
		}
		result = await res.json();
	} catch (err) {
		return new Response('Error querying InfluxDB: ' + err, { status: 500 });
	}

	// Parse InfluxQL response
	const series = result && result.results && result.results[0] && result.results[0].series;
	if (!series || series.length === 0) {
		return new Response(format === 'csv' ? '' : '[]', {
			headers: { 'Content-Type': format === 'csv' ? 'text/csv' : 'application/json' }
		});
	}

	const keys = [...Object.keys(series[0]?.tags || {}), ...series[0].columns];
    const csv = [keys.join(',')];
	for (let s of series) {
        let values = s.values;
        if(s.columns.indexOf('cpu') !== -1 || s.columns.indexOf('memory') !== -1) {
            // Filter out rows where both cpu and memory are null
            values = s.values.filter(v => v[s.columns.indexOf('cpu')] || v[s.columns.indexOf('memory')]);
        }
		if (format === 'csv') {
			csv.push(...values.map((row) => [...Object.keys(series[0]?.tags || {}).map(tag=>s.tags[tag]), ...row.map((v) => JSON.stringify(v ?? ''))].join(',')));
		}
	}
    if(format === 'csv') {
			return new Response(csv.join('\n'), { headers: { 'Content-Type': 'text/csv' } });
    }

	return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
}
