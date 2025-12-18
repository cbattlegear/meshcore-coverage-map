const express = require('express');
const router = express.Router();
const coverageModel = require('../models/coverage');
const samplesModel = require('../models/samples');
const repeatersModel = require('../models/repeaters');
const { truncateTime } = require('../utils/shared');

// GET /get-nodes
router.get('/get-nodes', async (req, res, next) => {
  try {
    const [coverage, samples, repeaters] = await Promise.all([
      coverageModel.getAll(),
      samplesModel.getAll(),
      repeatersModel.getAll()
    ]);
    
    // Aggregate samples by 6-character geohash prefix
    const sampleAggregates = new Map(); // geohash prefix -> { total, heard, lastTime, repeaters: Set }
    
    samples.keys.forEach(s => {
      const prefix = s.name.substring(0, 6); // 6-char geohash prefix
      const heard = s.metadata.path && s.metadata.path.length > 0;
      const time = s.metadata.time || 0;
      const path = s.metadata.path || [];
      
      if (!sampleAggregates.has(prefix)) {
        sampleAggregates.set(prefix, {
          total: 0,
          heard: 0,
          lastTime: 0,
          repeaters: new Set()
        });
      }
      
      const agg = sampleAggregates.get(prefix);
      agg.total++;
      if (heard) agg.heard++;
      if (time > agg.lastTime) agg.lastTime = time;
      
      // Track which repeaters were hit
      path.forEach(repeaterId => {
        agg.repeaters.add(repeaterId);
      });
    });
    
    // Convert aggregates to array format
    const aggregatedSamples = Array.from(sampleAggregates.entries()).map(([id, agg]) => {
      const item = {
        id: id,
        total: agg.total,
        heard: agg.heard,
        lost: agg.total - agg.heard,
        successRate: agg.total > 0 ? (agg.heard / agg.total) : 0,
        time: truncateTime(agg.lastTime),
      };
      
      // Include repeaters if any were hit
      if (agg.repeaters.size > 0) {
        item.rptr = Array.from(agg.repeaters).sort();
      }
      
      return item;
    });
    
    const responseData = {
      coverage: coverage.map(c => {
        const item = {
          id: c.hash,
          rcv: c.heard || 0,
          lost: c.lost || 0,
          time: truncateTime(c.lastHeard || 0),
        };
        
        if (c.hitRepeaters && c.hitRepeaters.length > 0) {
          item.rptr = c.hitRepeaters;
        }
        
        return item;
      }),
      samples: aggregatedSamples,
      repeaters: repeaters.keys.map(r => ({
        time: truncateTime(r.metadata.time),
        id: r.metadata.id,
        name: r.metadata.name,
        lat: r.metadata.lat,
        lon: r.metadata.lon,
        elev: Math.round(r.metadata.elev || 0),
      }))
    };
    
    res.json(responseData);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

