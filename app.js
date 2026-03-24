// ══════════════════════════════════════════════
//  NAMMA BMTC DB — Application Logic
// ══════════════════════════════════════════════

// ── STATE ─────────────────────────────────────
let ROUTES = {};
let allKeys = [];
let STOPS_LOC = {};
let currentCat = 'all';
let currentSearch = '';
let currentRouteKey = null;
let currentVariant = 0;
let viewMode = 'list';
let map = null;
let mapLayerGroup = null;
let focusedStopLayer = null;

// ── CATEGORIES DATA ───────────────────────────
const CATS = [
  { id: 'all', label: 'All Routes', color: '#10b981', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>` },
  { id: 'mf', label: 'Metro Feeder', color: '#eab308', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>` },
  { id: 'airport', label: 'Airport', color: '#06b6d4', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3z" /></svg>` },
  { id: 'radial', label: 'Radial', color: '#f97316', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>` },
  { id: 'orbital', label: 'Orbital', color: '#6366f1', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>` },
  { id: 'express', label: 'Express', color: '#ef4444', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>` },
  { id: 'general', label: 'General', color: '#34d399', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>` },
];

function getCategory(key) {
  const n = (key || '').toUpperCase();
  if (n.startsWith('MF'))  return 'mf';
  if (n.startsWith('KIA')) return 'airport';
  if (n.startsWith('G'))   return 'radial';
  if (n.startsWith('500') || n.startsWith('C') || n.startsWith('K')) return 'orbital';
  if (n.startsWith('EX'))  return 'express';
  return 'general';
}

function getMFColor(key) {
  const norm = key.toLowerCase().replace(/[-\s]/g, '');
  const m = norm.match(/\d+/);
  const num = m ? parseInt(m[0]) : 0;
  if (num === 12) return '#a855f7';
  if (num >= 1 && num <= 14) return '#9333ea';
  if ((num >= 15 && num <= 20) || (num >= 23 && num <= 45)) return '#16a34a';
  if (num === 22) return '#eab308';
  if (num >= 50) return '#3b82f6';
  return '#10b981';
}

function getCardColor(catId, routeKey) {
  if (catId === 'mf' && routeKey) return getMFColor(routeKey);
  const c = CATS.find(x => x.id === catId);
  return c ? c.color : '#34d399';
}

// ── INIT ──────────────────────────────────────
Promise.all([
  fetch('./routes.json').then(r => { if (!r.ok) throw new Error('Failed to load routes'); return r.json(); }),
  fetch('./locations.json').then(r => { if (!r.ok) throw new Error('Failed to load locations'); return r.json(); })
]).then(([routesData, locsData]) => {
  ROUTES = routesData;
  STOPS_LOC = locsData;
  allKeys = Object.keys(ROUTES).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  document.getElementById('loading').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  renderCategories();
  renderGrid();
})
  .catch(err => {
    document.getElementById('loading').innerHTML = `
      <div style="text-align:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" style="width:48px;height:48px;margin-bottom:16px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h2 style="color:#ef4444;font-family:'Space Grotesk',sans-serif;margin-bottom:8px">Error Loading Data</h2>
        <p style="color:#a1a1aa">${err.message}</p>
        <button onclick="location.reload()" style="margin-top:20px;padding:8px 16px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:8px;cursor:pointer">Try Again</button>
      </div>
    `;
  });

// ── RENDER CATEGORIES ─────────────────────────
function renderCategories() {
  const counts = { all: allKeys.length };
  allKeys.forEach(k => {
    const c = getCategory(k);
    counts[c] = (counts[c] || 0) + 1;
  });

  const catList = document.getElementById('cat-list');
  catList.innerHTML = CATS.map(cat => `
    <div class="cat-pill ${cat.id === currentCat ? 'active' : ''}" data-cat="${cat.id}" style="${cat.id === currentCat ? `--accent-base:${cat.color}` : ''}">
      ${cat.icon}
      <span>${cat.label}</span>
      <span class="count">${counts[cat.id] || 0}</span>
    </div>
  `).join('');

  document.querySelectorAll('.cat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCat = btn.dataset.cat;
      renderCategories(); // update active class
      renderGrid();
      if (viewMode === 'map') renderMap();
    });
  });
}

// ── RENDER GRID ───────────────────────────────
function renderGrid() {
  const q = currentSearch.toLowerCase().replace(/[-\s]/g, '');
  const keys = allKeys.filter(k => {
    if (currentCat !== 'all' && getCategory(k) !== currentCat) return false;
    if (!q) return true;
    if (k.toLowerCase().replace(/[-\s]/g, '').includes(q)) return true;
    const entry = ROUTES[k];
    const name = Array.isArray(entry) ? entry[0].name : entry.name;
    return name.toLowerCase().replace(/[-\s]/g, '').includes(q);
  }).slice(0, 200);

  const grid = document.getElementById('route-grid');
  document.getElementById('route-count').textContent = keys.length;

  if (keys.length === 0) {
    grid.innerHTML = `
      <div id="empty-state" style="grid-column: 1 / -1; padding: 60px 0; text-align: center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:40px;height:40px;color:#52525b;margin-bottom:16px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p style="color:#a1a1aa;font-size:16px;font-weight:500;">No routes found</p>
      </div>`;
    return;
  }

  grid.innerHTML = keys.map(k => {
    const data = ROUTES[k];
    const variants = Array.isArray(data) ? data : [data];
    const name = variants[0].name.replace(/⇔/g, '→');
    const stopsCount = variants[0].stops ? variants[0].stops.length : 0;
    const catId = getCategory(k);
    const color = getCardColor(catId, k);
    
    return `
      <div class="route-card" style="--card-color: ${color}" onclick="openDetail('${k.replace(/'/g, "\\'")}')">
        <div class="card-header">
          <div class="route-number">${escHtml(k)}</div>
          <div class="route-badge" style="color: ${color}; background: ${color}20">${CATS.find(c=>c.id===catId).label}</div>
        </div>
        <div class="route-name">${escHtml(name)}</div>
        <div class="card-footer">
          <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${stopsCount} Stops</div>
          ${variants.length > 1 ? `<div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> ${variants.length} Variants</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ── MAP RENDERING ─────────────────────────────
function setViewMode(mode) {
  viewMode = mode;
  document.getElementById('btn-list').classList.toggle('active', mode === 'list');
  document.getElementById('btn-map').classList.toggle('active', mode === 'map');
  
  if (mode === 'list') {
    document.getElementById('list-view').style.display = 'block';
    document.getElementById('map-view').style.display = 'none';
  } else {
    document.getElementById('list-view').style.display = 'none';
    document.getElementById('map-view').style.display = 'block';
    if (!map) initMap();
    renderMap();
    setTimeout(() => map.invalidateSize(), 50);
  }
}

function initMap() {
  map = L.map('map-view').setView([12.9716, 77.5946], 10);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20
  }).addTo(map);
  mapLayerGroup = L.layerGroup().addTo(map);
}

function renderMap() {
  if (!map) return;
  mapLayerGroup.clearLayers();
  
  const q = currentSearch.toLowerCase().replace(/[-\s]/g, '');
  const keys = allKeys.filter(k => {
    if (currentCat !== 'all' && getCategory(k) !== currentCat) return false;
    if (!q) return true;
    if (k.toLowerCase().replace(/[-\s]/g, '').includes(q)) return true;
    const entry = ROUTES[k];
    const name = Array.isArray(entry) ? entry[0].name : entry.name;
    return name.toLowerCase().replace(/[-\s]/g, '').includes(q);
  });

  const bounds = L.latLngBounds();
  
  // Display point cloud (stops) if no explicit text search is active.
  const isGlobalView = currentSearch.trim() === '';
  
  const activeRouteUI = document.getElementById('map-active-route');
  if (activeRouteUI) activeRouteUI.style.display = 'none';

  if (isGlobalView) {
    let plottedStops = new Set();
    let drawnStops = 0;
    
    for (let k of keys) {
      const data = ROUTES[k];
      const variants = Array.isArray(data) ? data : [data];
      const stops = variants[0].stops || [];
      const routeColor = getCardColor(getCategory(k), k);
      
      for (let s of stops) {
        if (!plottedStops.has(s) && STOPS_LOC[s]) {
          plottedStops.add(s);
          const pt = STOPS_LOC[s];
          
          L.circleMarker([pt[0], pt[1]], {
            radius: 2.5,
            color: 'transparent',
            fillColor: routeColor,
            fillOpacity: 0.75
          })
          .bindTooltip(`<div style="font-family: 'Inter', sans-serif;"><b>${s}</b></div>`, { direction: 'top', offset: [0, -2], opacity: 0.9 })
          .addTo(mapLayerGroup);
          
          bounds.extend([pt[0], pt[1]]);
          drawnStops++;
        }
      }
      if (drawnStops > 4000) break; // Safety limit
    }
  } else {
    // Focused view: Draw exact paths and individual stop tracking nodes
    let drawnRoutes = 0;
    let displayRoute = null;
    
    for (let k of keys) {
      if (drawnRoutes > 20) break; // Hard cap on heavily queried text searches!
      const data = ROUTES[k];
      const variants = Array.isArray(data) ? data : [data];
      const color = getCardColor(getCategory(k), k);
      
      // Select the primary variant by choosing the one with the most stops to prevent 2-stop broken variants from taking precedence
      let v = variants[0]; 
      for (let i = 1; i < variants.length; i++) {
        if (variants[i].stops && v.stops && variants[i].stops.length > v.stops.length) {
          v = variants[i];
        }
      }
      
      const exactMatch = k.replace(/[-\s]/g, '').toLowerCase() === q;
      if (!displayRoute && (keys.length === 1 || exactMatch)) {
         displayRoute = `<span style="color:${color}">${k}</span> <span style="font-weight:500;color:var(--text-muted)">${escHtml(v.name.replace(/⇔/g, '→'))}</span>`;
      }
      
      const stops = v.stops || [];
      let validStops = [];
      
      for (let idx = 0; idx < stops.length; idx++) {
        const s = stops[idx];
        if (STOPS_LOC[s]) {
          validStops.push({ name: s, pt: [STOPS_LOC[s][0], STOPS_LOC[s][1]], idx });
        }
      }
      
      // OUTLIER SPIKE FILTER: Remove stops that shoot massive distances out and back due to generic name collisions (like 'Temple' or 'Cross') mapped to incorrect coordinates
      let filteredStops = [];
      for (let i = 0; i < validStops.length; i++) {
        const curr = validStops[i].pt;
        const prev = i > 0 ? validStops[i-1].pt : null;
        const next = i < validStops.length - 1 ? validStops[i+1].pt : null;
        
        let isOutlier = false;
        if (prev && next) {
          const d1 = Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);
          const d2 = Math.hypot(next[0] - curr[0], next[1] - curr[1]);
          // If jumping > 4.5km out and > 4.5km back for a completely isolated single stop, it's a naming collision
          if (d1 > 0.04 && d2 > 0.04) isOutlier = true;
        } else if (prev && !next) {
           const d1 = Math.hypot(curr[0] - prev[0], curr[1] - prev[1]);
           if (d1 > 0.08) isOutlier = true; // 9km terminal jump
        } else if (!prev && next) {
           const d2 = Math.hypot(next[0] - curr[0], next[1] - curr[1]);
           if (d2 > 0.08) isOutlier = true;
        }
        
        if (!isOutlier) filteredStops.push(validStops[i]);
      }
      
      let path = [];
      for (let node of filteredStops) {
        path.push(node.pt);
        
        L.circleMarker(node.pt, {
          radius: 4,
          color: '#0a0a0f',
          weight: 1.5,
          fillColor: color,
          fillOpacity: 1
        })
        .bindTooltip(`<div style="font-family: 'Inter', sans-serif;"><b>${node.name}</b><br/><span style="color:#52525b">Stop ${node.idx + 1} • Route ${k}</span></div>`, { direction: 'top', offset: [0, -4] })
        .addTo(mapLayerGroup);
        
        bounds.extend(node.pt);
      }
      
      if (path.length > 1) {
        L.polyline(path, { color: color, weight: 4, opacity: 0.8 }).addTo(mapLayerGroup);
      }
      
      drawnRoutes++;
    }
    
    if (displayRoute && activeRouteUI) {
      activeRouteUI.innerHTML = displayRoute;
      activeRouteUI.style.display = 'flex';
    }
  }
  
  if (isGlobalView) {
    // Prevent giant zoom-outs caused by outlier bus stops at the edge of the state
    map.setView([12.9716, 77.5946], 10);
  } else if (bounds.isValid()) {
    // Zoom tightly to the exact focused bus route
    map.fitBounds(bounds, { padding: [30, 30] });
  }
}

// ── DETAIL PANEL ──────────────────────────────
function openDetail(key) {
  currentRouteKey = key;
  currentVariant = 0;
  
  document.getElementById('overlay-backdrop').classList.add('active');
  document.getElementById('detail-panel').classList.add('active');
  
  renderDetailContent();
}

function closeDetail() {
  document.getElementById('overlay-backdrop').classList.remove('active');
  document.getElementById('detail-panel').classList.remove('active');
}

function renderDetailContent() {
  const data = ROUTES[currentRouteKey];
  const isMulti = Array.isArray(data);
  const variants = isMulti ? data : [data];
  const v = variants[currentVariant] || variants[0];
  const stops = v.stops || [];
  const catColor = getCardColor(getCategory(currentRouteKey), currentRouteKey);

  const variantTabs = isMulti && variants.length > 1
    ? `<div class="variant-tabs" style="--accent-base: ${catColor}; --accent-glow: ${catColor}20">
        ${variants.map((vv, i) => `
          <button class="variant-tab ${i === currentVariant ? 'active' : ''}" onclick="switchVariant(${i})">
            Variant ${i + 1}
          </button>
        `).join('')}
       </div>` : '';

  const stopRows = stops.map((name, i) => {
    const isFirst = i === 0 ? 'first' : '';
    const isLast = i === stops.length - 1 ? 'last' : '';
    return `
      <div class="timeline-item ${isFirst} ${isLast}" style="--accent-base: ${catColor}; --accent-glow: ${catColor}40">
        <div class="timeline-dot"></div>
        <div class="stop-name">${escHtml(name)}</div>
        <div class="stop-seq">Stop ${i + 1}</div>
      </div>`;
  }).join('');

  document.getElementById('detail-panel').innerHTML = `
    <div class="detail-header">
      <button class="btn-close" onclick="closeDetail()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      <div class="detail-num" style="color: ${catColor}">${escHtml(currentRouteKey)}</div>
      <div class="detail-title">${escHtml(v.name.replace(/⇔/g, '→'))}</div>
    </div>
    
    <div class="detail-body">
      ${variantTabs}
      <div class="timeline">
        ${stopRows}
      </div>
    </div>
    
    <div class="detail-footer">
      <button class="btn-maps" onclick="launchMaps()">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        View Route on Google Maps
      </button>
    </div>
  `;
}

function switchVariant(i) {
  currentVariant = i;
  renderDetailContent();
}

function launchMaps() {
  const data = ROUTES[currentRouteKey];
  const variants = Array.isArray(data) ? data : [data];
  const stops = (variants[currentVariant] || variants[0]).stops || [];
  if (stops.length < 2) return;
  
  const routeStops = [stops[0]];
  const middleStops = stops.slice(1, -1);
  
  if (middleStops.length > 0) {
    if (middleStops.length <= 8) {
      routeStops.push(...middleStops);
    } else {
      const step = middleStops.length / 8;
      for (let i = 0; i < 8; i++) {
        routeStops.push(middleStops[Math.floor(i * step)]);
      }
    }
  }
  routeStops.push(stops[stops.length - 1]);
  
  const pathParts = routeStops.map(s => encodeURIComponent(s + ', Bangalore')).join('/');
  window.open(`https://www.google.com/maps/dir/${pathParts}/data=!4m2!4m1!3e0`, '_blank');
}

// ── SEARCH & MAP CONTROLS ─────────────────────
document.getElementById('map-stop-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase().trim();
  const resBox = document.getElementById('map-stop-results');
  const clearBtn = document.getElementById('map-search-clear');
  
  clearBtn.style.display = q ? 'flex' : 'none';
  
  if(!q) { 
    resBox.classList.remove('active'); 
    if (focusedStopLayer && map.hasLayer(focusedStopLayer)) {
      map.removeLayer(focusedStopLayer);
    }
    focusedStopLayer = null;
    return; 
  }
  
  let validStops = null;
  if (currentCat !== 'all') {
    validStops = new Set();
    for (const k of allKeys) {
      if (getCategory(k) === currentCat) {
        const variants = Array.isArray(ROUTES[k]) ? ROUTES[k] : [ROUTES[k]];
        variants.forEach(v => {
          if (v.stops) v.stops.forEach(s => validStops.add(s));
        });
      }
    }
  }
  
  const matches = Object.keys(STOPS_LOC)
    .filter(s => {
      if (validStops && !validStops.has(s)) return false;
      return s.toLowerCase().includes(q);
    })
    .slice(0, 50);
    
  if(matches.length === 0) {
    resBox.innerHTML = '<div class="map-stop-item" style="color:#ef4444">No stops found</div>';
  } else {
    resBox.innerHTML = matches.map(s => 
      `<div class="map-stop-item" onclick="flyToStop('${s.replace(/'/g, "\\'")}')">${escHtml(s)}</div>`
    ).join('');
  }
  resBox.classList.add('active');
});

function flyToStop(stopName) {
  const pt = STOPS_LOC[stopName];
  if (pt && map) {
    map.flyTo([pt[0], pt[1]], 16);
    
    if (focusedStopLayer && map.hasLayer(focusedStopLayer)) {
      map.removeLayer(focusedStopLayer);
    }
    
    focusedStopLayer = L.circleMarker([pt[0], pt[1]], {
      radius: 8, color: '#10b981', weight: 2, fillColor: '#10b981', fillOpacity: 0.4
    }).addTo(map).bindTooltip(`<div style="font-family:'Inter',sans-serif"><b>${escHtml(stopName)}</b></div>`, {direction:'top', permanent: true, offset: [0, -4]}).openTooltip();
    
    document.getElementById('map-stop-search').value = stopName;
    document.getElementById('map-stop-results').classList.remove('active');
  }
}

document.getElementById('map-stop-search').addEventListener('blur', () => {
    // delay removing active class to allow click to register
    setTimeout(() => {
       document.getElementById('map-stop-results').classList.remove('active');
    }, 200);
});

document.addEventListener('click', e => {
  if (!e.target.closest('#map-controls')) {
    document.getElementById('map-stop-results').classList.remove('active');
  }
});

function clearMapSearch() {
  const input = document.getElementById('map-stop-search');
  input.value = '';
  input.dispatchEvent(new Event('input'));
  input.focus();
}

function clearMainSearch() {
  const input = document.getElementById('search');
  input.value = '';
  input.dispatchEvent(new Event('input'));
  input.focus();
}

function selectMainSearch(k) {
  const input = document.getElementById('search');
  input.value = k;
  document.getElementById('main-search-results').classList.remove('active');
  input.dispatchEvent(new Event('input'));
}

document.getElementById('search').addEventListener('input', e => {
  currentSearch = e.target.value.trim();
  const q = currentSearch.toLowerCase();
  const resBox = document.getElementById('main-search-results');
  const clearBtn = document.getElementById('main-search-clear');
  
  clearBtn.style.display = q ? 'flex' : 'none';
  
  if (!q) {
    resBox.classList.remove('active');
  } else {
    const qClean = q.replace(/[-\s]/g, '');
    const matchedKeys = allKeys.filter(k => {
      if (currentCat !== 'all' && getCategory(k) !== currentCat) return false;
      if (k.toLowerCase().replace(/[-\s]/g, '').includes(qClean)) return true;
      const entry = ROUTES[k];
      const name = Array.isArray(entry) ? entry[0].name : entry.name;
      return name.toLowerCase().replace(/[-\s]/g, '').includes(qClean);
    }).slice(0, 10);
    
    if (matchedKeys.length === 0) {
      resBox.innerHTML = '<div class="map-stop-item" style="color:#ef4444">No active routes found</div>';
    } else {
      resBox.innerHTML = matchedKeys.map(k => {
        const data = ROUTES[k];
        const name = Array.isArray(data) ? data[0].name : data.name;
        const color = getCardColor(getCategory(k), k);
        return `<div class="map-stop-item" style="display:flex;align-items:center;gap:8px" onclick="selectMainSearch('${k.replace(/'/g, "\\'")}')">
          <span style="color:${color};font-weight:700;white-space:nowrap;flex-shrink:0;">${k}</span> ${escHtml(name.replace(/⇔/g, '→'))}
        </div>`;
      }).join('');
    }
    resBox.classList.add('active');
  }
  
  renderGrid();
  if (viewMode === 'map') renderMap();
});

document.getElementById('search').addEventListener('blur', () => {
  setTimeout(() => document.getElementById('main-search-results').classList.remove('active'), 200);
});

// ── UTILS ─────────────────────────────────────
function resetView() {
  currentSearch = '';
  document.getElementById('search').value = '';
  document.getElementById('main-search-clear').style.display = 'none';
  currentCat = 'all';
  renderCategories();
  renderGrid();
  if (viewMode === 'map') renderMap();
}

// ── UTILS ─────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
