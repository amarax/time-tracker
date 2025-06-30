import fs from 'fs';
import path from 'path';

const LOG_DIR = path.resolve('../node-process-monitor/logs');

/**
 * List of allowed logs with their filenames.
 * @type {Record<string, string>}
 */
const ALLOWED_LOGS = {
    focused: 'focused.csv',
    system: 'system.csv',
    process: 'process.csv',
};

/**
 * GET /logs/[log]?format=json|csv
 * - Serves focused.csv and system.csv as JSON or CSV.
 * - Serves process.csv as a download link only (too large to parse).
 */
export async function GET({ params }) {
    const log = params.log;
    const file = ALLOWED_LOGS[log];
    if (!file) {
        return new Response('Log not found', { status: 404 });
    }
    const filePath = path.join(LOG_DIR, file);
    // Only allow download as CSV for all logs
    const csv = fs.readFileSync(filePath);
    return new Response(csv, {
        headers: {
            'Content-Type': 'text/csv'
        }
    });
}
