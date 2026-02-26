// 1) Pega tu API key aquí (solo para desarrollo local)
const API_KEY = "AIzaSyAqQDU_bhrIp3dyKBF8sTb5QN3HK3ch7to";

// 2) Coordenadas aproximadas del centro de Ciudad Juárez
const CDJ_CENTER = { lat: 31.6904, lng: -106.4245 };
const INITIAL_ZOOM = 12;

// Cargador moderno (recommended) + importLibrary()
async function loadGoogleMaps() {
  if (window.google?.maps) return;

  const script = document.createElement("script");
  const params = new URLSearchParams({
    key: API_KEY,
    v: "weekly",
  });

  // Nota: no usamos callback; esperamos a que cargue el script
  script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
  script.async = true;
  script.defer = true;

  const loaded = new Promise((resolve, reject) => {
    script.addEventListener("load", resolve);
    script.addEventListener("error", () => reject(new Error("No se pudo cargar Google Maps JS")));
  });

  document.head.appendChild(script);
  await loaded;
}
// --- MAPA-MORFO: CSV loader + parser + normalizer (Entrega 1) ---

const CSV_PATH = "./eventos.csv";
const LIST_SEP = "|";

// Parser CSV (maneja comillas dobles, comas dentro de comillas y saltos de línea)
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"'; // comillas escapadas
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        field = "";
        // evita filas vacías por líneas en blanco
        if (row.some((x) => x.trim() !== "")) rows.push(row);
        row = [];
      } else if (c === "\r") {
        // ignora CR (Windows)
      } else {
        field += c;
      }
    }
  }

  // último campo
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);

  return rows;
}

function splitList(value) {
  if (!value) return [];
  return value
    .split(LIST_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toNumber(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Campo numérico inválido (${fieldName}): "${value}"`);
  }
  return n;
}

function normalizeEvent(obj) {
  // date: YYYY-MM-DD, time: HH:MM (24h). Esto sirve para ordenar.
  const datetimeKey = `${obj.date}T${obj.time}`;

  return {
    event_id: obj.event_id,
    title: obj.title,
    acts: splitList(obj.acts),
    scene: splitList(obj.scene),

    date: obj.date,
    time: obj.time,
    datetimeKey,

    lat: toNumber(obj.lat, "lat"),
    lng: toNumber(obj.lng, "lng"),
    place_name: obj.place_name || "",
    address: obj.address || "",

    description: obj.description || "",
    symbols: splitList(obj.symbols),
    reflection: obj.reflection || "",

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

  const header = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  const required = [
    "event_id","title","acts","scene","date","time","lat","lng",
    "place_name","address","description","symbols","reflection","photos","videos"
  ];
  for (const col of required) {
    if (!header.includes(col)) {
      throw new Error(`Falta columna requerida en CSV: "${col}"`);
    }
  }

  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const events = dataRows.map((r, rowIndex) => {
    const obj = {};
    for (const col of required) obj[col] = (r[idx[col]] ?? "").trim();

    try {
      return normalizeEvent(obj);
    } catch (e) {
      throw new Error(`Error en fila ${rowIndex + 2} (contando header como fila 1): ${e.message}`);
    }
  });

  // Validación: IDs únicos
  const seen = new Set();
  for (const ev of events) {
    if (seen.has(ev.event_id)) throw new Error(`event_id duplicado: ${ev.event_id}`);
    seen.add(ev.event_id);
  }

  // Orden: date + time (asc)
  events.sort((a, b) => a.datetimeKey.localeCompare(b.datetimeKey));

  return events;
}

function diagnostics(events) {
  const first = events[0];
  const last = events[events.length - 1];

  const allTags = new Set();
  const allScenes = new Set();
  const allActs = new Set();

  for (const ev of events) {
    ev.symbols.forEach((t) => allTags.add(t));
    ev.scene.forEach((s) => allScenes.add(s));
    ev.acts.forEach((a) => allActs.add(a));
  }

  console.log("=== MAPA-MORFO / Diagnóstico CSV ===");
  console.log("Total eventos:", events.length);
  console.log("Primero:", first.event_id, first.datetimeKey, "-", first.title);
  console.log("Último:", last.event_id, last.datetimeKey, "-", last.title);
  console.log("Tags detectados:", Array.from(allTags).sort());
  console.log("Scenes detectadas:", Array.from(allScenes).sort());
  console.log("Acts detectados (muestra):", Array.from(allActs).sort().slice(0, 25));
}
async function initMap(events) {
  await loadGoogleMaps();

  const { Map } = await google.maps.importLibrary("maps");
  const { Marker } = await google.maps.importLibrary("marker");

  const mapEl = document.getElementById("map");
  if (!mapEl) throw new Error('No existe el contenedor #map en el DOM.');

  // Crea el mapa (sin mapId por ahora)
  const map = new Map(mapEl, {
    center: CDJ_CENTER,   // fallback si no hay eventos
    zoom: INITIAL_ZOOM,   // fallback si no hay eventos
  });

  // Si no hay eventos, dejamos el mapa en CDJ_CENTER
  if (!events || events.length === 0) {
    console.warn("No hay eventos para mostrar.");
    return map;
  }

  // Bounds para encuadrar todos los puntos
  const bounds = new google.maps.LatLngBounds();

  // Creamos marcadores
  const markers = events.map((ev) => {
    const pos = { lat: ev.lat, lng: ev.lng };
    bounds.extend(pos);

    const marker = new Marker({
      map,
      position: pos,
      title: ev.title || ev.event_id,
    });

    marker.addListener("click", () => {
      console.log("Evento seleccionado:", ev.event_id, ev.datetimeKey, ev.title);
      // Próximo paso: abrir ficha detallada en panel
    });

    return marker;
  });

  // Encierra todos los eventos en pantalla
  if (events.length === 1) {
    map.setCenter({ lat: events[0].lat, lng: events[0].lng });
    map.setZoom(15);
  } else {
    map.fitBounds(bounds, 60); // padding en px
  }

  console.log("Mapa listo con eventos:", events.length);
  return { map, markers };
}

loadEventsFromCSV()
  .then((events) => {
    diagnostics(events);
    return initMap(events);
  })
  .catch((err) => {
    console.error(err);
    alert(err?.message || "Error cargando CSV o mapa. Revisa consola.");
  });
  