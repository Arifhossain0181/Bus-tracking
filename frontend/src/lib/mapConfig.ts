/**
 * Centralized Map Configuration for UBus (Pilot Standardization).
 *
 * Primary Engine: MapLibre GL JS (v6.x)
 * Primary Tile & Style Provider: OpenFreeMap Liberty (Vector Tiles, 100% Free, BSD/MIT/ODbL)
 * Secondary Fallback Provider: MapLibre DemoTiles / Carto Positron
 *
 * Satellite Imagery Status:
 * Unauthorized Google Satellite tile scraping (mt0-mt3) has been strictly excised.
 * Unauthenticated Esri ArcGIS World Imagery is NOT compliant with Esri production licensing terms.
 * Satellite layers are explicitly disabled for the pilot to eliminate legal and licensing liability
 * and minimize mobile bandwidth consumption on student devices.
 */

export const PILOT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const PILOT_MAP_BRIGHT_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
export const PILOT_MAP_DARK_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
export const PILOT_MAP_FALLBACK_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

// Satellite layer toggle: safely disabled for pilot operations
export const SATELLITE_IMAGERY_ENABLED = false;

// Attribution: OpenStreetMap contributors + OpenFreeMap
export const PILOT_MAP_ATTRIBUTION = '© OpenStreetMap contributors, OpenFreeMap';

// Standard IUBAT Permanent Campus coordinates: [longitude, latitude] for MapLibre
export const IUBAT_CAMPUS_CENTER: [number, number] = [90.3896, 23.8878];

// Mobile performance defaults
export const DEFAULT_CAMERA_PITCH = 0; // Flat 2D view by default (saves GPU memory & mobile battery)
export const ISOMETRIC_CAMERA_PITCH = 58; // Optional 3D view tilt
export const DEFAULT_MAP_ZOOM = 16.5;

// Admin Route Builder (Leaflet) raster tile endpoint
// Isolated for compliance audit. Standard OSM raster server for non-production authoring.
export const ADMIN_MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const ADMIN_MAP_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
