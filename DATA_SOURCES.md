# Data Sources Analysis: MQTT vs Wardrive App

## Overview

This document analyzes the two primary data sources for the coverage map: the MQTT scraper and the wardrive web app.

## Data Flow Comparison

### MQTT Scraper (`mqtt-scraper/wardrive-mqtt.py`)

**Source**: Passive monitoring of MQTT broker (e.g., `mqtt-us-v1.letsmesh.net`) that receives packets from fixed mesh observers.

**Data Collected**:

1. **Samples** (from GROUP_MSG packets, type 5):
   - `lat`, `lon` - from decrypted #wardrive channel messages
   - `path` - first repeater in packet path
   - `observed: True` - always set to True
   - **NO `snr` or `rssi`** - not available from MQTT packets
   - **Filter**: Only processes messages from `watched_observers` config (e.g., "OHMC Repeater", "Ruth Bader Ginsburg", "Nullrouten observer")
   - **Channel**: Only processes #wardrive channel (hash `e0`)

2. **Repeaters** (from ADVERT packets, type 4):
   - `id` - first 2 hex chars of public key
   - `name` - from ADV packet name field
   - `lat`, `lon` - from ADV packet location
   - **This is the PRIMARY automated source of repeater data** - wardrive app does not collect repeaters automatically
   - Note: There is also a manual admin interface (`addRepeater.html`) for manually adding repeaters

### Wardrive App (`server/public/content/wardrive.js`)

**Source**: Direct BLE connection to user's MeshCore device, user-initiated pings.

**Data Collected**:

1. **Samples** (from user pings):
   - `lat`, `lon` - from device GPS
   - `path` - only if repeat was heard (repeater that repeated the message)
   - `observed: true` - only if repeat was heard
   - `snr` - from repeat data (if available and not mobile repeater)
   - `rssi` - from repeat data (if available and not mobile repeater)
   - **User-initiated**: Requires active user participation

## Key Differences

| Feature | MQTT Scraper | Wardrive App |
|---------|-------------|--------------|
| **Repeater Data** | ✅ YES (only source) | ❌ NO |
| **Sample SNR/RSSI** | ❌ NO | ✅ YES (if repeat heard) |
| **Passive Monitoring** | ✅ YES (fixed observers) | ❌ NO (user-initiated) |
| **Coverage Scope** | Fixed observer locations | Mobile user locations |
| **Data Completeness** | Always `observed: True` | Conditional (only if repeat heard) |

## Critical Finding

**MQTT is REQUIRED for automated repeater discovery** - The wardrive app does not automatically collect repeater information. Repeaters are primarily discovered through ADVERT packets processed by the MQTT scraper. There is also a manual admin interface (`addRepeater.html`) for manually adding repeaters, but this is not automated.

## Recommendations

1. **Keep MQTT for repeaters**: Essential - no other source provides repeater data
2. **MQTT samples are redundant IF**: 
   - All users use wardrive app
   - You don't need passive monitoring from fixed observers
   - You don't need samples without SNR/RSSI

3. **MQTT samples are valuable IF**:
   - You want broader coverage from fixed observers
   - You want to capture samples even when users aren't actively using the app
   - You want historical data from observers that were running before wardrive app existed

## Conclusion

**MQTT cannot be fully removed** because it's the only source of repeater data. However, if you only need samples from active wardrive app users, you could potentially disable the GROUP_MSG handling in the MQTT scraper and only process ADVERT packets (repeaters).

## Implementation Notes

- MQTT scraper processes two packet types:
  - Type 4 (ADVERT): Repeater discovery - **REQUIRED**
  - Type 5 (GROUP_MSG): Sample collection - **OPTIONAL** (if wardrive app provides all samples)

- Wardrive app only sends samples via `/put-sample` endpoint
- Wardrive app does NOT send repeater data via `/put-repeater` endpoint

