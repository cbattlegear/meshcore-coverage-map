# MeshCore Coverage Map - Self-Hosted Server

This is the self-hosted version of the MeshCore Coverage Map, migrated from Cloudflare Pages/Workers to Node.js/Express with PostgreSQL.

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd meshcore-coverage-map-1
   ```

2. **Set up the server with Docker** (recommended)
   ```bash
   cd server
   cp .env.example .env  # Edit .env with your settings
   npm run docker:dev
   ```

3. **Configure MQTT scraper** (optional, for automatic data collection)
   ```bash
   cd ../mqtt-scraper
   cp config.json.example config.json  # Edit config.json with your MQTT credentials
   ```

4. **Start MQTT scraper** (if using Docker)
   ```bash
   cd ../server
   docker-compose up -d mqtt-scraper
   ```

The application will be available at `http://localhost:3000`

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher) - or use Docker
- npm or yarn
- Docker and Docker Compose (optional, but recommended)

## Setup

### Option 1: Docker (Recommended for Development)

The easiest way to get started is using Docker Compose, which sets up both the database and application:

```bash
cd server
npm run docker:dev
```

This will:
- Build the application container
- Start PostgreSQL database
- Run database migrations automatically
- Start the Node.js server in development mode with hot-reload

The application will be available at `http://localhost:3000`

To run in detached mode (background):

```bash
npm run docker:dev:detached
```

View logs:

```bash
npm run docker:logs
```

Stop containers:

```bash
npm run docker:down
```

### Option 2: Manual Setup

#### 1. Install Dependencies

```bash
cd server
npm install
```

#### 2. Database Setup

Create a PostgreSQL database:

```bash
createdb meshmap
```

Or using psql:

```sql
CREATE DATABASE meshmap;
```

#### 3. Run Migrations

Run the database schema migration:

```bash
npm run migrate
```

Or manually:

```bash
psql -d meshmap -f migrations/001_initial_schema.sql
```

#### 4. Configure Environment

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=meshmap
DB_USER=postgres
DB_PASSWORD=your_password_here
PORT=3000
NODE_ENV=development
```

#### 5. Start the Server

Development mode (with auto-reload):

```bash
npm run dev
```

Production mode:

```bash
npm start
```

The server will start on port 3000 (or the port specified in `.env`).

## Data Migration

If you have existing data from the Cloudflare service, you can migrate it using the migration script:

```bash
node scripts/migrate-data.js --from-slurp
```

This will fetch data from the live Cloudflare service and import it into your PostgreSQL database.

## API Endpoints

The server provides the same API endpoints as the original Cloudflare Workers implementation:

- `GET /get-nodes` - Get all coverage, samples, and repeaters
- `GET /get-coverage` - Get coverage data
- `GET /get-samples?p=<prefix>` - Get samples (optionally filtered by geohash prefix)
- `GET /get-repeaters` - Get all repeaters
- `GET /get-wardrive-coverage` - Get recent coverage geohashes
- `POST /put-sample` - Add/update a sample
- `POST /put-repeater` - Add/update a repeater
- `POST /consolidate?maxAge=<days>` - Consolidate old samples into coverage
- `POST /clean-up?op=<coverage|samples|repeaters>` - Clean up data

## Frontend

The frontend files are served from the `public/` directory. Access the map at:

- `http://localhost:3000/` - Main coverage map
- `http://localhost:3000/addSample.html` - Add sample form
- `http://localhost:3000/addRepeater.html` - Add repeater form
- `http://localhost:3000/wardrive.html` - Wardrive app
- `http://localhost:3000/howto.html` - How-to guide

## Production Deployment

### Docker Production

For production deployment with Docker:

1. Create a `.env` file with production credentials:

```bash
DB_PASSWORD=your_secure_password
DB_USER=meshmap
DB_NAME=meshmap
PORT=3000
```

2. Start with production compose file:

```bash
npm run docker:prod:detached
```

Or manually:

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

### Manual Production

For production deployment without Docker:

1. Set `NODE_ENV=production` in your `.env` file
2. Use a process manager like PM2:

```bash
npm install -g pm2
pm2 start server.js --name mesh-map
pm2 save
pm2 startup
```

3. Set up a reverse proxy (nginx) if needed
4. Configure SSL/TLS certificates
5. Set up database backups

## Differences from Cloudflare Version

- **Database**: Uses PostgreSQL instead of Cloudflare KV
- **Concurrency**: Proper ACID transactions handle concurrent writes
- **No Rate Limits**: No 1 write/key/second limitation
- **Better Queries**: SQL queries are more efficient than KV list operations
- **Transactions**: Consolidate and cleanup operations use database transactions

## Location Validation

By default, location validation is disabled (no distance limit). You can optionally enable it to restrict locations to a specific region.

### Default Behavior

- **Center**: San Jose, CA (37.3382, -121.8863)
- **Max Distance**: 0 (no limit - accepts locations from anywhere)

### Enable Location Validation

To restrict locations to a specific region, set in `.env`:

```bash
CENTER_POS=37.3382,-121.8863
MAX_DISTANCE_MILES=100
```

Where:
- `CENTER_POS` - Center point in "lat,lon" format
- `MAX_DISTANCE_MILES` - Maximum distance in miles from center (set to 0 to disable)

## Troubleshooting

### Database Connection Issues

Make sure PostgreSQL is running and the credentials in `.env` are correct:

```bash
psql -h localhost -U postgres -d meshmap
```

### Port Already in Use

Change the `PORT` in `.env` or stop the process using port 3000.

### Migration Errors

If migration fails, check:
- Database exists and is accessible
- User has CREATE TABLE permissions
- No conflicting tables exist

### Location Validation Errors

If you get "exceeds max distance" errors:
- By default, distance checking is disabled (MAX_DISTANCE_MILES=0)
- If you've enabled it, set `MAX_DISTANCE_MILES=0` to disable
- Or adjust `CENTER_POS` and `MAX_DISTANCE_MILES` to match your region

## Automated Maintenance

The server includes automated maintenance tasks that run on a schedule:

### Consolidate Task
- **Purpose**: Moves old samples into coverage tiles and archives them
- **Schedule**: Daily at 2 AM (configurable via `CONSOLIDATE_SCHEDULE`)
- **Default Age**: 14 days (2 weeks, configurable via `CONSOLIDATE_MAX_AGE_DAYS`)
- **What it does**:
  - Finds samples older than the configured age
  - Groups them by 6-char geohash (coverage tiles)
  - Merges into coverage table
  - Archives and deletes from samples table

### Cleanup Task
- **Purpose**: Removes stale repeaters and deduplicates
- **Schedule**: Weekly on Sunday at 3 AM (configurable via `CLEANUP_SCHEDULE`)
- **What it does**:
  - Deletes repeaters older than 10 days
  - Deduplicates repeaters at same location (keeps newest)

### Configuration

Add to your `.env` file:

```bash
# Consolidate settings
CONSOLIDATE_ENABLED=true
CONSOLIDATE_SCHEDULE=0 2 * * *  # Daily at 2 AM (cron format)
CONSOLIDATE_MAX_AGE_DAYS=14     # 2 weeks default

# Cleanup settings
CLEANUP_ENABLED=true
CLEANUP_SCHEDULE=0 3 * * 0      # Weekly on Sunday at 3 AM
```

To disable a task, set `CONSOLIDATE_ENABLED=false` or `CLEANUP_ENABLED=false`.

### Manual Execution

You can still run maintenance tasks manually via the API:

```bash
# Consolidate (with custom age)
curl -X POST "http://localhost:3000/consolidate?maxAge=7"

# Cleanup repeaters
curl -X POST "http://localhost:3000/clean-up?op=repeaters"
```

Or use the Python script:
```bash
cd mqtt-scraper
python wardrive-maint.py
```

## Test Data Generation

A test script is available to populate the database with sample data for testing:

```bash
npm run test-data
```

Or directly:

```bash
node scripts/generate-test-data.js
```

This will:
- Create 5 repeaters in random locations within 20 miles of the configured center
- Generate 100 samples distributed across those repeaters (within 10 miles of each)
- Interact with the web service API (not directly with the database)

### Configuration

You can customize the test data generation via environment variables:

```bash
SERVICE_HOST=http://localhost:3000 \
CENTER_LAT=37.3382 \
CENTER_LON=-121.8863 \
npm run test-data
```

The script uses the same center position as your server configuration by default.

## MQTT Scraper Setup

The MQTT scraper automatically collects wardrive data and repeater information from MQTT feeds.

### Quick Start with Docker

If you're using Docker Compose, the MQTT scraper is already configured:

1. **Configure MQTT credentials**
   ```bash
   cd mqtt-scraper
   cp config.json.example config.json
   ```

2. **Edit `config.json`** with your MQTT credentials:
   ```json
   {
     "mqtt_mode": "public",
     "mqtt_host": "mqtt-us-v1.letsmesh.net",
     "mqtt_port": 443,
     "mqtt_use_websockets": true,
     "mqtt_use_tls": true,
     "mqtt_use_auth_token": false,
     "mqtt_username": "YOUR_MQTT_USERNAME",
     "mqtt_password": "YOUR_MQTT_PASSWORD",
     "mqtt_topics": [
       "meshcore/SFO/+/packets",
       "meshcore/OAK/+/packets",
       "meshcore/SJC/+/packets"
     ],
     "service_host": "http://app:3000",
     "center_position": [37.4241, -121.9756],
     "valid_dist": 60,
     "channel_hash": "e0",
     "channel_secret": "YOUR_CHANNEL_SECRET_HEX",
     "watched_observers": [
       "OHMC Repeater",
       "Ruth Bader Ginsburg",
       "Nullrouten observer"
     ]
   }
   ```

3. **Start the scraper**
   ```bash
   cd ../server
   docker-compose up -d mqtt-scraper
   ```

4. **View logs**
   ```bash
   docker-compose logs -f mqtt-scraper
   ```

### Manual Setup (Without Docker)

1. **Install Python dependencies**
   ```bash
   cd mqtt-scraper
   pip install paho-mqtt requests haversine cryptography
   ```

2. **Configure**
   ```bash
   cp config.json.example config.json
   # Edit config.json with your settings
   ```

3. **Update service host** (if not using Docker)
   ```json
   {
     "service_host": "http://localhost:3000"
   }
   ```

4. **Run the scraper**
   ```bash
   python wardrive-mqtt.py
   ```

### MQTT Configuration Options

#### Public Mode (letsmesh.net)
- **Host**: `mqtt-us-v1.letsmesh.net` (US) or `mqtt-eu-v1.letsmesh.net` (EU)
- **Port**: 443
- **WebSockets**: true
- **TLS**: true
- **Authentication**: Username/password (or token if `mqtt_use_auth_token: true`)

#### Local Mode (mosquitto)
For local development/testing:
```json
{
  "mqtt_mode": "local",
  "mqtt_host": "localhost",
  "mqtt_port": 1883,
  "mqtt_use_websockets": false,
  "mqtt_use_tls": false,
  "mqtt_use_auth_token": false
}
```

The local mosquitto broker is included in Docker Compose and accessible on:
- Port 1883 (standard MQTT)
- Port 9001 (WebSockets)

### Token-Based Authentication (Optional)

If your MQTT broker requires token authentication:

1. **Enable token auth**
   ```json
   {
     "mqtt_use_auth_token": true,
     "mqtt_token": "your-jwt-token-here"
   }
   ```

2. **Or auto-generate from keys**
   ```json
   {
     "mqtt_use_auth_token": true,
     "mqtt_public_key": "your-64-char-hex-public-key",
     "mqtt_private_key": "your-128-char-hex-private-key"
   }
   ```

The scraper will automatically generate tokens using the `meshcore-decoder` CLI tool.

### Configuration Details

- **service_host**: URL of the coverage map API
  - Docker: `http://app:3000`
  - Manual: `http://localhost:3000`

- **mqtt_topics**: MQTT topics to subscribe to
  - Format: `meshcore/<REGION>/+/packets`
  - Examples: `meshcore/SFO/+/packets`, `meshcore/SJC/+/packets`

- **watched_observers**: List of observer names to monitor (case-sensitive)
  - Only messages from these observers will be processed

- **center_position**: Geographic center for distance validation `[lat, lon]`
- **valid_dist**: Maximum distance in miles from center (0 = no limit)

- **channel_hash** and **channel_secret**: Used to decrypt encrypted channel messages

### Troubleshooting MQTT Scraper

**Connection Issues**
- Verify MQTT broker is accessible
- Check credentials in `config.json`
- For public mode, ensure WebSockets and TLS are enabled
- Check firewall rules for port 443 (public) or 1883 (local)

**No Messages Processed**
- Verify observer names match exactly (case-sensitive)
- Check that topics are correct for your region
- Ensure the service API is running and accessible
- Check scraper logs for connection/subscription errors

**Service API Errors**
- Verify `service_host` is correct
- For Docker: use `http://app:3000`
- For manual: use `http://localhost:3000`
- Check API server logs for errors

## License

See LICENSE file in the root directory.

