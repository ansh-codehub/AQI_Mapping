from pathlib import Path
import io
import math

import geopandas as gpd
import numpy as np
import rasterio

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from PIL import Image


# ============================================================
# PATHS / CONFIG
# ============================================================

BASE = Path(__file__).resolve().parent / "data"

SEASONS = {
    "Pre-Monsoon": "Pre_Monsoon",
    "Monsoon": "Monsoon",
    "Post-Monsoon": "Post_Monsoon",
    "Winter": "Winter",
}

POLLUTANTS = {
    "NO2",
    "SO2",
    "CO",
    "SAQI",
}

UNITS = {
    "NO2": "mol/m²",
    "SO2": "mol/m²",
    "CO": "mol/m²",
    "SAQI": "Index",
}


# ============================================================
# STATION FIELD MAPPING
# ============================================================

FIELD_MAP = {
    "Pre-Monsoon": {
        "NO2": "PreMonso_1",
        "SO2": "PreMonso_3",
        "CO": "PreMonsoon",
    },
    "Monsoon": {
        "NO2": "Monsoon_NO",
        "SO2": "Monsoon_SO",
        "CO": "Monsoon_CO",
    },
    "Post-Monsoon": {
        "NO2": "PostMons_1",
        "SO2": "PostMons_3",
        "CO": "PostMonsoo",
    },
    "Winter": {
        "NO2": "Winter_NO2",
        "SO2": "Winter_SO2",
        "CO": "Winter_CO",
    },
}


# ============================================================
# RASTER FILE MAPPING
# ============================================================

RASTER_FIELD = {
    "Pre-Monsoon": {
        "NO2": "Delhi_NO2_Pre_Monsoon.tif",
        "SO2": "Delhi_SO2_Pre_Monsoon.tif",
        "CO": "Delhi_CO_Pre_Monsoon.tif",
        "SAQI": "Delhi_SAQI_Pre_Monsoon.tif",
    },

    "Monsoon": {
        "NO2": "Delhi_NO2_Monsoon.tif",
        "SO2": "Delhi_SO2_Monsoon.tif",
        "CO": "Delhi_CO_Monsoon.tif",
        "SAQI": "Delhi_SAQI_Monsoon.tif",
    },

    "Post-Monsoon": {
        "NO2": "Delhi_NO2_Post_Monsoon.tif",
        "SO2": "Delhi_SO2_Post_Monsoon.tif",
        "CO": "Delhi_CO_Post_Monsoon.tif",
        "SAQI": "Delhi_SAQI_Post_Monsoon.tif",
    },

    "Winter": {
        "NO2": "Delhi_NO2_Winter.tif",
        "SO2": "Delhi_SO2_Winter.tif",
        "CO": "Delhi_CO_Winter.tif",
        "SAQI": "Delhi_SAQI_Winter.tif",
    },
}


# ============================================================
# FASTAPI APP
# ============================================================

app = FastAPI(
    title="Delhi Air Quality Mapping API",
    version="1.0.0",
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,

    # Vite frontend
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],

    allow_credentials=False,

    allow_methods=[
        "GET",
        "POST",
        "OPTIONS",
    ],

    allow_headers=["*"],

    # IMPORTANT:
    # Frontend needs to read these raster headers.
    expose_headers=[
        "X-Bounds",
        "X-Min",
        "X-Max",
    ],
)


# ============================================================
# LOAD GIS DATA
# ============================================================

stations_path = (
    BASE
    / "Qgis_DATA"
    / "Delhi_NCT_stations.shp"
)

boundary_path = (
    BASE
    / "Qgis_DATA"
    / "Delhi_Boundary.shp"
)


try:
    stations = gpd.read_file(
        stations_path
    ).to_crs(4326)

    boundary = gpd.read_file(
        boundary_path
    ).to_crs(4326)

except Exception as e:
    print("ERROR loading GIS data:")
    print(e)
    raise


# ============================================================
# HELPERS
# ============================================================

def clean_value(value):
    """
    Convert a value to a finite float.
    Return None for invalid values.
    """

    try:
        value = float(value)

        if math.isfinite(value):
            return value

        return None

    except (TypeError, ValueError):
        return None


def raster_path(
    season: str,
    pollutant: str
):
    """
    Return the raster path for a season + pollutant.
    """

    if season not in SEASONS:
        raise HTTPException(
            status_code=400,
            detail="Invalid season",
        )

    if pollutant not in POLLUTANTS:
        raise HTTPException(
            status_code=400,
            detail="Invalid pollutant",
        )

    return (
        BASE
        / SEASONS[season]
        / RASTER_FIELD[season][pollutant]
    )


def sample_raster(
    path,
    lon: float,
    lat: float,
):
    """
    Sample one raster value at longitude/latitude.
    """

    if not path.exists():
        return None

    try:

        with rasterio.open(path) as src:

            sample_lon = lon
            sample_lat = lat

            # Reproject point if raster isn't EPSG:4326
            if (
                src.crs
                and str(src.crs) != "EPSG:4326"
            ):

                from rasterio.warp import transform

                xs, ys = transform(
                    "EPSG:4326",
                    src.crs,
                    [lon],
                    [lat],
                )

                sample_lon = xs[0]
                sample_lat = ys[0]

            value = next(
                src.sample(
                    [
                        (
                            sample_lon,
                            sample_lat,
                        )
                    ]
                )
            )[0]

            # Handle raster NoData
            if src.nodata is not None:

                if np.isclose(
                    value,
                    src.nodata,
                ):
                    return None

            return clean_value(value)

    except Exception as e:

        print(
            f"Raster sampling error: {e}"
        )

        return None


# ============================================================
# STATION RECORD
# ============================================================

def station_record(
    row,
    season: str,
):

    geom = row.geometry

    lon = float(geom.x)
    lat = float(geom.y)

    station_id = (
        row.get("station_id")
        or row.name
    )

    station_name = (
        row.get("station_na")
        or row.get("station_id")
        or f"Station {row.name}"
    )

    agency = (
        row.get("agency")
        or ""
    )

    result = {
        "id": int(row.name),

        "station_id": str(
            station_id
        ),

        "name": str(
            station_name
        ),

        "agency": str(
            agency
        ),

        "latitude": lat,
        "longitude": lon,
    }

    # Station pollutant values
    for pollutant in (
        "NO2",
        "SO2",
        "CO",
    ):

        field = FIELD_MAP[
            season
        ][pollutant]

        result[
            pollutant.lower()
        ] = clean_value(
            row.get(field)
        )

    # SAQI from raster
    result["saqi"] = sample_raster(
        raster_path(
            season,
            "SAQI",
        ),
        lon,
        lat,
    )

    return result


# ============================================================
# HEALTH
# ============================================================

@app.get("/api/health")
def health():

    return {
        "status": "ok",
        "qgis_required": False,
    }


# ============================================================
# CONFIG
# ============================================================

@app.get("/api/config")
def config():

    return {
        "seasons": list(SEASONS.keys()),
        "pollutants": list(POLLUTANTS),
        "units": UNITS,
    }


# ============================================================
# DELHI BOUNDARY
# ============================================================

@app.get("/api/boundary")
def get_boundary():

    return boundary.__geo_interface__


# ============================================================
# MONITORING STATIONS
# ============================================================

@app.get("/api/stations")
def get_stations(
    season: str = Query("Winter"),
):

    if season not in SEASONS:

        raise HTTPException(
            status_code=400,
            detail="Invalid season",
        )

    records = [
        station_record(
            row,
            season,
        )
        for _, row
        in stations.iterrows()
    ]

    return {
        "season": season,
        "count": len(records),
        "stations": records,
    }


# ============================================================
# SUMMARY
# ============================================================

@app.get("/api/summary")
def summary(
    season: str = Query("Winter"),
    pollutant: str = Query("SAQI"),
):

    if season not in SEASONS:

        raise HTTPException(
            status_code=400,
            detail="Invalid season",
        )

    if pollutant not in POLLUTANTS:

        raise HTTPException(
            status_code=400,
            detail="Invalid pollutant",
        )

    values = []

    # SAQI comes from raster
    if pollutant == "SAQI":

        raster = raster_path(
            season,
            pollutant,
        )

        with rasterio.open(raster) as src:

            for _, row in stations.iterrows():

                value = sample_raster(
                    raster,
                    float(row.geometry.x),
                    float(row.geometry.y),
                )

                if value is not None:
                    values.append(value)

    # NO2 / SO2 / CO come from station fields
    else:

        field = FIELD_MAP[
            season
        ][pollutant]

        values = [
            clean_value(value)
            for value
            in stations[field].tolist()
        ]

        values = [
            value
            for value in values
            if value is not None
        ]

    return {
        "season": season,
        "pollutant": pollutant,
        "unit": UNITS[pollutant],
        "count": len(values),

        "mean": (
            float(np.mean(values))
            if values
            else None
        ),

        "min": (
            float(np.min(values))
            if values
            else None
        ),

        "max": (
            float(np.max(values))
            if values
            else None
        ),
    }


# ============================================================
# RASTER IMAGE
# ============================================================

@app.get("/api/raster")
def get_raster(
    season: str = Query("Winter"),
    pollutant: str = Query("SAQI"),
):

    path = raster_path(
        season,
        pollutant,
    )

    if not path.exists():

        raise HTTPException(
            status_code=404,
            detail=f"Raster not found: {path.name}",
        )

    try:

        with rasterio.open(path) as src:

            # ------------------------------------------------
            # READ AS MASKED ARRAY
            # ------------------------------------------------

            raster = src.read(
                1,
                masked=True,
            )

            arr = raster.astype(
                "float32"
            ).filled(np.nan)

            # ------------------------------------------------
            # VALID PIXELS
            # ------------------------------------------------

            validmask = np.isfinite(
                arr
            )

            valid = arr[
                validmask
            ]

            if valid.size == 0:

                raise HTTPException(
                    status_code=500,
                    detail="Raster contains no valid pixels",
                )

            # ------------------------------------------------
            # VISUALIZATION RANGE
            # ------------------------------------------------

            if pollutant == "SAQI":

                lo = 0.0
                hi = 100.0

            else:

                lo = float(
                    np.percentile(
                        valid,
                        2,
                    )
                )

                hi = float(
                    np.percentile(
                        valid,
                        98,
                    )
                )

                if hi <= lo:

                    lo = float(
                        valid.min()
                    )

                    hi = float(
                        valid.max()
                    )

            # ------------------------------------------------
            # NORMALIZE
            # ------------------------------------------------

            scaled = np.zeros_like(
                arr,
                dtype=np.float32,
            )

            scaled[validmask] = (
                arr[validmask] - lo
            ) / max(
                hi - lo,
                1e-12,
            )

            scaled = np.clip(
                scaled,
                0.0,
                1.0,
            )

            # ------------------------------------------------
            # COLOR PALETTE
            # ------------------------------------------------

            stops = np.array(
                [
                    [33, 102, 172],
                    [67, 170, 207],
                    [255, 235, 59],
                    [244, 109, 67],
                    [178, 24, 43],
                ],
                dtype=np.float32,
            )

            # ------------------------------------------------
            # COLOR INTERPOLATION
            # ------------------------------------------------

            pos = (
                scaled
                * (len(stops) - 1)
            )

            i0 = np.floor(
                pos
            ).astype(
                np.int32
            )

            i0 = np.clip(
                i0,
                0,
                len(stops) - 1,
            )

            i1 = np.clip(
                i0 + 1,
                0,
                len(stops) - 1,
            )

            frac = (
                pos - i0
            )

            rgb = (
                stops[i0]
                * (
                    1
                    - frac[..., None]
                )
                +
                stops[i1]
                * frac[..., None]
            )

            # ------------------------------------------------
            # RGBA IMAGE
            # ------------------------------------------------

            rgba = np.zeros(
                (
                    src.height,
                    src.width,
                    4,
                ),
                dtype=np.uint8,
            )

            # Only valid pixels receive colors
            rgba[
                ...,
                0:3
            ][validmask] = (
                rgb[
                    validmask
                ].astype(
                    np.uint8
                )
            )

            # Valid pixels = semi-transparent
            rgba[
                ...,
                3
            ][validmask] = 205

            # NoData stays completely transparent
            rgba[
                ...,
                3
            ][~validmask] = 0

            # ------------------------------------------------
            # PNG
            # ------------------------------------------------

            image = Image.fromarray(
                rgba,
                "RGBA",
            )

            buffer = io.BytesIO()

            image.save(
                buffer,
                format="PNG",
                optimize=True,
            )

            # ------------------------------------------------
            # RESPONSE
            # ------------------------------------------------

            return Response(
                content=buffer.getvalue(),
                media_type="image/png",

                headers={
                    "X-Bounds": (
                        f"{src.bounds.left},"
                        f"{src.bounds.bottom},"
                        f"{src.bounds.right},"
                        f"{src.bounds.top}"
                    ),

                    "X-Min": str(lo),

                    "X-Max": str(hi),

                    "Cache-Control":
                        "public, max-age=3600",
                },
            )

    except HTTPException:
        raise

    except Exception as e:

        print(
            "RASTER ERROR:",
            repr(e),
        )

        raise HTTPException(
            status_code=500,
            detail=f"Raster processing failed: {e}",
        )


# ============================================================
# POINT QUERY
# ============================================================

@app.get("/api/point")
def point(
    lon: float,
    lat: float,
    season: str = Query("Winter"),
    pollutant: str = Query("SAQI"),
):

    if season not in SEASONS:

        raise HTTPException(
            status_code=400,
            detail="Invalid season",
        )

    if pollutant not in POLLUTANTS:

        raise HTTPException(
            status_code=400,
            detail="Invalid pollutant",
        )

    value = sample_raster(
        raster_path(
            season,
            pollutant,
        ),
        lon,
        lat,
    )

    return {
        "longitude": lon,
        "latitude": lat,
        "season": season,
        "pollutant": pollutant,
        "unit": UNITS[pollutant],
        "value": value,
    }