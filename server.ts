import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory cache for NOAA responses (60s TTL)
interface CacheEntry {
  timestamp: number;
  data: any;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

// Curated verified active ocean buoy stations
export interface BuoyStation {
  id: string;
  name: string;
  location: string;
  lat: number;
  lon: number;
  depth?: string;
  description: string;
}

export const BUOY_STATIONS: BuoyStation[] = [
  {
    id: '46026',
    name: 'San Francisco Buoy',
    location: '18 NM West of San Francisco, CA',
    lat: 37.755,
    lon: -122.839,
    depth: '51.8 m',
    description: 'Central California shelf buoy monitoring Pacific swell heading toward the Bay Area.'
  },
  {
    id: '46059',
    name: 'California Offshore',
    location: '350 NM West of San Francisco, CA',
    lat: 38.047,
    lon: -129.970,
    depth: '4480 m',
    description: 'Deep ocean Pacific basin buoy capturing open ocean storms and massive groundswells.'
  },
  {
    id: '46042',
    name: 'Monterey Bay Buoy',
    location: '27 NM WNW of Monterey, CA',
    lat: 36.785,
    lon: -122.469,
    depth: '1980 m',
    description: 'Deep canyon edge buoy providing real-time sea conditions outside Monterey Bay.'
  },
  {
    id: '51001',
    name: 'NW Hawaii Buoy',
    location: '170 NM NW of Kauai, HI',
    lat: 24.455,
    lon: -162.015,
    depth: '3438 m',
    description: 'Critical North Shore swell indicator capturing large winter/equatorial Pacific wave trains.'
  },
  {
    id: '41002',
    name: 'South Hatteras Buoy',
    location: '225 NM East of Charleston, SC',
    lat: 31.761,
    lon: -74.836,
    depth: '3770 m',
    description: 'Atlantic Gulf Stream station monitoring hurricane swell and major nor’easters.'
  },
  {
    id: '44013',
    name: 'Boston Harbor Approach',
    location: '16 NM East of Boston, MA',
    lat: 42.346,
    lon: -70.651,
    depth: '61.6 m',
    description: 'Massachusetts Bay station detecting North Atlantic storms and winter sea conditions.'
  },
  {
    id: '44007',
    name: 'Portland Maine Buoy',
    location: '12 NM SE of Portland, ME',
    lat: 43.525,
    lon: -70.141,
    depth: '64.9 m',
    description: 'Gulf of Maine coastal station monitoring cold Atlantic swells.'
  },
  {
    id: '46005',
    name: 'Washington Offshore',
    location: '300 NM West of Aberdeen, WA',
    lat: 46.100,
    lon: -131.030,
    depth: '2780 m',
    description: 'Pacific Northwest deep-ocean buoy tracking heavy North Pacific storm systems.'
  },
  {
    id: '46214',
    name: 'Point Reyes (CDIP 029)',
    location: 'Offshore Point Reyes, CA',
    lat: 37.948,
    lon: -123.468,
    depth: '550 m',
    description: 'Scripps CDIP wave buoy providing high-resolution directional wave spectra.'
  },
  {
    id: '42001',
    name: 'Mid Gulf of Mexico',
    location: '180 NM South of SW Pass, LA',
    lat: 25.900,
    lon: -89.650,
    depth: '3246 m',
    description: 'Deep Gulf station tracking tropical depressions, storms, and southern wave dynamics.'
  }
];

// Helper to parse NDBC text data
function parseNdbcData(rawText: string, stationId: string) {
  const lines = rawText.trim().split('\n');
  if (lines.length < 3) {
    throw new Error('Insufficient observation data from station');
  }

  // Row 0 is header #YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE
  // Row 1 is units #yr mo dy hr mn ...
  // Rows 2+ are observations
  const header = lines[0].replace(/^#/, '').trim().split(/\s+/);
  const wvhtIndex = header.indexOf('WVHT');
  const dpdIndex = header.indexOf('DPD');
  const apdIndex = header.indexOf('APD');
  const wspdIndex = header.indexOf('WSPD');
  const wtmpIndex = header.indexOf('WTMP');

  const measurements: Array<{
    timestamp: string;
    value: number;
    unit: string;
    metric: string;
    dominantPeriod?: number | null;
    averagePeriod?: number | null;
    waterTemp?: number | null;
    windSpeed?: number | null;
  }> = [];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;

    const [year, month, day, hour, minute] = parts;
    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00Z`;

    if (wvhtIndex !== -1 && parts[wvhtIndex]) {
      const valStr = parts[wvhtIndex];
      if (valStr !== 'MM' && !isNaN(Number(valStr))) {
        const wvht = parseFloat(valStr);
        const dpd = dpdIndex !== -1 && parts[dpdIndex] !== 'MM' ? parseFloat(parts[dpdIndex]) : null;
        const apd = apdIndex !== -1 && parts[apdIndex] !== 'MM' ? parseFloat(parts[apdIndex]) : null;
        const wtmp = wtmpIndex !== -1 && parts[wtmpIndex] !== 'MM' ? parseFloat(parts[wtmpIndex]) : null;
        const wspd = wspdIndex !== -1 && parts[wspdIndex] !== 'MM' ? parseFloat(parts[wspdIndex]) : null;

        measurements.push({
          timestamp: isoDate,
          value: wvht,
          unit: 'm',
          metric: 'Significant Wave Height',
          dominantPeriod: isNaN(dpd as number) ? null : dpd,
          averagePeriod: isNaN(apd as number) ? null : apd,
          waterTemp: isNaN(wtmp as number) ? null : wtmp,
          windSpeed: isNaN(wspd as number) ? null : wspd
        });
      }
    }
  }

  // NOAA outputs newest first; sort oldest to newest for chronological plotting and detection
  measurements.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return measurements;
}

// Stations API
app.get('/api/ocean/stations', (req, res) => {
  res.json({
    stations: BUOY_STATIONS,
    source: 'NOAA National Data Buoy Center (NDBC)',
    homepage: 'https://www.ndbc.noaa.gov'
  });
});

// Single Buoy Observations API
app.get('/api/ocean/buoy/:stationId', async (req, res) => {
  const stationId = req.params.stationId.trim().toUpperCase();
  const cacheKey = `buoy_${stationId}`;

  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const response = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`, {
      headers: {
        'User-Agent': 'LiveEventsApp/1.0 (Public Data Visualizer)'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch NOAA buoy data for station ${stationId}: ${response.statusText}`,
        stationId,
        isUnavailable: true
      });
    }

    const rawText = await response.text();
    const measurements = parseNdbcData(rawText, stationId);

    const stationMeta = BUOY_STATIONS.find(s => s.id === stationId) || {
      id: stationId,
      name: `Buoy Station ${stationId}`,
      location: 'NOAA Marine Observation Station',
      lat: 0,
      lon: 0,
      description: 'Public observation station operated by NOAA / National Data Buoy Center.'
    };

    const latest = measurements.length > 0 ? measurements[measurements.length - 1] : null;
    let isDelayed = false;
    let lastUpdated = latest ? latest.timestamp : null;

    if (latest) {
      const ageHours = (now - new Date(latest.timestamp).getTime()) / (1000 * 60 * 60);
      // Buoy data usually updates every 10-60 min. If older than 3 hours, mark as delayed.
      if (ageHours > 3) {
        isDelayed = true;
      }
    } else {
      isDelayed = true;
    }

    const payload = {
      station: stationMeta,
      metric: 'Significant Wave Height',
      unit: 'm',
      dataSource: 'NOAA National Data Buoy Center',
      dataSourceUrl: `https://www.ndbc.noaa.gov/station_page.php?station=${stationId}`,
      fetchedAt: new Date().toISOString(),
      lastObservation: lastUpdated,
      isDelayed,
      isLive: !isDelayed,
      totalObservations: measurements.length,
      measurements
    };

    cache.set(cacheKey, { timestamp: now, data: payload });
    res.json(payload);
  } catch (error: any) {
    console.error(`Error fetching buoy ${stationId}:`, error.message);
    res.status(500).json({
      error: 'Network or parsing error connecting to NOAA NDBC',
      details: error.message,
      stationId,
      isUnavailable: true
    });
  }
});

// Real-time USGS Earthquake feed for architecture demonstration
app.get('/api/earthquakes', async (req, res) => {
  const cacheKey = 'earthquakes_summary';
  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
    if (!response.ok) {
      throw new Error(`USGS error: ${response.statusText}`);
    }
    const data = await response.json();
    const measurements = (data.features || []).map((f: any) => ({
      timestamp: new Date(f.properties.time).toISOString(),
      value: f.properties.mag,
      unit: 'M',
      metric: 'Earthquake Magnitude',
      place: f.properties.place,
      coordinates: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
      url: f.properties.url
    })).sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const payload = {
      dataSource: 'USGS Earthquake Hazards Program',
      dataSourceUrl: 'https://earthquake.usgs.gov',
      metric: 'Earthquake Magnitude',
      unit: 'M',
      measurements,
      fetchedAt: new Date().toISOString()
    };
    cache.set(cacheKey, { timestamp: now, data: payload });
    res.json(payload);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Live Buoy Duel Game: Active buoys summary endpoint with real NOAA data
app.get('/api/ocean/game/buoys', async (req, res) => {
  const cacheKey = 'game_buoys_summary';
  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < 45 * 1000) {
    return res.json(cached.data);
  }

  const results = await Promise.allSettled(
    BUOY_STATIONS.map(async (st) => {
      // Check individual cache first
      const stCacheKey = `buoy_${st.id}`;
      const stCached = cache.get(stCacheKey);
      if (stCached && now - stCached.timestamp < CACHE_TTL_MS && stCached.data.measurements?.length > 0) {
        const last = stCached.data.measurements[stCached.data.measurements.length - 1];
        return {
          id: st.id,
          name: st.name,
          location: st.location,
          lat: st.lat,
          lon: st.lon,
          depth: st.depth,
          description: st.description,
          waveHeight: last.value,
          unit: last.unit || 'm',
          dominantPeriod: last.dominantPeriod,
          windSpeed: last.windSpeed,
          waterTemp: last.waterTemp,
          timestamp: last.timestamp,
          sourceUrl: `https://www.ndbc.noaa.gov/station_page.php?station=${st.id}`
        };
      }

      // Otherwise fetch with 4s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${st.id}.txt`, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'LiveEventsApp/1.0 (Public Data Game)'
          }
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;
        const text = await response.text();
        const measurements = parseNdbcData(text, st.id);
        if (measurements.length === 0) return null;
        const last = measurements[measurements.length - 1];

        // Store back in individual cache too
        const payload = {
          station: st,
          metric: 'Significant Wave Height',
          unit: 'm',
          dataSource: 'NOAA National Data Buoy Center',
          dataSourceUrl: `https://www.ndbc.noaa.gov/station_page.php?station=${st.id}`,
          fetchedAt: new Date().toISOString(),
          lastObservation: last.timestamp,
          isDelayed: false,
          isLive: true,
          totalObservations: measurements.length,
          measurements
        };
        cache.set(stCacheKey, { timestamp: now, data: payload });

        return {
          id: st.id,
          name: st.name,
          location: st.location,
          lat: st.lat,
          lon: st.lon,
          depth: st.depth,
          description: st.description,
          waveHeight: last.value,
          unit: last.unit || 'm',
          dominantPeriod: last.dominantPeriod,
          windSpeed: last.windSpeed,
          waterTemp: last.waterTemp,
          timestamp: last.timestamp,
          sourceUrl: `https://www.ndbc.noaa.gov/station_page.php?station=${st.id}`
        };
      } catch {
        clearTimeout(timeoutId);
        return null;
      }
    })
  );

  const activeBuoys = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null && typeof r.value?.waveHeight === 'number')
    .map(r => r.value);

  const payload = {
    total: activeBuoys.length,
    fetchedAt: new Date().toISOString(),
    buoys: activeBuoys
  };

  if (activeBuoys.length > 0) {
    cache.set(cacheKey, { timestamp: now, data: payload });
  }

  res.json(payload);
});

// In-memory Global High Scores storage
interface LeaderboardEntry {
  id: string;
  name: string;
  streak: number;
  rankTitle: string;
  accuracy?: number;
  timestamp: string;
  countryCode?: string;
}

let globalHighScores: LeaderboardEntry[] = [
  { id: '1', name: 'Kai_Lenny_Fan', streak: 16, rankTitle: 'Mavericks Master', accuracy: 94, timestamp: new Date(Date.now() - 3600000 * 3).toISOString() },
  { id: '2', name: 'BuoyWhisperer', streak: 14, rankTitle: 'Mavericks Master', accuracy: 91, timestamp: new Date(Date.now() - 3600000 * 7).toISOString() },
  { id: '3', name: 'PipelineSwell', streak: 12, rankTitle: 'Mavericks Master', accuracy: 88, timestamp: new Date(Date.now() - 3600000 * 12).toISOString() },
  { id: '4', name: 'StormChaser_SF', streak: 10, rankTitle: 'Big Wave Rider', accuracy: 85, timestamp: new Date(Date.now() - 3600000 * 18).toISOString() },
  { id: '5', name: 'Nautilus99', streak: 9, rankTitle: 'Big Wave Rider', accuracy: 82, timestamp: new Date(Date.now() - 3600000 * 24).toISOString() },
  { id: '6', name: 'OceanicWaveKing', streak: 8, rankTitle: 'Big Wave Rider', accuracy: 80, timestamp: new Date(Date.now() - 3600000 * 28).toISOString() },
  { id: '7', name: 'HalfMoonBay_Surf', streak: 7, rankTitle: 'Offshore Navigator', accuracy: 78, timestamp: new Date(Date.now() - 3600000 * 32).toISOString() },
  { id: '8', name: 'DeepSeaEcho', streak: 6, rankTitle: 'Offshore Navigator', accuracy: 75, timestamp: new Date(Date.now() - 3600000 * 40).toISOString() },
  { id: '9', name: 'PointReyesEye', streak: 5, rankTitle: 'Offshore Navigator', accuracy: 72, timestamp: new Date(Date.now() - 3600000 * 48).toISOString() },
  { id: '10', name: 'PelicanCoast', streak: 4, rankTitle: 'Coastline Scout', accuracy: 70, timestamp: new Date(Date.now() - 3600000 * 54).toISOString() }
];

app.get('/api/game/leaderboard', (req, res) => {
  const top10 = [...globalHighScores]
    .sort((a, b) => b.streak - a.streak || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);
  res.json({
    total: globalHighScores.length,
    leaderboard: top10
  });
});

app.post('/api/game/leaderboard', (req, res) => {
  const { name, streak, rankTitle, accuracy } = req.body;
  if (!name || typeof streak !== 'number' || streak <= 0) {
    return res.status(400).json({ error: 'Invalid score submission. Name and streak > 0 are required.' });
  }

  const sanitizedName = String(name).trim().slice(0, 20) || 'Anonymous Navigator';
  const newEntry: LeaderboardEntry = {
    id: `score_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: sanitizedName,
    streak: Math.min(Math.floor(streak), 100),
    rankTitle: rankTitle || 'Ocean Navigator',
    accuracy: typeof accuracy === 'number' ? Math.round(accuracy) : undefined,
    timestamp: new Date().toISOString()
  };

  globalHighScores.push(newEntry);
  globalHighScores.sort((a, b) => b.streak - a.streak || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  // Keep top 50 in memory
  if (globalHighScores.length > 50) {
    globalHighScores = globalHighScores.slice(0, 50);
  }

  const top10 = globalHighScores.slice(0, 10);
  const playerRank = top10.findIndex(e => e.id === newEntry.id) + 1;

  res.json({
    success: true,
    entry: newEntry,
    playerRank: playerRank > 0 ? playerRank : null,
    leaderboard: top10
  });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LIVE EVENTS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
