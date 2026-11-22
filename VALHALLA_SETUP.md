# UBus — Valhalla Local Development Setup Guide

This guide documents the local development infrastructure for the **Valhalla Routing Engine** used by UBus to generate real road-following route geometries in Dhaka, Bangladesh.

---

## 1. Overview & Architecture

* **Primary Engine**: Valhalla (C++ routing engine with native `bus` costing profile).
* **Role in UBus**: Provides road graph snapping and geometry preview for the Visual Route Builder.
* **Separation of Concerns**: This engine is used strictly during **administrative route planning**. It is never invoked during live GPS telemetry ingestion (`record_driver_gps`) or commuter bus tracking.
* **License**: MIT (permissive, open-source, university-friendly).

---

## 2. Resource Requirements (Estimates)

* **Disk Storage**: ~1.0 GB to 1.5 GB
  - Raw Bangladesh OSM PBF: ~340 MB
  - Valhalla routing tiles: ~600 MB
* **RAM**:
  - Initial Tile Build: ~2.0 GB to 3.0 GB
  - Runtime Memory: ~1.0 GB to 1.8 GB
* **CPU**: 2+ cores recommended for initial tile processing (~5–10 minutes on modern CPUs).

---

## 3. Quick Start (Docker Compose)

### Step 1: Create Data Directory
```bash
mkdir -p custom_valhalla_data
```

### Step 2: Download Bangladesh OSM Extract (Geofabrik)
Download the latest OpenStreetMap extract for Bangladesh:
```bash
# Direct download from Geofabrik (~340 MB)
curl -o custom_valhalla_data/bangladesh-latest.osm.pbf https://download.geofabrik.de/asia/bangladesh-latest.osm.pbf
```

### Step 3: Start the Valhalla Container
```bash
docker compose -f docker-compose.valhalla.yml up -d
```
On first launch, the container detects `bangladesh-latest.osm.pbf`, parses the road network with bus access rules, and builds the routing tile graph. You can monitor the build progress via:
```bash
docker logs -f ubus-valhalla-dev
```
When build is complete, the log will output:
```text
INFO: Server started on port 8002
```

### Step 4: Verify the Service
```bash
curl http://localhost:8002/status
```
Expected response:
```json
{"version":"3.4.0","tiles_version":"3.4.0"}
```

### Step 5: Test a Route Query in Dhaka
```bash
curl -X POST http://localhost:8002/route \
  -H "Content-Type: application/json" \
  -d '{
    "locations": [
      {"lat": 23.7265, "lon": 90.3982},
      {"lat": 23.8103, "lon": 90.4125}
    ],
    "costing": "bus",
    "directions_options": {"units": "kilometers"}
  }'
```

---

## 4. Configuring UBus Backend

Add or update the following environment variables in `backend/.env`:

```env
# Valhalla routing engine URL
VALHALLA_URL=http://localhost:8002
VALHALLA_TIMEOUT=10.0
ROUTING_PROVIDER=valhalla
THROTTLE_ROUTING_RATE=30/minute
```

If the Valhalla service is offline or unreachable, the UBus backend gracefully returns HTTP `503 Service Unavailable` with a clean error message, preserving all client-side schematic geometry.

---

## 5. Stopping the Service
```bash
docker compose -f docker-compose.valhalla.yml down
```
Tiles saved in `./custom_valhalla_data` persist across container restarts, so subsequent startups take only 2–3 seconds without rebuilding the graph.

---

## 6. Automated Testing Without Docker
The automated test suite (`backend/schedules/tests_routing.py`) uses mocked HTTP responses and does **not** require a running Valhalla instance or an internet connection.
