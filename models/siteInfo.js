// models/siteInfo.js
// Basic info about the running site (shown in the dashboard footer), read once
// at startup from the latest git commit. Without git (or outside a checkout)
// the fields stay null and the footer is simply not shown.

const { execFileSync } = require('child_process');
const path = require('path');
const logger = require('../logger');

function readLatestCommit() {
    try {
        const output = execFileSync('git', ['log', '-1', '--format=%cI%n%h'], {
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const [date, commit] = output.trim().split('\n');
        return { lastUpdate: date || null, commit: commit || null };
    } catch (error) {
        logger.info(`Could not read latest git commit for site info: ${error.message}`);
        return { lastUpdate: null, commit: null };
    }
}

const siteInfo = readLatestCommit();

module.exports = { siteInfo };
