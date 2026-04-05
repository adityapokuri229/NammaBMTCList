import json
import math
import os
from functools import lru_cache
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# ── INIT ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Namma BMTC API",
    description="Open REST API for Bengaluru's BMTC bus network — routes, stops, and more.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── LOAD DATA ─────────────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(BASE_DIR, "routes.json"), encoding="utf-8") as f:
    RAW_ROUTES: dict = json.load(f)

with open(os.path.join(BASE_DIR, "locations.json"), encoding="utf-8") as f:
    STOPS_LOC: dict = json.load(f)  # { stop_name: [lat, lng] }

# Case-insensitive stop name lookup → canonical name
STOPS_LOOKUP: dict[str, str] = {name.lower(): name for name in STOPS_LOC}

# Normalize: every route value becomes a list of variants
ROUTES: dict[str, list[dict]] = {}
for key, val in RAW_ROUTES.items():
    ROUTES[key] = val if isinstance(val, list) else [val]

ALL_KEYS = sorted(ROUTES.keys(), key=lambda x: x)

# ── CATEGORY LOGIC ────────────────────────────────────────────────────────────

CATEGORY_META = {
    "mf":      {"label": "Metro Feeder",  "color": "#eab308"},
    "airport": {"label": "Airport",       "color": "#06b6d4"},
    "radial":  {"label": "Radial",        "color": "#f97316"},
    "orbital": {"label": "Orbital",       "color": "#6366f1"},
    "express": {"label": "Express",       "color": "#ef4444"},
    "general": {"label": "General",       "color": "#34d399"},
}

def get_category(key: str) -> str:
    n = key.upper()
    if n.startswith("MF"):                                         return "mf"
    if n.startswith("KIA"):                                        return "airport"
    if n.startswith("G"):                                          return "radial"
    if n.startswith("500") or n.startswith("C") or n.startswith("K"): return "orbital"
    if n.startswith("EX"):                                         return "express"
    return "general"

# ── HELPERS ───────────────────────────────────────────────────────────────────

def route_summary(key: str) -> dict:
    variants = ROUTES[key]
    primary = variants[0]
    return {
        "route_id":      key,
        "name":          primary["name"],
        "category":      get_category(key),
        "stops_count":   len(primary.get("stops", [])),
        "variants_count": len(variants),
    }

def route_detail(key: str) -> dict:
    variants = ROUTES[key]
    return {
        "route_id":  key,
        "category":  get_category(key),
        "variants": [
            {
                "variant_index": i,
                "name":  v["name"],
                "stops": v.get("stops", []),
                "stops_count": len(v.get("stops", [])),
            }
            for i, v in enumerate(variants)
        ],
    }

def haversine_m(lat1, lng1, lat2, lng2) -> float:
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# ── HEALTH / META ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["Meta"])
def health():
    return {"status": "ok"}

@app.get("/stats", tags=["Meta"])
def stats():
    counts = {}
    for k in ALL_KEYS:
        c = get_category(k)
        counts[c] = counts.get(c, 0) + 1
    return {
        "total_routes": len(ALL_KEYS),
        "total_stops":  len(STOPS_LOC),
        "routes_with_variants": sum(1 for k in ALL_KEYS if len(ROUTES[k]) > 1),
        "by_category":  counts,
    }

# ── CATEGORIES ────────────────────────────────────────────────────────────────

@app.get("/categories", tags=["Categories"])
def list_categories():
    counts = {}
    for k in ALL_KEYS:
        c = get_category(k)
        counts[c] = counts.get(c, 0) + 1
    return [
        {"category_id": cid, **meta, "route_count": counts.get(cid, 0)}
        for cid, meta in CATEGORY_META.items()
    ]

@app.get("/categories/{category_id}/routes", tags=["Categories"])
def routes_by_category(
    category_id: str,
    page:  int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    if category_id not in CATEGORY_META:
        raise HTTPException(404, f"Category '{category_id}' not found. Valid: {list(CATEGORY_META)}")
    filtered = [k for k in ALL_KEYS if get_category(k) == category_id]
    start = (page - 1) * limit
    return {
        "category":    category_id,
        "total":       len(filtered),
        "page":        page,
        "limit":       limit,
        "routes":      [route_summary(k) for k in filtered[start:start+limit]],
    }

# ── ROUTES ────────────────────────────────────────────────────────────────────

@app.get("/routes", tags=["Routes"])
def list_routes(
    category: Optional[str] = None,
    page:     int = Query(1, ge=1),
    limit:    int = Query(50, ge=1, le=200),
):
    keys = ALL_KEYS
    if category:
        if category not in CATEGORY_META:
            raise HTTPException(400, f"Invalid category. Valid: {list(CATEGORY_META)}")
        keys = [k for k in keys if get_category(k) == category]
    start = (page - 1) * limit
    return {
        "total": len(keys),
        "page":  page,
        "limit": limit,
        "routes": [route_summary(k) for k in keys[start:start+limit]],
    }

@app.get("/routes/search", tags=["Routes"])
def search_routes(
    q:        str = Query(..., min_length=1),
    category: Optional[str] = None,
    limit:    int = Query(20, ge=1, le=100),
):
    q_clean = q.lower().replace("-", "").replace(" ", "")
    results = []
    for k in ALL_KEYS:
        if category and get_category(k) != category:
            continue
        if q_clean in k.lower().replace("-", "").replace(" ", ""):
            results.append(k); continue
        name = ROUTES[k][0]["name"]
        if q_clean in name.lower().replace(" ", ""):
            results.append(k)
    return {
        "query":   q,
        "total":   len(results),
        "routes":  [route_summary(k) for k in results[:limit]],
    }

@app.get("/routes/between", tags=["Routes"])
def routes_between(
    from_stop: str = Query(..., alias="from"),
    to_stop:   str = Query(..., alias="to"),
):
    """Find all routes that pass through both stops in order."""
    from_l = from_stop.lower()
    to_l   = to_stop.lower()
    matches = []
    for k in ALL_KEYS:
        for v in ROUTES[k]:
            stops = [s.lower() for s in v.get("stops", [])]
            if from_l in stops and to_l in stops:
                fi = stops.index(from_l)
                ti = stops.index(to_l)
                if fi < ti:  # correct direction
                    matches.append({
                        "route_id":      k,
                        "name":          v["name"],
                        "category":      get_category(k),
                        "from_stop_seq": fi + 1,
                        "to_stop_seq":   ti + 1,
                        "stops_between": ti - fi - 1,
                    })
                    break
    return {
        "from": from_stop,
        "to":   to_stop,
        "total": len(matches),
        "routes": matches,
    }

@app.get("/routes/{route_id}", tags=["Routes"])
def get_route(route_id: str):
    if route_id not in ROUTES:
        raise HTTPException(404, f"Route '{route_id}' not found.")
    return route_detail(route_id)

@app.get("/routes/{route_id}/stops", tags=["Routes"])
def get_route_stops(route_id: str, variant: int = 0):
    if route_id not in ROUTES:
        raise HTTPException(404, f"Route '{route_id}' not found.")
    variants = ROUTES[route_id]
    if variant >= len(variants):
        raise HTTPException(400, f"Variant {variant} doesn't exist. This route has {len(variants)} variant(s).")
    v = variants[variant]
    stops = v.get("stops", [])
    return {
        "route_id": route_id,
        "variant":  variant,
        "name":     v["name"],
        "stops": [
            {
                "sequence": i + 1,
                "name":     s,
                "lat":      STOPS_LOC[s][0] if s in STOPS_LOC else None,
                "lng":      STOPS_LOC[s][1] if s in STOPS_LOC else None,
            }
            for i, s in enumerate(stops)
        ],
    }

@app.get("/routes/{route_id}/variants", tags=["Routes"])
def get_route_variants(route_id: str):
    if route_id not in ROUTES:
        raise HTTPException(404, f"Route '{route_id}' not found.")
    variants = ROUTES[route_id]
    return {
        "route_id":      route_id,
        "variants_count": len(variants),
        "variants": [
            {
                "variant_index": i,
                "name":          v["name"],
                "stops_count":   len(v.get("stops", [])),
                "first_stop":    v["stops"][0]  if v.get("stops") else None,
                "last_stop":     v["stops"][-1] if v.get("stops") else None,
            }
            for i, v in enumerate(variants)
        ],
    }

# ── STOPS ─────────────────────────────────────────────────────────────────────

@app.get("/stops", tags=["Stops"])
def list_stops(
    page:  int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
):
    all_stops = sorted(STOPS_LOC.keys())
    start = (page - 1) * limit
    return {
        "total": len(all_stops),
        "page":  page,
        "limit": limit,
        "stops": [
            {"name": s, "lat": STOPS_LOC[s][0], "lng": STOPS_LOC[s][1]}
            for s in all_stops[start:start+limit]
        ],
    }

@app.get("/stops/search", tags=["Stops"])
def search_stops(
    q:     str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
):
    q_l = q.lower()
    matches = [s for s in STOPS_LOC if q_l in s.lower()]
    return {
        "query": q,
        "total": len(matches),
        "stops": [
            {"name": s, "lat": STOPS_LOC[s][0], "lng": STOPS_LOC[s][1]}
            for s in matches[:limit]
        ],
    }

@app.get("/stops/nearby", tags=["Stops"])
def stops_nearby(
    lat:    float = Query(...),
    lng:    float = Query(...),
    radius: float = Query(500, ge=50, le=5000, description="Radius in metres"),
    limit:  int   = Query(20, ge=1, le=100),
):
    results = []
    for name, (slat, slng) in STOPS_LOC.items():
        d = haversine_m(lat, lng, slat, slng)
        if d <= radius:
            results.append({"name": name, "lat": slat, "lng": slng, "distance_m": round(d)})
    results.sort(key=lambda x: x["distance_m"])
    return {
        "lat": lat, "lng": lng, "radius_m": radius,
        "total": len(results),
        "stops": results[:limit],
    }

@app.get("/stops/{stop_name}", tags=["Stops"])
def get_stop(stop_name: str):
    canonical = STOPS_LOOKUP.get(stop_name.lower())
    if not canonical:
        raise HTTPException(404, f"Stop '{stop_name}' not found.")
    lat, lng = STOPS_LOC[canonical]
    return {"name": canonical, "lat": lat, "lng": lng}

@app.get("/stops/{stop_name}/routes", tags=["Stops"])
def routes_at_stop(stop_name: str):
    canonical = STOPS_LOOKUP.get(stop_name.lower())
    if not canonical:
        raise HTTPException(404, f"Stop '{stop_name}' not found.")
    stop_l = canonical.lower()
    results = []
    for k in ALL_KEYS:
        for v in ROUTES[k]:
            stops_lower = [s.lower() for s in v.get("stops", [])]
            if stop_l in stops_lower:
                seq = stops_lower.index(stop_l) + 1
                results.append({
                    "route_id":  k,
                    "name":      v["name"],
                    "category":  get_category(k),
                    "stop_sequence": seq,
                    "total_stops":   len(stops_lower),
                })
                break
    return {
        "stop":  canonical,
        "total": len(results),
        "routes": results,
    }