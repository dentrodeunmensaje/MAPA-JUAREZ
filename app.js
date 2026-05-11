// ============================
// MAPA-MORFO — app.js (loader robusto)
// ============================

const API_KEY = "AIzaSyAqQDU_bhrIp3dyKBF8sTb5QN3HK3ch7to";

const CDJ_CENTER = { lat: 31.72513, lng: -106.42849 };
const INITIAL_ZOOM = 12;

const CSV_PATH = "./eventos.csv";
const LIST_SEP = "|";

// ----------------------------
// Google Maps loader (ROBUSTO)
// - Espera a que exista google.maps.Map (no solo google.maps)
// - Usa callback para resolver exactamente cuando Maps está listo
// ----------------------------
let __mapsPromise = null;

function loadGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (__mapsPromise) return __mapsPromise;

  __mapsPromise = new Promise((resolve, reject) => {
    // si ya existe un script de maps (de una carga previa), no lo duplicamos:
    const existing = document.querySelector('script[data-google-maps="1"]');
    if (existing) {
      // esperamos a que aparezca google.maps.Map
      const t0 = Date.now();
      const tick = () => {
        if (window.google?.maps?.Map) return resolve();
        if (Date.now() - t0 > 10000) return reject(new Error("Google Maps no terminó de inicializar (timeout)."));
        requestAnimationFrame(tick);
      };
      tick();
      return;
    }

    const cbName = "__gm_cb_" + Math.random().toString(16).slice(2);
    window[cbName] = () => {
      try {
        if (!window.google?.maps?.Map) {
          reject(new Error("Google Maps cargó, pero google.maps.Map no está disponible."));
        } else {
          resolve();
        }
      } finally {
        // cleanup
        try { delete window[cbName]; } catch {}
      }
    };

    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: API_KEY,
      v: "weekly",
      loading: "async",
      callback: cbName,
    });

    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.setAttribute("data-google-maps", "1");
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps JS (network/script error)."));

    document.head.appendChild(script);
  });

  return __mapsPromise;
}

// ----------------------------
// CSV parser
// ----------------------------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") {
        row.push(field); field = "";
        if (row.some(x => x.trim() !== "")) rows.push(row);
        row = [];
      } else if (c === "\r") {
        // ignore
      } else field += c;
    }
  }
  row.push(field);
  if (row.some(x => x.trim() !== "")) rows.push(row);
  return rows;
}

function splitList(value) {
  if (!value) return [];
  return value.split(LIST_SEP).map(s => s.trim()).filter(Boolean);
}

function toNumber(value, name) {
  if (value === "" || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Campo numérico inválido (${name}): "${value}"`);
  return n;
}

function parseDateFlexible(s) {
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y,m,d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m-1, d));
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const [mm,dd,yy] = s.split("/").map(Number);
    const year = yy < 100 ? (2000 + yy) : yy;
    return new Date(Date.UTC(year, mm-1, dd));
  }

  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

function isoDateInputValue(dateObj) {
  if (!dateObj) return "";
  const y = dateObj.getUTCFullYear();
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parsePlus18(value) {
  if (value === "" || value == null) return null;
  const v = String(value).trim().toLowerCase();
  if (v === "1" || v === "true" || v === "sí" || v === "si") return 1;
  if (v === "0" || v === "false" || v === "no") return 0;
  return null;
}

function parsePriceRange(value) {
  if (!value) return { min: null, max: null };
  const parts = String(value).split("|").map(x => x.trim()).filter(Boolean);
  if (parts.length === 0) return { min: null, max: null };
  const min = toNumber(parts[0], "priceMin");
  const max = toNumber(parts[1] ?? parts[0], "priceMax");
  if (min == null || max == null) return { min: null, max: null };
  return { min: Math.min(min,max), max: Math.max(min,max) };
}

function normalizeEvent(obj) {
  const dateObj = parseDateFlexible(obj.date);
  const datetimeKey = `${isoDateInputValue(dateObj) || obj.date}T${obj.time || "00:00"}`;
  const price = parsePriceRange(obj.price);

  return {
    event_id: obj.event_id,
    title: obj.title || "",
    acts: splitList(obj.acts),
    scene: splitList(obj.scene),

    date_raw: obj.date || "",
    dateObj,
    dateISO: isoDateInputValue(dateObj),
    time: obj.time || "",
    datetimeKey,

    plus18: parsePlus18(obj.plus18),
    priceMin: price.min,
    priceMax: price.max,

    lat: toNumber(obj.lat, "lat"),
    lng: toNumber(obj.lng, "lng"),
    place_name: obj.place_name || "",
    address: obj.address || "",

    symbols: splitList(obj.symbols),
    photos: splitList(obj.photos),
    videos: splitList(obj.videos),
  };
}

async function loadEventsFromCSV(path = CSV_PATH) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar CSV: ${res.status} ${res.statusText}`);
  const text = await res.text();

  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("CSV sin datos (solo header o vacío).");

  const header = rows[0].map(h => h.trim());
  const idx = Object.fromEntries(header.map((h,i) => [h,i]));

  const required = ["event_id","title","acts","scene","date","time","lat","lng","place_name","address","symbols","photos","videos"];
  for (const col of required) {
    if (!(col in idx)) throw new Error(`Falta columna requerida en CSV: "${col}"`);
  }

  const optional = ["plus18","price"];

  const events = rows.slice(1).map((r, rowIndex) => {
    const obj = {};
    for (const col of required) obj[col] = (r[idx[col]] ?? "").trim();
    for (const col of optional) obj[col] = (idx[col] != null ? (r[idx[col]] ?? "").trim() : "");
    try {
      const ev = normalizeEvent(obj);
      if (ev.lat == null || ev.lng == null) throw new Error("lat/lng vacíos");
      return ev;
    } catch (e) {
      throw new Error(`Error en fila ${rowIndex + 2}: ${e.message}`);
    }
  });

  const seen = new Set();
  for (const ev of events) {
    if (seen.has(ev.event_id)) throw new Error(`event_id duplicado: ${ev.event_id}`);
    seen.add(ev.event_id);
  }

  events.sort((a,b) => a.datetimeKey.localeCompare(b.datetimeKey));
  return events;
}

// ----------------------------
// UI helpers
// ----------------------------
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const ch of children) node.appendChild(ch);
  return node;
}

function toYouTubeEmbed(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "").trim();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch { return null; }
}

function isLikelyImageUrl(url) {
  const u = url.toLowerCase();
  return (
    u.endsWith(".jpg") || u.endsWith(".jpeg") || u.endsWith(".png") || u.endsWith(".webp") ||
    u.includes("drive.google.com/thumbnail") ||
    u.includes("drive.google.com/uc?export=view") ||
    u.includes("googleusercontent.com")
  );
}

function driveToThumb(url, size = 800) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("googleusercontent.com")) return url;
    if (u.hostname.includes("drive.google.com") && u.pathname.includes("/thumbnail")) return url;

    if (u.hostname.includes("drive.google.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const dIndex = parts.indexOf("d");
      if (dIndex !== -1 && parts[dIndex + 1]) {
        const fileId = parts[dIndex + 1];
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
      }
      const id = u.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
    }
    return url;
  } catch { return url; }
}

// ----------------------------
// Drawers + refs
// ----------------------------
const ui = {
  leftDrawer: document.getElementById("leftDrawer"),
  rightDrawer: document.getElementById("rightDrawer"),
  backdrop: document.getElementById("backdrop"),

  btnLeft: document.getElementById("btnLeft"),
  btnRight: document.getElementById("btnRight"),
  btnCloseLeft: document.getElementById("btnCloseLeft"),
  btnCloseRight: document.getElementById("btnCloseRight"),

  btnStats: document.getElementById("btnStats"),
  btnBackToMap: document.getElementById("btnBackToMap"),

  mapScreen: document.getElementById("mapScreen"),
  statsScreen: document.getElementById("statsScreen"),

  eventCount: document.getElementById("eventCount"),
  eventList: document.getElementById("eventList"),
  eventDetail: document.getElementById("eventDetail"),

  filtersPanel: document.getElementById("filtersPanel"),
  btnClearFilters: document.getElementById("btnClearFilters"),
};

function closeAllDrawers() {
  ui.leftDrawer.classList.remove("open");
  ui.rightDrawer.classList.remove("open");
  ui.backdrop.classList.remove("show");
}
function openLeftDrawer() { ui.leftDrawer.classList.add("open"); ui.backdrop.classList.add("show"); }
function openRightDrawer() { ui.rightDrawer.classList.add("open"); ui.backdrop.classList.add("show"); }

ui.btnLeft.addEventListener("click", () => {
  const open = ui.leftDrawer.classList.contains("open");
  closeAllDrawers();
  if (!open) openLeftDrawer();
});
ui.btnRight.addEventListener("click", () => {
  const open = ui.rightDrawer.classList.contains("open");
  closeAllDrawers();
  if (!open) openRightDrawer();
});
ui.btnCloseLeft.addEventListener("click", closeAllDrawers);
ui.btnCloseRight.addEventListener("click", closeAllDrawers);
ui.backdrop.addEventListener("click", closeAllDrawers);

// ----------------------------
// State
// ----------------------------
const state = {
  allEvents: [],
  filteredEvents: [],
  selectedEventId: null,

  filters: {
    scenes: new Set(),
    symbols: new Set(),
    dateFrom: null,
    dateTo: null,
    plus18: "all",
    priceMin: null,
    priceMax: null,
  },

  map: null,
  markers: [],
  markerGroups: new Map(),
  polygon: null,
};

// ----------------------------
// Filters
// ----------------------------
function eventMatchesFilters(ev, f) {
  if (f.scenes.size) {
    const s = new Set(ev.scene);
    let ok = false; for (const x of f.scenes) if (s.has(x)) { ok = true; break; }
    if (!ok) return false;
  }
  if (f.symbols.size) {
    const t = new Set(ev.symbols);
    let ok = false; for (const x of f.symbols) if (t.has(x)) { ok = true; break; }
    if (!ok) return false;
  }
  if (f.dateFrom && ev.dateObj && ev.dateObj < f.dateFrom) return false;
  if (f.dateTo && ev.dateObj && ev.dateObj > f.dateTo) return false;

  if (f.plus18 === "only1" && ev.plus18 !== 1) return false;
  if (f.plus18 === "only0" && ev.plus18 !== 0) return false;

  if (f.priceMin != null || f.priceMax != null) {
    if (ev.priceMin == null || ev.priceMax == null) return false;
    const A = f.priceMin != null ? f.priceMin : -Infinity;
    const B = f.priceMax != null ? f.priceMax : Infinity;
    if (!(ev.priceMax >= A && ev.priceMin <= B)) return false; // overlap
  }
  return true;
}

function applyFilters() {
  state.filteredEvents = state.allEvents.filter(ev => eventMatchesFilters(ev, state.filters));
}

// ----------------------------
// Map
// ----------------------------
function latLngKey(lat,lng) { return `${lat.toFixed(6)},${lng.toFixed(6)}`; }

function groupEventsByLatLng(events) {
  const groups = new Map();
  for (const ev of events) {
    const key = latLngKey(ev.lat, ev.lng);
    if (!groups.has(key)) groups.set(key, { key, pos: { lat: ev.lat, lng: ev.lng }, eventIds: [] });
    groups.get(key).eventIds.push(ev.event_id);
  }
  return groups;
}

async function initMapOnce() {
  await loadGoogleMaps();

  const mapEl = document.getElementById("map");
  state.map = new google.maps.Map(mapEl, { center: CDJ_CENTER, zoom: INITIAL_ZOOM });

  state.polygon = new google.maps.Polygon({
    paths: [],
    strokeColor: "#111111",
    strokeOpacity: 0.75,
    strokeWeight: 2,
    fillColor: "#111111",
    fillOpacity: 0.10,
    map: state.map,
  });
}

function clearMarkers() { for (const m of state.markers) m.setMap(null); state.markers = []; }

function fitBoundsToGroups(groups) {
  const keys = Array.from(groups.keys());
  if (!keys.length) return;

  const bounds = new google.maps.LatLngBounds();
  for (const g of groups.values()) bounds.extend(g.pos);

  if (keys.length === 1) {
    const only = groups.values().next().value;
    state.map.setCenter(only.pos);
    state.map.setZoom(15);
  } else state.map.fitBounds(bounds, 80);
}

// hull
function convexHull(points) {
  if (points.length < 3) return points;

  const pts = points
    .map(p => ({ x: p.lng, y: p.lat, lat: p.lat, lng: p.lng }))
    .sort((a,b) => (a.x - b.x) || (a.y - b.y));

  const cross = (o,a,b) => (a.x-o.x)*(b.y-o.y) - (a.y-o.y)*(b.x-o.x);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0,-1).concat(upper.slice(0,-1)).map(p => ({ lat: p.lat, lng: p.lng }));
}

function updatePolygon(groups) {
  const pts = Array.from(groups.values()).map(g => g.pos);
  if (pts.length < 3) { state.polygon.setPath([]); return; }
  state.polygon.setPath(convexHull(pts));
}

function createCountMarker(pos, count) {
  return new google.maps.Marker({
    map: state.map,
    position: pos,
    label: { text: String(count), fontSize: "13px", fontWeight: "700", color: "#111" },
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 16,
      fillColor: "#ffffff",
      fillOpacity: 1,
      strokeColor: "#111111",
      strokeOpacity: 1,
      strokeWeight: 2,
    },
  });
}

function renderMarkersAndPolygon() {
  const groups = groupEventsByLatLng(state.filteredEvents);
  state.markerGroups = groups;

  clearMarkers();

  for (const g of groups.values()) {
    const count = g.eventIds.length;
    const marker = createCountMarker(g.pos, count);
    marker.addListener("click", () => {
      openLeftDrawer();
      if (count === 1) selectEvent(g.eventIds[0]);
      else renderGroupDetail(g.eventIds);
    });
    state.markers.push(marker);
  }

  fitBoundsToGroups(groups);
  updatePolygon(groups);
}

// ----------------------------
// Left panel: list/detail (sin description/reflection)
// ----------------------------
function formatPrice(ev) {
  if (ev.priceMin == null || ev.priceMax == null) return "";
  if (ev.priceMin === ev.priceMax) return `$${ev.priceMin}`;
  return `$${ev.priceMin}–$${ev.priceMax}`;
}

function renderEventList() {
  ui.eventList.innerHTML = "";
  ui.eventCount.textContent = `${state.filteredEvents.length} evento(s)`;

  for (const ev of state.filteredEvents) {
    const price = formatPrice(ev);
    const badges = [];
    if (ev.plus18 === 1) badges.push(el("span", { class: "badge", text: "+18" }));
    if (price) badges.push(el("span", { class: "badge", text: `Precio: ${price}` }));

    const item = el("div", {
      class: "event-item" + (state.selectedEventId === ev.event_id ? " active" : ""),
      onclick: () => selectEvent(ev.event_id),
    }, [
      el("div", { class: "event-title", text: ev.title || "(sin título)" }),
      el("div", { class: "event-meta" }, [
        el("span", { text: `${ev.dateISO || ev.date_raw} ${ev.time}` }),
        el("span", { text: ev.place_name || "" }),
        el("span", { text: ev.scene.join(" • ") }),
      ]),
      badges.length ? el("div", { class: "event-meta" }, badges) : el("div", { class: "event-meta" }, [])
    ]);

    ui.eventList.appendChild(item);
  }
}

function renderGroupDetail(eventIds) {
  ui.eventDetail.innerHTML = "";
  ui.eventDetail.appendChild(el("h3", { class: "detail-title", text: `Este punto tiene ${eventIds.length} eventos` }));
  ui.eventDetail.appendChild(el("div", { class: "detail-block", text: "Selecciona uno:" }));

  for (const id of eventIds) {
    const ev = state.filteredEvents.find(e => e.event_id === id) || state.allEvents.find(e => e.event_id === id);
    if (!ev) continue;

    ui.eventDetail.appendChild(el("div", { class: "event-item", onclick: () => selectEvent(id) }, [
      el("div", { class: "event-title", text: ev.title }),
      el("div", { class: "event-meta" }, [
        el("span", { text: `${ev.dateISO || ev.date_raw} ${ev.time}` }),
        el("span", { text: ev.scene.join(" • ") }),
      ])
    ]));
  }
}

function renderPhotos(photos) {
  const MAX_THUMBS = 3;
  const photoGrid = el("div", { class: "media-grid" }, []);
  const photoLinks = el("div", { class: "linklist" }, []);

  const thumbUrls = photos.slice(0, MAX_THUMBS).map(u => driveToThumb(u, 800));
  const remaining = photos.slice(MAX_THUMBS).map(u => driveToThumb(u, 800));

  for (const url of thumbUrls) {
    if (isLikelyImageUrl(url)) {
      photoGrid.appendChild(el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, [
        el("img", { class: "thumb", src: url, alt: "Foto del evento", loading: "lazy" })
      ]));
    } else {
      photoLinks.appendChild(el("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: "Foto (link)" }));
    }
  }

  let moreBtn = null;
  if (remaining.length) {
    moreBtn = el("button", {
      type: "button",
      class: "load-more",
      text: `Cargar ${remaining.length} foto(s) más`,
      onclick: () => {
        moreBtn.remove();
        for (const url of remaining) {
          photoGrid.appendChild(el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, [
            el("img", { class: "thumb", src: url, alt: "Foto del evento", loading: "lazy" })
          ]));
        }
      }
    });
  }

  return { photoGrid, photoLinks, moreBtn };
}

function renderEventDetail(ev) {
  ui.eventDetail.innerHTML = "";

  const chips = el("div", { class: "chips" }, (ev.symbols || []).map(t => el("span", { class: "chip", text: t })));
  const price = formatPrice(ev);

  ui.eventDetail.appendChild(el("h3", { class: "detail-title", text: ev.title || "(sin título)" }));

  const metaLine = [
    `${ev.dateISO || ev.date_raw} ${ev.time}`,
    ev.place_name || "",
    ev.address || ""
  ].filter(Boolean).join(" — ");
  ui.eventDetail.appendChild(el("div", { class: "detail-block", text: metaLine }));
  ui.eventDetail.appendChild(el("div", { class: "detail-block", text: `Acts: ${ev.acts.join(" • ")}` }));
  ui.eventDetail.appendChild(el("div", { class: "detail-block", text: `Escena: ${ev.scene.join(" • ")}` }));

  const badges = el("div", { class: "event-meta" }, []);
  if (ev.plus18 === 1) badges.appendChild(el("span", { class: "badge", text: "+18" }));
  if (ev.plus18 === 0) badges.appendChild(el("span", { class: "badge", text: "Todo público" }));
  if (price) badges.appendChild(el("span", { class: "badge", text: `Precio: ${price}` }));
  ui.eventDetail.appendChild(badges);

  if ((ev.symbols || []).length) {
    ui.eventDetail.appendChild(el("div", { class: "detail-block", text: "Particularidades:" }));
    ui.eventDetail.appendChild(chips);
  }

  if ((ev.photos || []).length) {
    ui.eventDetail.appendChild(el("div", { class: "detail-block", text: "Fotos:" }));
    const { photoGrid, photoLinks, moreBtn } = renderPhotos(ev.photos);
    if (photoGrid.childNodes.length) ui.eventDetail.appendChild(photoGrid);
    if (photoLinks.childNodes.length) ui.eventDetail.appendChild(photoLinks);
    if (moreBtn) ui.eventDetail.appendChild(moreBtn);
  }

  if ((ev.videos || []).length) {
    ui.eventDetail.appendChild(el("div", { class: "detail-block", text: "Videos:" }));
    const box = el("div", { class: "linklist" }, []);
    for (const url of ev.videos) {
      const embed = toYouTubeEmbed(url);
      if (embed) {
        box.appendChild(el("iframe", {
          class: "video-embed",
          src: embed,
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
          allowfullscreen: "true",
          title: "Video de YouTube"
        }));
      } else {
        box.appendChild(el("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: "Video (link)" }));
      }
    }
    ui.eventDetail.appendChild(box);
  }
}

function selectEvent(eventId) {
  const ev = state.filteredEvents.find(e => e.event_id === eventId) || state.allEvents.find(e => e.event_id === eventId);
  if (!ev) return;

  state.selectedEventId = eventId;
  state.map.panTo({ lat: ev.lat, lng: ev.lng });

  renderEventList();
  renderEventDetail(ev);
}

// ----------------------------
// Filters UI
// ----------------------------
function uniqueValuesFromEvents(events, fieldAsArrayName) {
  const set = new Set();
  for (const ev of events) for (const v of (ev[fieldAsArrayName] || [])) set.add(v);
  return Array.from(set).sort((a,b) => a.localeCompare(b));
}
function uniqueSymbols(events) {
  const set = new Set();
  for (const ev of events) (ev.symbols || []).forEach(s => set.add(s));
  return Array.from(set).sort((a,b) => a.localeCompare(b));
}
function computeGlobalPriceRange(events) {
  let min = Infinity, max = -Infinity;
  for (const ev of events) {
    if (ev.priceMin != null && ev.priceMax != null) {
      min = Math.min(min, ev.priceMin);
      max = Math.max(max, ev.priceMax);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: null, max: null };
  return { min, max };
}

function buildFiltersUI() {
  ui.filtersPanel.innerHTML = "";

  const scenes = uniqueValuesFromEvents(state.allEvents, "scene");
  const symbols = uniqueSymbols(state.allEvents);
  const priceRange = computeGlobalPriceRange(state.allEvents);

  const gScene = el("div", { class: "filter-group" }, [
    el("h4", { text: "Escena" }),
    el("div", { class: "checks" }, scenes.map(s => el("label", {}, [
      el("input", { type: "checkbox", onchange: (e) => {
        if (e.target.checked) state.filters.scenes.add(s);
        else state.filters.scenes.delete(s);
        onFiltersChanged();
      }}),
      document.createTextNode(s)
    ])))
  ]);

  const gDate = el("div", { class: "filter-group" }, [
    el("h4", { text: "Fecha (desde / hasta)" }),
    el("div", { class: "row" }, [
      el("label", {}, [ document.createTextNode("Desde"),
        el("input", { type: "date", onchange: (e) => {
          state.filters.dateFrom = e.target.value ? parseDateFlexible(e.target.value) : null;
          onFiltersChanged();
        }})
      ]),
      el("label", {}, [ document.createTextNode("Hasta"),
        el("input", { type: "date", onchange: (e) => {
          state.filters.dateTo = e.target.value ? parseDateFlexible(e.target.value) : null;
          onFiltersChanged();
        }})
      ])
    ])
  ]);

  const g18 = el("div", { class: "filter-group" }, [
    el("h4", { text: "+18" }),
    el("div", { class: "row" }, [
      el("label", {}, [ document.createTextNode("Mostrar"),
        el("select", { onchange: (e) => { state.filters.plus18 = e.target.value; onFiltersChanged(); }}, [
          el("option", { value: "all", text: "Todos" }),
          el("option", { value: "only1", text: "Solo +18" }),
          el("option", { value: "only0", text: "Solo no +18" }),
        ])
      ])
    ])
  ]);

  const gPrice = el("div", { class: "filter-group" }, [
    el("h4", { text: "Precio (MXN) — rango" }),
    el("div", { class: "row" }, [
      el("label", {}, [ document.createTextNode("Mín"),
        el("input", { type: "number", min: priceRange.min ?? 0, max: priceRange.max ?? 99999,
          placeholder: priceRange.min != null ? String(priceRange.min) : "—",
          onchange: (e) => { state.filters.priceMin = e.target.value === "" ? null : Number(e.target.value); onFiltersChanged(); }
        })
      ]),
      el("label", {}, [ document.createTextNode("Máx"),
        el("input", { type: "number", min: priceRange.min ?? 0, max: priceRange.max ?? 99999,
          placeholder: priceRange.max != null ? String(priceRange.max) : "—",
          onchange: (e) => { state.filters.priceMax = e.target.value === "" ? null : Number(e.target.value); onFiltersChanged(); }
        })
      ]),
    ]),
    el("div", { class: "muted", text: "Regla: aparece si el rango del evento se traslapa con el filtro." })
  ]);

  const gSym = el("div", { class: "filter-group" }, [
    el("h4", { text: "Particularidades" }),
    el("div", { class: "checks" }, symbols.map(t => el("label", {}, [
      el("input", { type: "checkbox", onchange: (e) => {
        if (e.target.checked) state.filters.symbols.add(t);
        else state.filters.symbols.delete(t);
        onFiltersChanged();
      }}),
      document.createTextNode(t)
    ])))
  ]);

  ui.filtersPanel.appendChild(gScene);
  ui.filtersPanel.appendChild(gDate);
  ui.filtersPanel.appendChild(g18);
  ui.filtersPanel.appendChild(gPrice);
  ui.filtersPanel.appendChild(gSym);
}

ui.btnClearFilters.addEventListener("click", () => {
  state.filters.scenes.clear();
  state.filters.symbols.clear();
  state.filters.dateFrom = null;
  state.filters.dateTo = null;
  state.filters.plus18 = "all";
  state.filters.priceMin = null;
  state.filters.priceMax = null;
  buildFiltersUI();
  onFiltersChanged();
});

// ----------------------------
// Stats
// ----------------------------
function renderTableFromMap(map, headers = ["Categoría", "Conteo"], limit = null) {
  const entries = Array.from(map.entries()).sort((a,b) => b[1] - a[1]);
  const rows = limit ? entries.slice(0, limit) : entries;

  const table = el("table", {}, []);
  table.appendChild(el("thead", {}, [ el("tr", {}, headers.map(h => el("th", { text: h }))) ]));
  const tbody = el("tbody", {}, []);
  for (const [k,v] of rows) tbody.appendChild(el("tr", {}, [ el("td", { text: String(k) }), el("td", { text: String(v) }) ]));
  table.appendChild(tbody);
  return table;
}

function renderPriceStats(events) {
  const withPrice = events.filter(e => e.priceMin != null && e.priceMax != null);
  if (!withPrice.length) return el("div", { class: "muted", text: "Sin datos de precio en el dataset filtrado." });

  let min = Infinity, max = -Infinity, sumMid = 0;
  for (const e of withPrice) { min = Math.min(min, e.priceMin); max = Math.max(max, e.priceMax); sumMid += (e.priceMin + e.priceMax)/2; }
  const avg = sumMid / withPrice.length;

  return el("div", {}, [
    el("div", { class: "detail-block", text: `Eventos con precio: ${withPrice.length}` }),
    el("div", { class: "detail-block", text: `Mín observado: $${min}` }),
    el("div", { class: "detail-block", text: `Máx observado: $${max}` }),
    el("div", { class: "detail-block", text: `Promedio (midpoint): $${avg.toFixed(1)}` }),
  ]);
}

function drawBarChart(canvas, entries) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = "#fff"; ctx.fillRect(0,0,W,H);

  const margin = 40;
  const innerW = W - margin*2;
  const innerH = H - margin*2;

  const maxVal = Math.max(...entries.map(e => e[1]), 1);
  const barW = innerW / Math.max(entries.length, 1);

  ctx.strokeStyle = "#111";
  ctx.beginPath();
  ctx.moveTo(margin, margin);
  ctx.lineTo(margin, H - margin);
  ctx.lineTo(W - margin, H - margin);
  ctx.stroke();

  ctx.fillStyle = "#111";
  entries.forEach(([label,val], i) => {
    const h = (val / maxVal) * innerH;
    const x = margin + i*barW + 6;
    const y = H - margin - h;
    ctx.fillRect(x, y, Math.max(barW - 12, 4), h);

    ctx.save();
    ctx.translate(x + 4, H - margin + 12);
    ctx.rotate(-Math.PI/5);
    ctx.fillStyle = "#333";
    ctx.font = "11px system-ui";
    ctx.fillText(String(label).slice(0, 18), 0, 0);
    ctx.restore();

    ctx.fillStyle = "#111";
    ctx.font = "11px system-ui";
    ctx.fillText(String(val), x, y - 6);
  });
}

function renderStats() {
  const events = state.filteredEvents;

  const sceneCount = new Map();
  const symCount = new Map();

  const uniqueScenes = new Set();
  const uniqueSyms = new Set();

  for (const ev of events) {
    (ev.scene.length ? ev.scene : ["(sin escena)"]).forEach(s => {
      uniqueScenes.add(s);
      sceneCount.set(s, (sceneCount.get(s) || 0) + 1);
    });
    (ev.symbols || []).forEach(t => {
      uniqueSyms.add(t);
      symCount.set(t, (symCount.get(t) || 0) + 1);
    });
  }

  document.getElementById("statsSummary").textContent =
    `Eventos (filtrados): ${events.length} · Escenas distintas: ${uniqueScenes.size} · Particularidades distintas: ${uniqueSyms.size} · Puntos únicos: ${state.markerGroups.size}`;

  const bySceneEl = document.getElementById("statsByScene");
  bySceneEl.innerHTML = "";
  bySceneEl.appendChild(renderTableFromMap(sceneCount, ["Escena", "Eventos"]));

  const bySymEl = document.getElementById("statsBySymbols");
  bySymEl.innerHTML = "";
  bySymEl.appendChild(renderTableFromMap(symCount, ["Particularidad", "Eventos"], 20));

  const priceEl = document.getElementById("statsPrice");
  priceEl.innerHTML = "";
  priceEl.appendChild(renderPriceStats(events));

  const entries = Array.from(sceneCount.entries()).sort((a,b) => b[1]-a[1]).slice(0, 12);
  drawBarChart(document.getElementById("statsChart"), entries);
}

function showStats() {
  closeAllDrawers();
  ui.mapScreen.classList.add("hidden");
  ui.statsScreen.classList.remove("hidden");
  renderStats();
}
function showMap() {
  ui.statsScreen.classList.add("hidden");
  ui.mapScreen.classList.remove("hidden");
}

ui.btnStats.addEventListener("click", showStats);
ui.btnBackToMap.addEventListener("click", showMap);

function onFiltersChanged() {
  applyFilters();
  renderEventList();

  if (state.selectedEventId && !state.filteredEvents.some(e => e.event_id === state.selectedEventId)) {
    state.selectedEventId = null;
    ui.eventDetail.innerHTML = "";
  }

  renderMarkersAndPolygon();

  if (!ui.statsScreen.classList.contains("hidden")) renderStats();
}

// Boot
(async function main() {
  try {
    state.allEvents = await loadEventsFromCSV();
    applyFilters();

    await initMapOnce();
    buildFiltersUI();

    renderEventList();
    renderMarkersAndPolygon();
  } catch (err) {
    console.error(err);
    alert(err?.message || "Error inicializando la aplicación. Revisa consola.");
  }
})();