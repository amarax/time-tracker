import fs from 'fs';
import path from 'path';
import { InfluxDB } from '@influxdata/influxdb-client';

const LOG_DIR = path.resolve('../node-process-monitor/logs');

// InfluxDB connection config (no org or token needed for local influxdbcore)
const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_DB = 'process-monitor';

const TABLES = {
    focused: 'focused',
    system: 'system',
    process: 'process',
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

    // InfluxQL query for the last 7 days from the measurement
    const influxql = `SELECT * FROM "${table}" ORDER BY time ASC`;
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
    const series = result && result.results && result.results[0] && result.results[0].series && result.results[0].series[0];
    if (!series) {
        return new Response(format === 'csv' ? '' : '[]', { headers: { 'Content-Type': format === 'csv' ? 'text/csv' : 'application/json' } });
    }

    const keys = series.columns;
    const rows = series.values.map(arr => Object.fromEntries(arr.map((v, i) => [keys[i], v])));
    if (format === 'csv') {
        const csv = [keys.join(','), ...series.values.map(row => row.map(v => JSON.stringify(v ?? '')).join(','))].join('\n');
        return new Response(csv, { headers: { 'Content-Type': 'text/csv' } });
    }
    return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
}
