/* global window */

(function () {
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
        else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
        else if (c === "\r") {}
        else field += c;
      }
    }
    row.push(field);
    rows.push(row);
    return rows.filter(r => r.some(x => String(x).trim() !== ""));
  }

  function splitList(value, sep = "|") {
    if (!value) return [];
    return String(value).split(sep).map(s => s.trim()).filter(Boolean);
  }

  function toNumber(value) {
    if (value === "" || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function parseDateFlexible(s) {
    if (!s) return null;
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y,m,d] = s.split("-").map(Number);
      return new Date(Date.UTC(y, m-1, d));
    }
    // MM/DD/YY or MM/DD/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
      const [mm,dd,yy] = s.split("/").map(Number);
      const year = yy < 100 ? (2000 + yy) : yy;
      return new Date(Date.UTC(year, mm-1, dd));
    }
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t) : null;
  }

  function isoDate(dateObj) {
    if (!dateObj) return "";
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth()+1).padStart(2,"0");
    const d = String(dateObj.getUTCDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }

  function parsePlus18(v) {
    if (v === "" || v == null) return null;
    const s = String(v).trim().toLowerCase();
    if (s === "1" || s === "true" || s === "sí" || s === "si") return 1;
    if (s === "0" || s === "false" || s === "no") return 0;
    return null;
  }

  function parsePriceRange(v) {
    if (!v) return { min: null, max: null, mid: null };
    const parts = String(v).split("|").map(x => x.trim()).filter(Boolean);
    if (!parts.length) return { min: null, max: null, mid: null };
    const a = toNumber(parts[0]);
    const b = toNumber(parts[1] ?? parts[0]);
    if (a == null || b == null) return { min: null, max: null, mid: null };
    const min = Math.min(a,b), max = Math.max(a,b);
    return { min, max, mid: (min+max)/2 };
  }

  async function loadEvents(csvPath = "../eventos.csv") {
    const res = await fetch(csvPath);
    if (!res.ok) throw new Error(`No se pudo cargar CSV: ${res.status} ${res.statusText}`);
    const text = await res.text();

    const rows = parseCSV(text);
    const header = rows[0].map(h => String(h).trim());
    const idx = Object.fromEntries(header.map((h,i)=>[h,i]));

    function get(row, col) {
      return idx[col] != null ? String(row[idx[col]] ?? "").trim() : "";
    }

    const events = rows.slice(1).map((r) => {
      const dateRaw = get(r,"date");
      const dateObj = parseDateFlexible(dateRaw);
      const price = parsePriceRange(get(r,"price"));

      return {
        event_id: get(r,"event_id"),
        title: get(r,"title"),
        acts: splitList(get(r,"acts")),
        scene: splitList(get(r,"scene")),
        date_raw: dateRaw,
        dateObj,
        dateISO: isoDate(dateObj),
        time: get(r,"time"),
        plus18: parsePlus18(get(r,"plus18")),
        priceMin: price.min,
        priceMax: price.max,
        priceMid: price.mid,
        lat: toNumber(get(r,"lat")),
        lng: toNumber(get(r,"lng")),
        place_name: get(r,"place_name"),
        address: get(r,"address"),
        symbols: splitList(get(r,"symbols")),
        photos: splitList(get(r,"photos")),
        videos: splitList(get(r,"videos")),
      };
    }).filter(e => e.event_id);

    events.sort((a,b)=> (a.dateISO+a.time).localeCompare(b.dateISO+b.time));
    return events;
  }

  window.VIZData = { loadEvents };
})();