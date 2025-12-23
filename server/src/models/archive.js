const pool = require('../config/database');

async function insert(geohash, time, path, observed = null, snr = null, rssi = null) {
  const normalizedObserved = observed ?? (path && path.length > 0);
  await pool.query(
    'INSERT INTO archive (geohash, time, path, observed, snr, rssi) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (geohash) DO NOTHING',
    [geohash, time, path, normalizedObserved, snr, rssi]
  );
}

async function getAll() {
  const result = await pool.query('SELECT geohash, time, path FROM archive ORDER BY geohash');
  return result.rows;
}

module.exports = {
  insert,
  getAll,
};

