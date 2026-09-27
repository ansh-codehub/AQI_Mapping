import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MapContainer, TileLayer, ImageOverlay, GeoJSON, CircleMarker, Popup, useMap} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {Wind, Map as MapIcon, Activity, Layers3, LocateFixed, RefreshCw} from 'lucide-react';
import './styles.css';

const API='http://localhost:8000';
const seasons=['Pre-Monsoon','Monsoon','Post-Monsoon','Winter'];
const pollutants=['NO2','SO2','CO','SAQI'];
const units={NO2:'mol/m²',SO2:'mol/m²',CO:'mol/m²',SAQI:'Index'};
const labels={NO2:'Nitrogen Dioxide',SO2:'Sulfur Dioxide',CO:'Carbon Monoxide',SAQI:'Satellite AQI'};
const center=[28.6139,77.2090];

function FitDelhi({boundary}){const map=useMap(); useEffect(()=>{if(boundary){const layer=L.geoJSON(boundary); map.fitBounds(layer.getBounds(),{padding:[20,20]});}},[boundary,map]); return null}
function MapResize(){const map=useMap(); useEffect(()=>{setTimeout(()=>map.invalidateSize(),100)},[map]); return null}

function App(){
 const [season,setSeason]=useState('Winter'); const [pollutant,setPollutant]=useState('SAQI');
 const [boundary,setBoundary]=useState(null); const [stations,setStations]=useState([]); const [summary,setSummary]=useState(null); const [raster,setRaster]=useState(null); const [rasterBounds,setRasterBounds]=useState(null); const [selected,setSelected]=useState(null); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 const load=async()=>{setLoading(true);setError(''); try{const [b,s,sm]=await Promise.all([fetch(`${API}/api/boundary`).then(r=>r.json()),fetch(`${API}/api/stations?season=${encodeURIComponent(season)}`).then(r=>r.json()),fetch(`${API}/api/summary?season=${encodeURIComponent(season)}&pollutant=${pollutant}`).then(r=>r.json())]); setBoundary(b);setStations(s.stations);setSummary(sm); const rr=await fetch(`${API}/api/raster?season=${encodeURIComponent(season)}&pollutant=${pollutant}`); const blob=await rr.blob(); setRaster(URL.createObjectURL(blob)); const bounds=rr.headers.get('X-Bounds').split(',').map(Number); setRasterBounds([[bounds[1],bounds[0]],[bounds[3],bounds[2]]]);}catch(e){setError('Backend is not running. Start FastAPI on port 8000.')}finally{setLoading(false)}};
 useEffect(()=>{load();},[season,pollutant]); useEffect(()=>()=>{if(raster)URL.revokeObjectURL(raster)},[raster]);
 const selectedStation=useMemo(()=>stations.find(s=>s.id===selected)||null,[stations,selected]);
 const format=v=>v==null?'—':Number(v).toFixed(6);
 return <div className="app">
   <header className="top"><div className="brand"><div className="brandIcon"><Wind size={20}/></div><div><h1>Delhi Air Quality Mapping</h1><span>Satellite Remote Sensing Dashboard</span></div></div><div className="status"><span className="dot"/> QGIS-free web application</div></header>
   <main className="layout">
    <aside className="sidebar">
      <section><div className="sectionTitle"><Layers3 size={15}/> MAP LAYERS</div><div className="pollutants">{pollutants.map(p=><button key={p} className={pollutant===p?'active':''} onClick={()=>setPollutant(p)}><span className={`swatch ${p.toLowerCase()}`}/><span><b>{p}</b><small>{labels[p]}</small></span></button>)}</div></section>
      <section><div className="sectionTitle"><Activity size={15}/> SEASON</div><div className="seasonGrid">{seasons.map(s=><button key={s} className={season===s?'selected':''} onClick={()=>setSeason(s)}>{s}</button>)}</div></section>
      <section className="stationSection"><div className="sectionTitle"><LocateFixed size={15}/> MONITORING STATION</div><select value={selected??''} onChange={e=>setSelected(e.target.value===''?null:Number(e.target.value))}><option value="">Select a station...</option>{stations.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></section>
      {selectedStation && <div className="stationCard"><div className="stationName">{selectedStation.name}</div><div className="agency">{selectedStation.agency || 'Monitoring station'}</div><div className="metrics"><Metric n="NO₂" v={selectedStation.no2}/><Metric n="SO₂" v={selectedStation.so2}/><Metric n="CO" v={selectedStation.co}/><Metric n="SAQI" v={selectedStation.saqi}/></div><div className="coords">{selectedStation.latitude.toFixed(5)}, {selectedStation.longitude.toFixed(5)}</div></div>}
      <button className="refresh" onClick={load}><RefreshCw size={15}/> Refresh data</button>
    </aside>
    <section className="mapPanel">
      <div className="mapHeader"><div><span className="eyebrow">CURRENT VIEW</span><h2>{labels[pollutant]} <em>·</em> {season}</h2></div><div className="summary"><span>Average</span><strong>{summary?.mean==null?'—':format(summary.mean)}</strong><small>{units[pollutant]} · {summary?.count||0} stations</small></div></div>
      <div className="mapWrap">{error&&<div className="error">{error}</div>}<MapContainer center={center} zoom={10} scrollWheelZoom className="map"><MapResize/><FitDelhi boundary={boundary}/><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{raster&&rasterBounds&&<ImageOverlay url={raster} bounds={rasterBounds} opacity={0.62}/>} {boundary&&<GeoJSON data={boundary} style={{color:'#ff7a45',weight:2,fillOpacity:0.04}}/>}{stations.map(s=><CircleMarker key={s.id} center={[s.latitude,s.longitude]} radius={selected===s.id?7:4} pathOptions={{color:'#fff',weight:1,fillColor:selected===s.id?'#ff7a45':'#f59e0b',fillOpacity:.95}} eventHandlers={{click:()=>setSelected(s.id)}}><Popup><b>{s.name}</b><br/>NO₂: {format(s.no2)}<br/>SO₂: {format(s.so2)}<br/>CO: {format(s.co)}<br/>SAQI: {format(s.saqi)}</Popup></CircleMarker>)}</MapContainer><div className="legend"><b>{pollutant}</b><div className="gradient"/><div className="legendRow"><span>Low</span><span>High</span></div></div>{loading&&<div className="loading">Loading spatial data…</div>}</div>
    </section>
   </main>
 </div>
}
function Metric({n,v}){return <div><span>{n}</span><b>{v==null?'—':Number(v).toFixed(6)}</b></div>}
createRoot(document.getElementById('root')).render(<App/>);
