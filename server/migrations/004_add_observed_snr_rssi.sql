-- Add observed, snr, rssi fields to support new data model

-- Add fields to samples table
ALTER TABLE samples 
  ADD COLUMN IF NOT EXISTS observed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS snr INTEGER,
  ADD COLUMN IF NOT EXISTS rssi INTEGER;

-- Add fields to coverage table
ALTER TABLE coverage
  ADD COLUMN IF NOT EXISTS observed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snr INTEGER,
  ADD COLUMN IF NOT EXISTS rssi INTEGER,
  ADD COLUMN IF NOT EXISTS last_observed BIGINT;

-- Add fields to coverage_samples table
ALTER TABLE coverage_samples
  ADD COLUMN IF NOT EXISTS sample_observed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sample_snr INTEGER,
  ADD COLUMN IF NOT EXISTS sample_rssi INTEGER;

-- Add fields to archive table
ALTER TABLE archive
  ADD COLUMN IF NOT EXISTS observed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS snr INTEGER,
  ADD COLUMN IF NOT EXISTS rssi INTEGER;

-- Create index for observed queries
CREATE INDEX IF NOT EXISTS idx_samples_observed ON samples (observed);
CREATE INDEX IF NOT EXISTS idx_coverage_observed ON coverage (observed);

