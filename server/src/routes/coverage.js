const express = require('express');
const router = express.Router();
const coverageModel = require('../models/coverage');

// GET /get-coverage
router.get('/get-coverage', async (req, res, next) => {
  try {
    const coverage = await coverageModel.getAll();
    
    // Format response to match Cloudflare format
    const formatted = coverage.map(c => {
      const lastHeard = c.lastHeard || 0;
      const lastObserved = c.lastObserved || lastHeard;
      const updated = c.updated || lastHeard;
      
      return {
        hash: c.hash,
        observed: c.observed ?? c.heard ?? 0,
        heard: c.heard ?? 0,
        lost: c.lost ?? 0,
        snr: c.snr ?? null,
        rssi: c.rssi ?? null,
        updated: updated,
        lastObserved: lastObserved,
        lastHeard: lastHeard,
        hitRepeaters: c.hitRepeaters ?? [],
        values: c.values || []
      };
    });
    
    res.json(formatted);
  } catch (error) {
    next(error);
  }
});

// GET /get-wardrive-coverage
router.get('/get-wardrive-coverage', async (req, res, next) => {
  try {
    const LOOK_BACK_DAYS = 3;
    const geohashes = await coverageModel.getRecentGeohashes(LOOK_BACK_DAYS);
    res.json(geohashes);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

