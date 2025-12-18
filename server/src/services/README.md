# Services

This directory contains background services and scheduled tasks.

## maintenance.js

Automated maintenance tasks that run on a schedule:

- **Consolidate**: Moves old samples into coverage tiles (default: 14 days)
- **Cleanup**: Removes stale repeaters and deduplicates

Tasks are scheduled using `node-cron` and can be configured via environment variables.

