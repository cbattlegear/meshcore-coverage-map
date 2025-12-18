#!/usr/bin/env node

/**
 * Test Data Generator
 * 
 * Generates test data by calling the web service API:
 * - 5 repeaters in random locations within 20 miles of center
 * - 100 samples distributed across those repeaters (within 10 miles of each)
 */

const https = require('https');
const http = require('http');

// Configuration
const SERVICE_HOST = process.env.SERVICE_HOST || 'http://localhost:3000';
const CENTER_LAT = parseFloat(process.env.CENTER_LAT || '37.3382');
const CENTER_LON = parseFloat(process.env.CENTER_LON || '-121.8863');
const NUM_REPEATERS = 5;
const NUM_SAMPLES = 100;
const REPEATER_RADIUS_MILES = 20;
const SAMPLE_RADIUS_MILES = 10;

// Repeater names for variety
const REPEATER_NAMES = [
  'Test Repeater Alpha',
  'Test Repeater Beta',
  'Test Repeater Gamma',
  'Test Repeater Delta',
  'Test Repeater Echo'
];

// Haversine distance calculation (miles)
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const toRad = deg => deg * Math.PI / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Generate a random point within radius of center
function randomPointInRadius(centerLat, centerLon, radiusMiles) {
  // Convert radius to approximate degrees (rough approximation)
  const latRadius = radiusMiles / 69; // ~69 miles per degree latitude
  const lonRadius = radiusMiles / (69 * Math.cos(centerLat * Math.PI / 180));
  
  // Generate random angle and distance
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * radiusMiles;
  
  // Convert to lat/lon offset
  const latOffset = (distance * Math.cos(angle)) / 69;
  const lonOffset = (distance * Math.sin(angle)) / (69 * Math.cos(centerLat * Math.PI / 180));
  
  let lat = centerLat + latOffset;
  let lon = centerLon + lonOffset;
  
  // Verify it's within radius (more accurate check)
  const dist = haversineMiles(centerLat, centerLon, lat, lon);
  if (dist > radiusMiles) {
    // If outside, scale it down
    const scale = radiusMiles / dist;
    lat = centerLat + (lat - centerLat) * scale;
    lon = centerLon + (lon - centerLon) * scale;
  }
  
  return [lat, lon];
}

// Generate a random point within radius of a specific point
function randomPointNear(lat, lon, radiusMiles) {
  return randomPointInRadius(lat, lon, radiusMiles);
}

// Make HTTP request
function makeRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Create a repeater
async function createRepeater(id, name, lat, lon) {
  try {
    const url = `${SERVICE_HOST}/put-repeater`;
    await makeRequest(url, 'POST', {
      id: id,
      name: name,
      lat: lat,
      lon: lon
    });
    console.log(`✓ Created repeater ${id} (${name}) at [${lat.toFixed(4)}, ${lon.toFixed(4)}]`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to create repeater ${id}: ${error.message}`);
    return false;
  }
}

// Create a sample
async function createSample(lat, lon, path) {
  try {
    const url = `${SERVICE_HOST}/put-sample`;
    await makeRequest(url, 'POST', {
      lat: lat,
      lon: lon,
      path: path
    });
    return true;
  } catch (error) {
    console.error(`✗ Failed to create sample: ${error.message}`);
    return false;
  }
}

// Generate repeater ID (2 hex characters)
function generateRepeaterId(index) {
  const hex = index.toString(16).padStart(2, '0');
  return hex;
}

// Main function
async function main() {
  console.log('=== Test Data Generator ===');
  console.log(`Service: ${SERVICE_HOST}`);
  console.log(`Center: [${CENTER_LAT}, ${CENTER_LON}]`);
  console.log(`Repeaters: ${NUM_REPEATERS} (within ${REPEATER_RADIUS_MILES} miles)`);
  console.log(`Samples: ${NUM_SAMPLES} (within ${SAMPLE_RADIUS_MILES} miles of each repeater)`);
  console.log('');
  
  // Generate repeaters
  console.log('Generating repeaters...');
  const repeaters = [];
  
  for (let i = 0; i < NUM_REPEATERS; i++) {
    const [lat, lon] = randomPointInRadius(CENTER_LAT, CENTER_LON, REPEATER_RADIUS_MILES);
    const id = generateRepeaterId(i);
    const name = REPEATER_NAMES[i] || `Test Repeater ${id}`;
    
    const success = await createRepeater(id, name, lat, lon);
    if (success) {
      repeaters.push({ id, name, lat, lon });
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (repeaters.length === 0) {
    console.error('No repeaters created. Exiting.');
    process.exit(1);
  }
  
  console.log(`\nCreated ${repeaters.length} repeaters\n`);
  
  // Generate samples
  console.log('Generating samples...');
  let successCount = 0;
  let failCount = 0;
  
  // Distribute samples across repeaters
  const samplesPerRepeater = Math.floor(NUM_SAMPLES / repeaters.length);
  const remainder = NUM_SAMPLES % repeaters.length;
  
  for (let i = 0; i < repeaters.length; i++) {
    const repeater = repeaters[i];
    const count = samplesPerRepeater + (i < remainder ? 1 : 0);
    
    console.log(`  Generating ${count} samples near ${repeater.name} (${repeater.id})...`);
    
    for (let j = 0; j < count; j++) {
      const [lat, lon] = randomPointNear(repeater.lat, repeater.lon, SAMPLE_RADIUS_MILES);
      
      // Randomly decide if sample "heard" the repeater (80% chance)
      const heard = Math.random() > 0.2;
      const path = heard ? [repeater.id] : [];
      
      const success = await createSample(lat, lon, path);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Small delay
      if (j % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Repeaters created: ${repeaters.length}/${NUM_REPEATERS}`);
  console.log(`Samples created: ${successCount}/${NUM_SAMPLES}`);
  if (failCount > 0) {
    console.log(`Samples failed: ${failCount}`);
  }
  console.log('\nTest data generation complete!');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

