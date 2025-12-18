const cron = require('node-cron');
const samplesModel = require('../models/samples');
const repeatersModel = require('../models/repeaters');
const coverageModel = require('../models/coverage');
const archiveModel = require('../models/archive');
const { ageInDays, posFromHash, isValidLocation, haversineMiles } = require('../utils/shared');

// Get configuration from environment variables
const CONSOLIDATE_ENABLED = process.env.CONSOLIDATE_ENABLED !== 'false';
const CONSOLIDATE_SCHEDULE = process.env.CONSOLIDATE_SCHEDULE || '0 2 * * *'; // Daily at 2 AM
const CONSOLIDATE_MAX_AGE_DAYS = parseInt(process.env.CONSOLIDATE_MAX_AGE_DAYS) || 14; // 2 weeks default

const CLEANUP_ENABLED = process.env.CLEANUP_ENABLED !== 'false';
const CLEANUP_SCHEDULE = process.env.CLEANUP_SCHEDULE || '0 3 * * 0'; // Weekly on Sunday at 3 AM

// Consolidate old samples into coverage
async function runConsolidate() {
  if (!CONSOLIDATE_ENABLED) {
    console.log('Consolidate task is disabled');
    return;
  }

  console.log(`[Maintenance] Starting consolidate (maxAge: ${CONSOLIDATE_MAX_AGE_DAYS} days)`);
  
  try {
    const result = {
      coverage_entites_to_update: 0,
      samples_to_update: 0,
      merged_ok: 0,
      merged_fail: 0,
      archive_ok: 0,
      archive_fail: 0,
      delete_ok: 0,
      delete_fail: 0,
      delete_skip: 0
    };
    
    // Get old samples
    const oldSamples = await samplesModel.getOlderThan(CONSOLIDATE_MAX_AGE_DAYS);
    result.samples_to_update = oldSamples.length;
    
    if (oldSamples.length === 0) {
      console.log('[Maintenance] No samples to consolidate');
      return;
    }
    
    // Group by 6-char geohash
    const hashToSamples = new Map();
    oldSamples.forEach(sample => {
      const coverageHash = sample.geohash.substring(0, 6);
      if (!hashToSamples.has(coverageHash)) {
        hashToSamples.set(coverageHash, []);
      }
      hashToSamples.get(coverageHash).push({
        key: sample.geohash,
        time: sample.time,
        path: sample.path || []
      });
    });
    
    result.coverage_entites_to_update = hashToSamples.size;
    const mergedKeys = [];
    
    // Merge into coverage
    for (const [geohash, samples] of hashToSamples.entries()) {
      try {
        await coverageModel.mergeCoverage(geohash, samples);
        result.merged_ok++;
        mergedKeys.push(geohash);
      } catch (e) {
        console.log(`[Maintenance] Merge failed for ${geohash}. ${e}`);
        result.merged_fail++;
      }
    }
    
    // Archive and delete
    for (const geohash of mergedKeys) {
      const samples = hashToSamples.get(geohash);
      for (const sample of samples) {
        try {
          await archiveModel.insert(sample.key, sample.time, sample.path);
          result.archive_ok++;
          
          try {
            await samplesModel.deleteByGeohash(sample.key);
            result.delete_ok++;
          } catch (e) {
            console.log(`[Maintenance] Delete failed for ${sample.key}. ${e}`);
            result.delete_fail++;
          }
        } catch (e) {
          console.log(`[Maintenance] Archive failed for ${sample.key}. ${e}`);
          result.archive_fail++;
          result.delete_skip++;
        }
      }
    }
    
    console.log(`[Maintenance] Consolidate completed:`, result);
  } catch (error) {
    console.error('[Maintenance] Consolidate error:', error);
  }
}

// Clean up stale repeaters
async function runCleanupRepeaters() {
  if (!CLEANUP_ENABLED) {
    console.log('Cleanup task is disabled');
    return;
  }

  console.log('[Maintenance] Starting repeater cleanup');
  
  try {
    const result = {
      deleted_stale_repeaters: 0,
      deleted_dupe_repeaters: 0
    };
    
    // Delete stale repeaters (>10 days)
    const deletedStale = await repeatersModel.deleteStale(10);
    result.deleted_stale_repeaters = deletedStale;
    
    // Deduplicate by location (keep newest)
    const allRepeaters = await repeatersModel.getAll();
    const byId = new Map();
    
    allRepeaters.keys.forEach(r => {
      const id = r.metadata.id;
      if (!byId.has(id)) {
        byId.set(id, []);
      }
      byId.get(id).push(r);
    });
    
    // Group by location overlap
    for (const [id, repeaters] of byId.entries()) {
      const groups = groupByOverlap(repeaters);
      
      for (const group of groups) {
        if (group.items.length > 1) {
          // Keep newest, delete others
          const sorted = group.items.sort((a, b) => 
            b.metadata.time - a.metadata.time
          );
          
          for (let i = 1; i < sorted.length; i++) {
            const item = sorted[i];
            const nameParts = item.name.split('|');
            const lat = parseFloat(nameParts[1]);
            const lon = parseFloat(nameParts[2]);
            await repeatersModel.deleteByIdLatLon(id, lat, lon);
            result.deleted_dupe_repeaters++;
          }
        }
      }
    }
    
    console.log(`[Maintenance] Cleanup completed:`, result);
  } catch (error) {
    console.error('[Maintenance] Cleanup error:', error);
  }
}

function groupByOverlap(items) {
  const groups = [];
  
  for (const item of items) {
    const nameParts = item.name.split('|');
    const lat = parseFloat(nameParts[1]);
    const lon = parseFloat(nameParts[2]);
    const loc = [lat, lon];
    let found = false;
    
    for (const group of groups) {
      if (overlaps(group.loc, loc)) {
        group.items.push(item);
        found = true;
        break;
      }
    }
    
    if (!found) {
      groups.push({
        id: item.metadata.id,
        loc: loc,
        items: [item]
      });
    }
  }
  
  return groups;
}

function overlaps(a, b) {
  const dist = haversineMiles(a, b);
  return dist <= 0.25; // 1/4 mile
}

// Initialize scheduled tasks
function initializeScheduledTasks() {
  // Consolidate task
  if (CONSOLIDATE_ENABLED) {
    console.log(`[Maintenance] Scheduling consolidate task: ${CONSOLIDATE_SCHEDULE} (maxAge: ${CONSOLIDATE_MAX_AGE_DAYS} days)`);
    cron.schedule(CONSOLIDATE_SCHEDULE, runConsolidate, {
      scheduled: true,
      timezone: "America/Los_Angeles"
    });
  }
  
  // Cleanup task
  if (CLEANUP_ENABLED) {
    console.log(`[Maintenance] Scheduling cleanup task: ${CLEANUP_SCHEDULE}`);
    cron.schedule(CLEANUP_SCHEDULE, runCleanupRepeaters, {
      scheduled: true,
      timezone: "America/Los_Angeles"
    });
  }
}

module.exports = {
  initializeScheduledTasks,
  runConsolidate,
  runCleanupRepeaters
};

