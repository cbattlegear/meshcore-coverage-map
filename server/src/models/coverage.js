const pool = require('../config/database');

async function getAll() {
  // Check if new columns exist, fallback to old schema if not
  let result;
  try {
    result = await pool.query(`
      SELECT 
        c.geohash,
        c.observed,
        c.heard,
        c.lost,
        c.snr,
        c.rssi,
        c.last_observed,
        c.last_heard,
        c.hit_repeaters,
        COALESCE(
          json_agg(
            json_build_object(
              'time', cs.sample_time, 
              'path', cs.sample_path, 
              'observed', cs.sample_observed,
              'snr', cs.sample_snr,
              'rssi', cs.sample_rssi
            )
            ORDER BY cs.sample_time
          ) FILTER (WHERE cs.sample_time IS NOT NULL),
          '[]'::json
        ) as values
      FROM coverage c
      LEFT JOIN coverage_samples cs ON c.geohash = cs.coverage_geohash
      GROUP BY c.geohash, c.observed, c.heard, c.lost, c.snr, c.rssi, c.last_observed, c.last_heard, c.hit_repeaters
      ORDER BY c.geohash
    `);
  } catch (error) {
    // Fallback to old schema if new columns don't exist
    if (error.code === '42703') { // column does not exist
      result = await pool.query(`
        SELECT 
          c.geohash,
          c.heard,
          c.lost,
          c.last_heard,
          c.hit_repeaters,
          COALESCE(
            json_agg(
              json_build_object('time', cs.sample_time, 'path', cs.sample_path)
              ORDER BY cs.sample_time
            ) FILTER (WHERE cs.sample_time IS NOT NULL),
            '[]'::json
          ) as values
        FROM coverage c
        LEFT JOIN coverage_samples cs ON c.geohash = cs.coverage_geohash
        GROUP BY c.geohash, c.heard, c.lost, c.last_heard, c.hit_repeaters
        ORDER BY c.geohash
      `);
    } else {
      throw error;
    }
  }
  
  return result.rows.map(row => {
    const lastHeard = row.last_heard ?? 0;
    const lastObserved = row.last_observed ?? lastHeard;
    return {
      hash: row.geohash,
      observed: row.observed ?? row.heard ?? 0,
      heard: row.heard ?? 0,
      lost: row.lost ?? 0,
      snr: row.snr ?? null,
      rssi: row.rssi ?? null,
      lastObserved: lastObserved,
      lastHeard: lastHeard,
      hitRepeaters: row.hit_repeaters ?? [],
      values: Array.isArray(row.values) ? row.values : []
    };
  });
}

async function getByGeohash(geohash) {
  let result;
  try {
    result = await pool.query(`
      SELECT 
        c.geohash,
        c.observed,
        c.heard,
        c.lost,
        c.snr,
        c.rssi,
        c.last_observed,
        c.last_heard,
        c.hit_repeaters,
        COALESCE(
          json_agg(
            json_build_object('time', cs.sample_time, 'path', cs.sample_path, 'observed', cs.sample_observed, 'snr', cs.sample_snr, 'rssi', cs.sample_rssi)
            ORDER BY cs.sample_time
          ) FILTER (WHERE cs.sample_time IS NOT NULL),
          '[]'::json
        ) as values
      FROM coverage c
      LEFT JOIN coverage_samples cs ON c.geohash = cs.coverage_geohash
      WHERE c.geohash = $1
      GROUP BY c.geohash, c.observed, c.heard, c.lost, c.snr, c.rssi, c.last_observed, c.last_heard, c.hit_repeaters
    `, [geohash]);
  } catch (error) {
    if (error.code === '42703') { // column does not exist
      result = await pool.query(`
        SELECT 
          c.geohash,
          c.heard,
          c.lost,
          c.last_heard,
          c.hit_repeaters,
          COALESCE(
            json_agg(
              json_build_object('time', cs.sample_time, 'path', cs.sample_path)
              ORDER BY cs.sample_time
            ) FILTER (WHERE cs.sample_time IS NOT NULL),
            '[]'::json
          ) as values
        FROM coverage c
        LEFT JOIN coverage_samples cs ON c.geohash = cs.coverage_geohash
        WHERE c.geohash = $1
        GROUP BY c.geohash, c.heard, c.lost, c.last_heard, c.hit_repeaters
      `, [geohash]);
    } else {
      throw error;
    }
  }
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  const lastHeard = row.last_heard || 0;
  const lastObserved = row.last_observed ?? lastHeard;
  return {
    hash: row.geohash,
    observed: row.observed ?? row.heard ?? 0,
    heard: row.heard || 0,
    lost: row.lost || 0,
    snr: row.snr ?? null,
    rssi: row.rssi ?? null,
    lastObserved: lastObserved,
    lastHeard: lastHeard,
    hitRepeaters: row.hit_repeaters || [],
    values: row.values || []
  };
}

async function mergeCoverage(geohash, samples, cutoffTime = 0) {
  // Start a transaction
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get existing coverage entry - try new schema first
    let existing;
    try {
      existing = await client.query(
        'SELECT observed, heard, lost, snr, rssi, last_observed, last_heard, hit_repeaters, updated_at FROM coverage WHERE geohash = $1',
        [geohash]
      );
    } catch (error) {
      if (error.code === '42703') { // column does not exist
        existing = await client.query(
          'SELECT heard, lost, last_heard, hit_repeaters, updated_at FROM coverage WHERE geohash = $1',
          [geohash]
        );
      } else {
        throw error;
      }
    }
    
    let observed = 0;
    let heard = 0;
    let lost = 0;
    let snr = null;
    let rssi = null;
    let lastObserved = 0;
    let lastHeard = 0;
    const hitRepeatersSet = new Set();
    
    // Initialize from existing if present
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      observed = row.observed ?? row.heard ?? 0;
      heard = row.heard || 0;
      lost = row.lost || 0;
      snr = row.snr ?? null;
      rssi = row.rssi ?? null;
      lastObserved = row.last_observed ?? row.last_heard ?? 0;
      lastHeard = row.last_heard || 0;
      (row.hit_repeaters || []).forEach(r => hitRepeatersSet.add(r.toLowerCase()));
      // Use updated_at as cutoff if provided, otherwise use cutoffTime parameter
      if (cutoffTime === 0 && row.updated_at) {
        cutoffTime = new Date(row.updated_at).getTime();
      }
    }
    
    // Consolidate new samples (only those after cutoffTime)
    const newSamples = samples.filter(s => {
      const sampleTime = s.metadata?.time || s.time || 0;
      return sampleTime > cutoffTime;
    });
    
    if (newSamples.length === 0) {
      await client.query('COMMIT');
      return;
    }
    
    // Build consolidated sample
    let uberTime = 0;
    let uberObserved = 0;
    let uberHeard = 0;
    let uberLost = 0;
    let uberSnr = null;
    let uberRssi = null;
    let uberLastObserved = 0;
    let uberLastHeard = 0;
    const uberRepeaters = [];
    
    for (const sample of newSamples) {
      const sampleTime = sample.metadata?.time || sample.time || 0;
      const path = sample.metadata?.path || sample.path || [];
      const observed = sample.metadata?.observed ?? (path.length > 0);
      
      uberTime = Math.max(uberTime, sampleTime);
      uberSnr = (uberSnr === null) ? (sample.metadata?.snr || sample.snr || null) : 
                ((sample.metadata?.snr || sample.snr) !== null ? Math.max(uberSnr, sample.metadata?.snr || sample.snr) : uberSnr);
      uberRssi = (uberRssi === null) ? (sample.metadata?.rssi || sample.rssi || null) : 
                 ((sample.metadata?.rssi || sample.rssi) !== null ? Math.max(uberRssi, sample.metadata?.rssi || sample.rssi) : uberRssi);
      
      if (observed) {
        uberObserved++;
        uberLastObserved = Math.max(uberLastObserved, sampleTime);
      }
      
      if (path.length > 0) {
        uberHeard++;
        uberLastHeard = Math.max(uberLastHeard, sampleTime);
      } else {
        uberLost++;
      }
      
      path.forEach(p => {
        const lower = p.toLowerCase();
        if (!uberRepeaters.includes(lower)) {
          uberRepeaters.push(lower);
        }
      });
    }
    
    // Insert consolidated sample into coverage_samples - try new schema first
    try {
      await client.query(`
        INSERT INTO coverage_samples (coverage_geohash, sample_time, sample_path, sample_observed, sample_snr, sample_rssi)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (coverage_geohash, sample_time)
        DO NOTHING
      `, [geohash, uberTime, uberRepeaters, uberObserved > 0, uberSnr, uberRssi]);
    } catch (error) {
      if (error.code === '42703') { // column does not exist
        await client.query(`
          INSERT INTO coverage_samples (coverage_geohash, sample_time, sample_path)
          VALUES ($1, $2, $3)
          ON CONFLICT (coverage_geohash, sample_time)
          DO NOTHING
        `, [geohash, uberTime, uberRepeaters]);
      } else {
        throw error;
      }
    }
    
    // Update coverage totals
    observed += uberObserved;
    heard += uberHeard;
    lost += uberLost;
    snr = (snr === null) ? uberSnr : ((uberSnr !== null) ? Math.max(snr, uberSnr) : snr);
    rssi = (rssi === null) ? uberRssi : ((uberRssi !== null) ? Math.max(rssi, uberRssi) : rssi);
    lastObserved = Math.max(lastObserved, uberLastObserved);
    lastHeard = Math.max(lastHeard, uberLastHeard);
    
    uberRepeaters.forEach(r => hitRepeatersSet.add(r));
    
    // Update or insert coverage - try new schema first
    try {
      await client.query(`
        INSERT INTO coverage (geohash, observed, heard, lost, snr, rssi, last_observed, last_heard, hit_repeaters)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (geohash)
        DO UPDATE SET
          observed = coverage.observed + EXCLUDED.observed,
          heard = coverage.heard + EXCLUDED.heard,
          lost = coverage.lost + EXCLUDED.lost,
          snr = CASE 
            WHEN EXCLUDED.snr IS NULL THEN coverage.snr
            WHEN coverage.snr IS NULL THEN EXCLUDED.snr
            ELSE GREATEST(EXCLUDED.snr, coverage.snr)
          END,
          rssi = CASE 
            WHEN EXCLUDED.rssi IS NULL THEN coverage.rssi
            WHEN coverage.rssi IS NULL THEN EXCLUDED.rssi
            ELSE GREATEST(EXCLUDED.rssi, coverage.rssi)
          END,
          last_observed = GREATEST(COALESCE(coverage.last_observed, 0), COALESCE(EXCLUDED.last_observed, 0)),
          last_heard = GREATEST(coverage.last_heard, EXCLUDED.last_heard),
          hit_repeaters = (
            SELECT ARRAY(
              SELECT DISTINCT unnest(ARRAY_CAT(coverage.hit_repeaters, EXCLUDED.hit_repeaters))
              ORDER BY 1
            )
          ),
          updated_at = CURRENT_TIMESTAMP
      `, [geohash, observed, heard, lost, snr, rssi, lastObserved, lastHeard, Array.from(hitRepeatersSet)]);
    } catch (error) {
      if (error.code === '42703') { // column does not exist
        await client.query(`
          INSERT INTO coverage (geohash, heard, lost, last_heard, hit_repeaters)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (geohash)
          DO UPDATE SET
            heard = coverage.heard + EXCLUDED.heard,
            lost = coverage.lost + EXCLUDED.lost,
            last_heard = GREATEST(coverage.last_heard, EXCLUDED.last_heard),
            hit_repeaters = (
              SELECT ARRAY(
                SELECT DISTINCT unnest(ARRAY_CAT(coverage.hit_repeaters, EXCLUDED.hit_repeaters))
                ORDER BY 1
              )
            ),
            updated_at = CURRENT_TIMESTAMP
        `, [geohash, heard, lost, lastHeard, Array.from(hitRepeatersSet)]);
      } else {
        throw error;
      }
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getRecentGeohashes(lookBackDays) {
  const cutoffTime = Date.now() - (lookBackDays * 24 * 60 * 60 * 1000);
  
  // Get from coverage table
  const coverageResult = await pool.query(
    'SELECT geohash FROM coverage WHERE last_heard >= $1',
    [cutoffTime]
  );
  
  const geohashes = new Set(coverageResult.rows.map(r => r.geohash));
  
  // Also get from samples (all samples are considered recent)
  const samplesResult = await pool.query(
    'SELECT DISTINCT LEFT(geohash, 6) as geohash FROM samples'
  );
  
  samplesResult.rows.forEach(r => geohashes.add(r.geohash));
  
  return Array.from(geohashes);
}

async function deleteByGeohash(geohash) {
  await pool.query('DELETE FROM coverage WHERE geohash = $1', [geohash]);
}

async function deduplicateValues(geohash) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get all samples for this coverage
    const samplesResult = await client.query(
      'SELECT sample_time, sample_path FROM coverage_samples WHERE coverage_geohash = $1 ORDER BY sample_time',
      [geohash]
    );
    
    // Group by time and take first path for each time
    const grouped = new Map();
    samplesResult.rows.forEach(row => {
      if (!grouped.has(row.sample_time)) {
        grouped.set(row.sample_time, row.sample_path);
      }
    });
    
    // Delete all and reinsert deduplicated
    await client.query(
      'DELETE FROM coverage_samples WHERE coverage_geohash = $1',
      [geohash]
    );
    
    for (const [time, path] of grouped.entries()) {
      await client.query(
        'INSERT INTO coverage_samples (coverage_geohash, sample_time, sample_path) VALUES ($1, $2, $3)',
        [geohash, time, path]
      );
    }
    
    // Recalculate metadata
    let heard = 0;
    let lost = 0;
    let lastHeard = 0;
    const hitRepeatersSet = new Set();
    
    for (const [time, path] of grouped.entries()) {
      const hasPath = path && path.length > 0;
      if (hasPath) {
        heard++;
      } else {
        lost++;
      }
      lastHeard = Math.max(lastHeard, time);
      if (path) {
        path.forEach(p => hitRepeatersSet.add(p.toLowerCase()));
      }
    }
    
    await client.query(
      'UPDATE coverage SET heard = $1, lost = $2, last_heard = $3, hit_repeaters = $4 WHERE geohash = $5',
      [heard, lost, lastHeard, Array.from(hitRepeatersSet), geohash]
    );
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getAll,
  getByGeohash,
  mergeCoverage,
  getRecentGeohashes,
  deleteByGeohash,
  deduplicateValues,
};

