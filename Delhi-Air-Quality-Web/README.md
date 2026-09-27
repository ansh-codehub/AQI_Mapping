# Delhi Air Quality Mapping — QGIS-free Web Application

This is a web version of the supplied Delhi Air Quality Mapping project. **QGIS is not required at runtime.** The original GeoTIFF and station/boundary data are consumed directly by a FastAPI backend and rendered in a React + Leaflet frontend.

## Stack
- Backend: FastAPI, GeoPandas, Rasterio, NumPy, Pillow
- Frontend: React, Vite, Leaflet, React-Leaflet
- Data: the original seasonal GeoTIFFs and Shapefiles from the supplied project

## Run backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```
Backend: https://aqi-mapping-api.onrender.com

## Run frontend
In another terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the URL Vite prints, normally http://localhost:5173.

## What changed from the QGIS version
- Removed all `qgis.PyQt`, `qgis.core`, and `qgis.gui` dependencies.
- Raster sampling is performed by Rasterio.
- Boundary and station data are read with GeoPandas.
- Seasonal raster layers are converted to transparent PNG overlays by the API.
- Leaflet displays the raster, Delhi boundary, and stations in the browser.
- Station pollutant fields are explicitly mapped for each season instead of relying on QGIS field aliases.
- SAQI is sampled from the selected season's SAQI raster at station coordinates, matching the original dashboard behavior.
