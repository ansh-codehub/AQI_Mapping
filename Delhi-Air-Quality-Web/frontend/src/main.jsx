import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  GeoJSON,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Wind,
  Activity,
  Layers3,
  LocateFixed,
  RefreshCw,
} from 'lucide-react';
import './styles.css';

/* =========================================================
   API CONFIG
========================================================= */

const API = 'https://aqi-mapping-api.onrender.com';

const seasons = [
  'Pre-Monsoon',
  'Monsoon',
  'Post-Monsoon',
  'Winter',
];

const pollutants = [
  'NO2',
  'SO2',
  'CO',
  'SAQI',
];

const units = {
  NO2: 'mol/m²',
  SO2: 'mol/m²',
  CO: 'mol/m²',
  SAQI: 'Index',
};

const labels = {
  NO2: 'Nitrogen Dioxide',
  SO2: 'Sulfur Dioxide',
  CO: 'Carbon Monoxide',
  SAQI: 'Satellite AQI',
};

const center = [28.6139, 77.2090];

/* =========================================================
   MAP HELPERS
========================================================= */

function FitDelhi({ boundary }) {
  const map = useMap();

  useEffect(() => {
    if (!boundary) return;

    try {
      const layer = L.geoJSON(boundary);
      const bounds = layer.getBounds();

      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [20, 20],
        });
      }
    } catch (error) {
      console.error('Boundary error:', error);
    }
  }, [boundary, map]);

  return null;
}

function MapResize() {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => clearTimeout(timer);
  }, [map]);

  return null;
}

/* =========================================================
   MAIN APP
========================================================= */

function App() {
  const [season, setSeason] = useState('Winter');
  const [pollutant, setPollutant] = useState('SAQI');

  const [boundary, setBoundary] = useState(null);
  const [stations, setStations] = useState([]);
  const [summary, setSummary] = useState(null);

  const [raster, setRaster] = useState(null);
  const [rasterBounds, setRasterBounds] = useState(null);

  const [selected, setSelected] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* =========================================================
     API HELPER
  ========================================================= */

  const getJSON = async (url) => {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `${response.status} ${response.statusText} - ${url}`
      );
    }

    return response.json();
  };

  /* =========================================================
     LOAD DATA
  ========================================================= */

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      console.log('Loading data...');
      console.log('API:', API);
      console.log('Season:', season);
      console.log('Pollutant:', pollutant);

      /* ---------------------------------------------
         Load boundary, stations and summary
      --------------------------------------------- */

      const [boundaryData, stationData, summaryData] =
        await Promise.all([
          getJSON(`${API}/api/boundary`),

          getJSON(
            `${API}/api/stations?season=${encodeURIComponent(season)}`
          ),

          getJSON(
            `${API}/api/summary?season=${encodeURIComponent(
              season
            )}&pollutant=${encodeURIComponent(pollutant)}`
          ),
        ]);

      /* ---------------------------------------------
         Validate station response
      --------------------------------------------- */

      if (!stationData || !Array.isArray(stationData.stations)) {
        throw new Error(
          'Invalid station response from backend.'
        );
      }

      /* ---------------------------------------------
         Update state
      --------------------------------------------- */

      setBoundary(boundaryData);
      setStations(stationData.stations);
      setSummary(summaryData);

      /* ---------------------------------------------
         Load raster
      --------------------------------------------- */

      const rasterUrl =
        `${API}/api/raster?season=${encodeURIComponent(
          season
        )}&pollutant=${encodeURIComponent(pollutant)}`;

      const rasterResponse = await fetch(rasterUrl);

      if (!rasterResponse.ok) {
        throw new Error(
          `${rasterResponse.status} ${rasterResponse.statusText} - Raster API`
        );
      }

      /* ---------------------------------------------
         Read raster bounds
      --------------------------------------------- */

      const boundsHeader =
        rasterResponse.headers.get('X-Bounds');

      if (!boundsHeader) {
        throw new Error(
          'X-Bounds header is missing from raster response.'
        );
      }

      const bounds = boundsHeader
        .split(',')
        .map(Number);

      if (
        bounds.length !== 4 ||
        bounds.some((value) => Number.isNaN(value))
      ) {
        throw new Error(
          `Invalid X-Bounds header: ${boundsHeader}`
        );
      }

      /* ---------------------------------------------
         Create raster blob URL
      --------------------------------------------- */

      const blob = await rasterResponse.blob();

      const rasterObjectUrl =
        URL.createObjectURL(blob);

      setRaster((previousRaster) => {
        if (previousRaster) {
          URL.revokeObjectURL(previousRaster);
        }

        return rasterObjectUrl;
      });

      setRasterBounds([
        [bounds[1], bounds[0]],
        [bounds[3], bounds[2]],
      ]);

      console.log('Spatial data loaded successfully.');

    } catch (e) {
      console.error('API ERROR:', e);

      setError(
        `API Error: ${e.message || 'Unknown error'}`
      );

      /* Clear old data when request fails */
      setBoundary(null);
      setStations([]);
      setSummary(null);
      setRasterBounds(null);

    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     LOAD WHEN SEASON / POLLUTANT CHANGES
  ========================================================= */

  useEffect(() => {
    load();
  }, [season, pollutant]);

  /* =========================================================
     CLEANUP RASTER URL
  ========================================================= */

  useEffect(() => {
    return () => {
      if (raster) {
        URL.revokeObjectURL(raster);
      }
    };
  }, [raster]);

  /* =========================================================
     SELECTED STATION
  ========================================================= */

  const selectedStation = useMemo(() => {
    return (
      stations.find(
        (station) => station.id === selected
      ) || null
    );
  }, [stations, selected]);

  /* =========================================================
     FORMAT NUMBER
  ========================================================= */

  const format = (value) => {
    if (value == null || Number.isNaN(Number(value))) {
      return '—';
    }

    return Number(value).toFixed(6);
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="app">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <header className="top">

        <div className="brand">

          <div className="brandIcon">
            <Wind size={20} />
          </div>

          <div>
            <h1>
              Delhi Air Quality Mapping
            </h1>

            <span>
              Satellite Remote Sensing Dashboard
            </span>
          </div>

        </div>

        <div className="status">
          <span className="dot" />
          QGIS-free web application
        </div>

      </header>

      {/* =====================================================
          MAIN LAYOUT
      ===================================================== */}

      <main className="layout">

        {/* ===================================================
            SIDEBAR
        =================================================== */}

        <aside className="sidebar">

          {/* ===============================================
              MAP LAYERS
          =============================================== */}

          <section>

            <div className="sectionTitle">
              <Layers3 size={15} />
              MAP LAYERS
            </div>

            <div className="pollutants">

              {pollutants.map((p) => (

                <button
                  key={p}
                  className={
                    pollutant === p
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setPollutant(p)
                  }
                >

                  <span
                    className={`swatch ${p.toLowerCase()}`}
                  />

                  <span>

                    <b>{p}</b>

                    <small>
                      {labels[p]}
                    </small>

                  </span>

                </button>

              ))}

            </div>

          </section>

          {/* ===============================================
              SEASON
          =============================================== */}

          <section>

            <div className="sectionTitle">
              <Activity size={15} />
              SEASON
            </div>

            <div className="seasonGrid">

              {seasons.map((s) => (

                <button
                  key={s}
                  className={
                    season === s
                      ? 'selected'
                      : ''
                  }
                  onClick={() =>
                    setSeason(s)
                  }
                >
                  {s}
                </button>

              ))}

            </div>

          </section>

          {/* ===============================================
              MONITORING STATION
          =============================================== */}

          <section className="stationSection">

            <div className="sectionTitle">
              <LocateFixed size={15} />
              MONITORING STATION
            </div>

            <select
              value={selected ?? ''}
              onChange={(e) =>
                setSelected(
                  e.target.value === ''
                    ? null
                    : Number(e.target.value)
                )
              }
            >

              <option value="">
                Select a station...
              </option>

              {stations.map((station) => (

                <option
                  key={station.id}
                  value={station.id}
                >
                  {station.name}
                </option>

              ))}

            </select>

          </section>

          {/* ===============================================
              SELECTED STATION CARD
          =============================================== */}

          {selectedStation && (

            <div className="stationCard">

              <div className="stationName">
                {selectedStation.name}
              </div>

              <div className="agency">
                {selectedStation.agency ||
                  'Monitoring station'}
              </div>

              <div className="metrics">

                <Metric
                  n="NO₂"
                  v={selectedStation.no2}
                />

                <Metric
                  n="SO₂"
                  v={selectedStation.so2}
                />

                <Metric
                  n="CO"
                  v={selectedStation.co}
                />

                <Metric
                  n="SAQI"
                  v={selectedStation.saqi}
                />

              </div>

              <div className="coords">

                {Number(
                  selectedStation.latitude
                ).toFixed(5)}

                {', '}

                {Number(
                  selectedStation.longitude
                ).toFixed(5)}

              </div>

            </div>

          )}

          {/* ===============================================
              REFRESH BUTTON
          =============================================== */}

          <button
            className="refresh"
            onClick={load}
            disabled={loading}
          >

            <RefreshCw
              size={15}
              className={
                loading
                  ? 'spin'
                  : ''
              }
            />

            {loading
              ? 'Loading...'
              : 'Refresh data'}

          </button>

        </aside>

        {/* =================================================
            MAP PANEL
        ================================================= */}

        <section className="mapPanel">

          {/* ===============================================
              MAP HEADER
          =============================================== */}

          <div className="mapHeader">

            <div>

              <span className="eyebrow">
                CURRENT VIEW
              </span>

              <h2>
                {labels[pollutant]}

                <em> · </em>

                {season}
              </h2>

            </div>

            <div className="summary">

              <span>
                Average
              </span>

              <strong>
                {summary?.mean == null
                  ? '—'
                  : format(summary.mean)}
              </strong>

              <small>
                {units[pollutant]} ·{' '}
                {summary?.count || 0}{' '}
                stations
              </small>

            </div>

          </div>

          {/* ===============================================
              MAP
          =============================================== */}

          <div className="mapWrap">

            {error && (

              <div className="error">
                {error}
              </div>

            )}

            <MapContainer
              center={center}
              zoom={10}
              scrollWheelZoom={true}
              className="map"
            >

              <MapResize />

              <FitDelhi
                boundary={boundary}
              />

              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* =========================================
                  RASTER OVERLAY
              ========================================= */}

              {raster &&
                rasterBounds && (

                  <ImageOverlay
                    url={raster}
                    bounds={rasterBounds}
                    opacity={0.62}
                  />

                )}

              {/* =========================================
                  DELHI BOUNDARY
              ========================================= */}

              {boundary && (

                <GeoJSON
                  data={boundary}
                  style={{
                    color: '#ff7a45',
                    weight: 2,
                    fillOpacity: 0.04,
                  }}
                />

              )}

              {/* =========================================
                  MONITORING STATIONS
              ========================================= */}

              {stations.map((station) => (

                <CircleMarker
                  key={station.id}
                  center={[
                    Number(station.latitude),
                    Number(station.longitude),
                  ]}
                  radius={
                    selected === station.id
                      ? 7
                      : 4
                  }
                  pathOptions={{
                    color: '#fff',
                    weight: 1,
                    fillColor:
                      selected === station.id
                        ? '#ff7a45'
                        : '#f59e0b',
                    fillOpacity: 0.95,
                  }}
                  eventHandlers={{
                    click: () =>
                      setSelected(
                        station.id
                      ),
                  }}
                >

                  <Popup>

                    <b>
                      {station.name}
                    </b>

                    <br />

                    NO₂:{' '}
                    {format(station.no2)}

                    <br />

                    SO₂:{' '}
                    {format(station.so2)}

                    <br />

                    CO:{' '}
                    {format(station.co)}

                    <br />

                    SAQI:{' '}
                    {format(station.saqi)}

                  </Popup>

                </CircleMarker>

              ))}

            </MapContainer>

            {/* =============================================
                LEGEND
            ============================================= */}

            <div className="legend">

              <b>
                {pollutant}
              </b>

              <div className="gradient" />

              <div className="legendRow">

                <span>
                  Low
                </span>

                <span>
                  High
                </span>

              </div>

            </div>

            {/* =============================================
                LOADING
            ============================================= */}

            {loading && (

              <div className="loading">
                Loading spatial data…
              </div>

            )}

          </div>

        </section>

      </main>

    </div>
  );
}

/* =========================================================
   METRIC COMPONENT
========================================================= */

function Metric({ n, v }) {
  return (
    <div>

      <span>
        {n}
      </span>

      <b>
        {v == null ||
        Number.isNaN(Number(v))
          ? '—'
          : Number(v).toFixed(6)}
      </b>

    </div>
  );
}

/* =========================================================
   ROOT
========================================================= */

createRoot(
  document.getElementById('root')
).render(
  <App />
);