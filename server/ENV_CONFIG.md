# Environment Configuration

## Location Validation Settings

The application can optionally validate that locations are within a certain distance from a center point. By default, validation is disabled (no distance limit).

### Default Behavior

- **Center**: San Jose, CA (37.3382, -121.8863)
- **Max Distance**: 0 (no limit - accepts locations from anywhere)

### Enable Location Validation

To restrict locations to a specific region, configure:

```bash
CENTER_POS=37.3382,-121.8863
MAX_DISTANCE_MILES=100
```

Where:
- `CENTER_POS` - Center point in "lat,lon" format
- `MAX_DISTANCE_MILES` - Maximum distance in miles from center (set to 0 to disable)

## Example .env Configuration

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=meshmap
DB_USER=postgres
DB_PASSWORD=your_password_here

# Server Configuration
PORT=3000
NODE_ENV=development

# Location Validation (optional)
# Default: no distance limit (MAX_DISTANCE_MILES=0)
# To enable regional restriction:
# CENTER_POS=37.3382,-121.8863
# MAX_DISTANCE_MILES=100
```

## Docker Configuration

In `docker-compose.yml`, you can set these as environment variables:

```yaml
environment:
  # ... other vars ...
  CENTER_POS: "37.3382,-121.8863"  # Default: San Jose, CA
  MAX_DISTANCE_MILES: 0             # Default: no limit
  # To enable regional restriction:
  # MAX_DISTANCE_MILES: 100
```

## Maintenance Task Configuration

### Consolidate Task

Automatically moves old samples into coverage tiles and archives them:

```bash
CONSOLIDATE_ENABLED=true
CONSOLIDATE_SCHEDULE=0 2 * * *  # Daily at 2 AM (cron format)
CONSOLIDATE_MAX_AGE_DAYS=14     # Samples older than 14 days (2 weeks) will be consolidated
```

### Cleanup Task

Automatically removes stale repeaters and deduplicates:

```bash
CLEANUP_ENABLED=true
CLEANUP_SCHEDULE=0 3 * * 0      # Weekly on Sunday at 3 AM
```

### Cron Schedule Format

The schedule uses standard cron format: `minute hour day month weekday`

Examples:
- `0 2 * * *` - Daily at 2:00 AM
- `0 3 * * 0` - Weekly on Sunday at 3:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 1 * *` - First day of each month at midnight

To disable a task, set `ENABLED=false`.

