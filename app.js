// --- MAPA-MORFO / MAPA-JUAREZ ---

// 1) Pega tu API key aquí (solo para desarrollo local)
const API_KEY = "AIzaSyAqQDU_bhrIp3dyKBF8sTb5QN3HK3ch7to";

// 2) Coordenadas aproximadas del centro de Ciudad Juárez
const CDJ_CENTER = { lat: 31.6904, lng: -106.4245 };
const INITIAL_ZOOM = 12;

// CSV
const CSV_PATH = "./eventos.csv";
const LIST_SEP = "|";

// Cargador moderno + importLibrary()
async function loadGoogleMaps() {
  if (window.google?.maps) return;

  const script = document.createElement("script");
  const params = new URLSearchParams({
    key: API_KEY,
    v: "weekly",
  });

  script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
  script.async = true;
  script.defer = true;

  const loaded = new Promise((resolve, reject) => {
    script.addEventListener("load", resolve);
    script.addEventListener("error", () =>
      reject(new Error("No se pudo cargar Google Maps JS"))
    );
  });

  document.head.appendChild(script);
  await loaded;
}

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
        if (row.some((x) => x.trim() !== "")) rows.push(row);
        row = [];
      } else if (c === "\r") {
        // ignora CR (Windows)
      } else {
        field += c;
      }
    }
  }

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
    "event_id",
    "title",
    "acts",
    "scene",
    "date",
    "time",
    "lat",
    "lng",
    "place_name",
    "address",
    "description",
    "symbols",
    "reflection",
    "photos",
    "videos",
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

  const seen = new Set();
  for (const ev of events) {
    if (seen.has(ev.event_id)) throw new Error(`event_id duplicado: ${ev.event_id}`);
    seen.add(ev.event_id);
  }

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

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const ch of children) node.appendChild(ch);
  return node;
}

function isLikelyImageUrl(url) {
  const u = url.toLowerCase();
  return (
    u.endsWith(".jpg") ||
    u.endsWith(".jpeg") ||
    u.endsWith(".png") ||
    u.endsWith(".webp") ||
    u.includes("drive.google.com/uc?export=view") ||
    u.includes("drive.google.com/thumbnail") ||
    u.includes("googleusercontent.com")
  );
}

// Convierte links de Drive "file/d/.../view" o "open?id=..." a thumbnail ligero
function driveToThumb(url, size = 800) {
  try {
    const u = new URL(url);

    // si ya es googleusercontent o thumbnail, no tocamos
    if (u.hostname.includes("googleusercontent.com")) return url;
    if (u.hostname.includes("drive.google.com") && u.pathname.includes("/thumbnail")) return url;

    if (u.hostname.includes("drive.google.com")) {
      // Caso: /file/d/FILE_ID/view
      const parts = u.pathname.split("/").filter(Boolean);
      const dIndex = parts.indexOf("d");
      if (dIndex !== -1 && parts[dIndex + 1]) {
        const fileId = parts[dIndex + 1];
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
      }

      // Caso: open?id=FILE_ID
      const id = u.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
    }

    return url;
  } catch {
    return url;
  }
}

// Preload con límite de concurrencia (evita “bombardear” y reduce 429)
async function preloadWithLimit(urls, limit = 2) {
  const queue = [...urls];

  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length) {
      const url = queue.shift();
      await new Promise((resolve) => {
        const img = new Image();
        img.loading = "lazy";
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
      });
    }
  });

  await Promise.all(workers);
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
  } catch {
    return null;
  }
}

function renderSidebar(events, onSelect) {
  const listEl = document.getElementById("eventList");
  const countEl = document.getElementById("eventCount");
  if (!listEl) throw new Error("No existe #eventList. Revisa index.html.");
  if (countEl) countEl.textContent = `${events.length} evento(s)`;

  listEl.innerHTML = "";

  const itemsById = new Map();

  for (const ev of events) {
    const item = el("div", {
      class: "event-item",
      "data-id": ev.event_id,
      onclick: () => onSelect(ev.event_id),
    }, [
      el("div", { class: "event-title", text: ev.title || "(sin título)" }),
      el("div", { class: "event-meta" }, [
        el("span", { text: `${ev.date} ${ev.time}` }),
        el("span", { text: ev.place_name || "" }),
      ])
    ]);

    listEl.appendChild(item);
    itemsById.set(ev.event_id, item);
  }

  const detail = el("div", { id: "eventDetail", class: "event-detail" }, []);
  listEl.appendChild(detail);

  return { itemsById, detailEl: detail };
}

function renderEventDetail(ev, detailEl) {
  detailEl.innerHTML = "";

  const chips = el("div", { class: "chips" },
    (ev.symbols || []).map((t) => el("span", { class: "chip", text: t }))
  );

  const acts = (ev.acts || []).length ? (ev.acts || []).join(" • ") : "";
  const scene = (ev.scene || []).length ? (ev.scene || []).join(" • ") : "";

  // ---- FOTOS (anti-429): 3 miniaturas + botón para cargar el resto ----
  const photos = (ev.photos || []);
  const MAX_THUMBS = 3;

  const photoGrid = el("div", { class: "media-grid" }, []);
  const photoLinks = el("div", { class: "linklist" }, []);

  const thumbUrls = photos.slice(0, MAX_THUMBS).map((u) => driveToThumb(u, 800));
  const remaining = photos.slice(MAX_THUMBS).map((u) => driveToThumb(u, 800));

  // Render de miniaturas iniciales (lazy)
  for (const url of thumbUrls) {
    if (isLikelyImageUrl(url)) {
      const a = el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, [
        el("img", { class: "thumb", src: url, alt: "Foto del evento", loading: "lazy" })
      ]);
      photoGrid.appendChild(a);
    } else {
      photoLinks.appendChild(el("a", {
        href: url, target: "_blank", rel: "noopener noreferrer", text: "Foto (link)"
      }));
    }
  }

  // Botón para cargar más (bajo demanda, con límite de concurrencia)
  let moreBtn = null;
  if (remaining.length) {
    moreBtn = el("button", {
      type: "button",
      class: "load-more",
      text: `Cargar ${remaining.length} foto(s) más`,
      onclick: () => {
  // 1) Quitamos el botón de inmediato para que no se quede trabado
  moreBtn.remove();

  // 2) Pintamos el resto inmediatamente (lazy)
  for (const url of remaining) {
    const a = el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, [
      el("img", { class: "thumb", src: url, alt: "Foto del evento", loading: "lazy" })
    ]);
    photoGrid.appendChild(a);
  }
}
    });
  }

  // ---- VIDEOS: solo en ficha detallada (como pediste) ----
  const videos = (ev.videos || []);
  const videoBox = el("div", { class: "linklist" }, []);
  for (const url of videos) {
    const embed = toYouTubeEmbed(url);
    if (embed) {
      videoBox.appendChild(el("iframe", {
        class: "video-embed",
        src: embed,
        allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
        allowfullscreen: "true",
        title: "Video de YouTube"
      }));
    } else {
      videoBox.appendChild(el("a", {
        href: url, target: "_blank", rel: "noopener noreferrer", text: "Video (link)"
      }));
    }
  }

  detailEl.appendChild(el("h3", { class: "detail-title", text: ev.title || "(sin título)" }));
  detailEl.appendChild(el("div", {
    class: "detail-block",
    text: `${ev.date} ${ev.time} — ${ev.place_name || ""}${ev.address ? " — " + ev.address : ""}`
  }));

  if (acts) detailEl.appendChild(el("div", { class: "detail-block", text: `Actos: ${acts}` }));
  if (scene) detailEl.appendChild(el("div", { class: "detail-block", text: `Escena: ${scene}` }));

  if (ev.description) detailEl.appendChild(el("div", { class: "detail-block", text: ev.description }));
  if (ev.reflection) detailEl.appendChild(el("div", { class: "detail-block", text: ev.reflection }));

  if ((ev.symbols || []).length) {
    detailEl.appendChild(el("div", { class: "detail-block", text: "Indicadores:" }));
    detailEl.appendChild(chips);
  }

  if (photos.length) {
    detailEl.appendChild(el("div", { class: "detail-block", text: "Fotos:" }));
    if (photoGrid.childNodes.length) detailEl.appendChild(photoGrid);
    if (photoLinks.childNodes.length) detailEl.appendChild(photoLinks);
    if (moreBtn) detailEl.appendChild(moreBtn);
  }

  if (videos.length) {
    detailEl.appendChild(el("div", { class: "detail-block", text: "Videos:" }));
    detailEl.appendChild(videoBox);
  }
}

// IMPORTANTE: NO pisar el Map nativo (JS) con el Map de Google Maps
async function initMap(events) {
  await loadGoogleMaps();

  const { Map: GoogleMap } = await google.maps.importLibrary("maps");
  const { Marker } = await google.maps.importLibrary("marker");

  const mapEl = document.getElementById("map");
  if (!mapEl) throw new Error('No existe el contenedor #map en el DOM.');

  const map = new GoogleMap(mapEl, {
    center: CDJ_CENTER,
    zoom: INITIAL_ZOOM,
  });

  const markersById = new Map(); // Map nativo de JS
  const bounds = new google.maps.LatLngBounds();

  if (!events || events.length === 0) {
    console.warn("No hay eventos para mostrar.");
    return { map, markersById, bounds: null };
  }

  for (const ev of events) {
    const pos = { lat: ev.lat, lng: ev.lng };
    bounds.extend(pos);

    const marker = new Marker({
      map,
      position: pos,
      title: ev.title || ev.event_id,
    });

    markersById.set(ev.event_id, marker);
  }

  if (events.length === 1) {
    map.setCenter({ lat: events[0].lat, lng: events[0].lng });
    map.setZoom(15);
  } else {
    map.fitBounds(bounds, 60);
  }

  console.log("Mapa listo con eventos:", events.length);
  return { map, markersById, bounds };
}

loadEventsFromCSV()
  .then((events) => {
    diagnostics(events);
    return initMap(events).then(({ map, markersById }) => ({ events, map, markersById }));
  })
  .then(({ events, map, markersById }) => {
    const { itemsById, detailEl } = renderSidebar(events, selectEvent);

    let selectedId = null;

    for (const ev of events) {
      const marker = markersById.get(ev.event_id);
      if (!marker) continue;
      marker.addListener("click", () => selectEvent(ev.event_id));
    }

    function selectEvent(eventId) {
      const ev = events.find((e) => e.event_id === eventId);
      if (!ev) return;

      if (selectedId && itemsById.get(selectedId)) itemsById.get(selectedId).classList.remove("active");
      if (itemsById.get(eventId)) itemsById.get(eventId).classList.add("active");
      selectedId = eventId;

      map.panTo({ lat: ev.lat, lng: ev.lng });

      renderEventDetail(ev, detailEl);
    }

    if (events.length) selectEvent(events[0].event_id);
  })
  .catch((err) => {
    console.error(err);
    alert(err?.message || "Error cargando CSV/Mapa/UI. Revisa consola.");
  });