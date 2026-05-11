/* global window, document, createCanvas, resizeCanvas, background, text, fill, stroke, noStroke, noFill, rect, ellipse, line, mouseX, mouseY, mouseIsPressed, color, lerpColor, map, constrain, textAlign, CENTER, LEFT, TOP, RIGHT, BOTTOM */

let EVENTS = [];
let FILTERED = [];

let SCENES = [];
let TAGS = [];         // top tags for heatmap
let sceneColor = new Map();

let canvas;
let layout = {
  W: 800, H: 600,
  pad: 24,
  timeline: { x: 24, y: 24, w: 760, h: 240 },
  heatmap: { x: 24, y: 300, w: 760, h: 260 },
};

let dateMin = null, dateMax = null;

function setup() {
  const wrap = document.getElementById("canvasWrap");
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  canvas = createCanvas(w, h);
  canvas.parent("canvasWrap");
  textFont("system-ui");
  textSize(12);

  initApp();
}

async function initApp() {
  const controls = document.getElementById("controls");
  window.VIZUI.buildControls(controls);
  window.VIZUI.setOnChange(recomputeAll);

  EVENTS = await window.VIZData.loadEvents("../eventos.csv");

  // scenes list
  const sset = new Set();
  const tset = new Map(); // tag->count
  for (const ev of EVENTS) {
    (ev.scene.length ? ev.scene : ["(sin escena)"]).forEach(s => sset.add(s));
    (ev.symbols || []).forEach(t => tset.set(t, (tset.get(t) || 0) + 1));
  }
  SCENES = Array.from(sset).sort((a,b)=>a.localeCompare(b));

  // choose top tags by frequency (cap 18-22 for readability)
  TAGS = Array.from(tset.entries())
    .sort((a,b)=>b[1]-a[1])
    .slice(0, 18)
    .map(([t])=>t);

  // date domain
  const dates = EVENTS.map(e=>e.dateObj).filter(Boolean).sort((a,b)=>a-b);
  dateMin = dates[0] || new Date();
  dateMax = dates[dates.length-1] || new Date();

  // color palette per scene (stable hash)
  sceneColor = new Map();
  for (const s of SCENES) sceneColor.set(s, sceneToColor(s));

  recomputeAll();
}

function windowResized() {
  const wrap = document.getElementById("canvasWrap");
  resizeCanvas(wrap.clientWidth, wrap.clientHeight);
}

function draw() {
  background(255);
  computeLayout();

  drawTimeline();
  drawHeatmap();
}

function computeLayout() {
  const W = width, H = height;
  const pad = 18;
  const topH = Math.floor(H * 0.46);
  layout = {
    W, H, pad,
    timeline: { x: pad, y: pad, w: W - pad*2, h: topH - pad },
    heatmap: { x: pad, y: topH + 8, w: W - pad*2, h: H - (topH + 8) - pad },
  };
}

function recomputeAll() {
  FILTERED = applyFilters(EVENTS);

  // update selection text
  const f = window.VIZUI.state.filters;
  const selParts = [];
  if (f.dateFrom || f.dateTo) selParts.push(`Fecha: ${fmtISO(f.dateFrom)} → ${fmtISO(f.dateTo)}`);
  if (f.plus18 !== "all") selParts.push(f.plus18 === "only1" ? "+18" : "No +18");
  if (f.priceMin != null || f.priceMax != null) selParts.push(`Precio: ${f.priceMin ?? "—"} → ${f.priceMax ?? "—"}`);
  if (f.activeScene && f.activeTag) selParts.push(`Heatmap: ${f.activeScene} × ${f.activeTag}`);
  selParts.push(`N=${FILTERED.length}`);
  window.VIZUI.setSelectionText(selParts.join(" · "));

  // render list
  renderList(FILTERED);
}

function applyFilters(events) {
  const f = window.VIZUI.state.filters;
  const out = [];

  for (const ev of events) {
    // brush date range
    if (f.dateFrom && ev.dateObj && ev.dateObj < f.dateFrom) continue;
    if (f.dateTo && ev.dateObj && ev.dateObj > f.dateTo) continue;

    // +18
    if (f.plus18 === "only1" && ev.plus18 !== 1) continue;
    if (f.plus18 === "only0" && ev.plus18 !== 0) continue;

    // price overlap: eventMax >= A && eventMin <= B
    if (f.priceMin != null || f.priceMax != null) {
      if (ev.priceMin == null || ev.priceMax == null) continue;
      const A = (f.priceMin != null) ? f.priceMin : -Infinity;
      const B = (f.priceMax != null) ? f.priceMax : Infinity;
      if (!(ev.priceMax >= A && ev.priceMin <= B)) continue;
    }

    // heatmap cell filter (scene+tag)
    if (f.activeScene && f.activeTag) {
      const sc = ev.scene.length ? ev.scene : ["(sin escena)"];
      const hasScene = sc.includes(f.activeScene);
      const hasTag = (ev.symbols || []).includes(f.activeTag);
      if (!(hasScene && hasTag)) continue;
    }

    out.push(ev);
  }
  return out;
}

function renderList(events) {
  const list = document.getElementById("list");
  list.innerHTML = "";

  const max = 120; // no saturar DOM
  const slice = events.slice(0, max);

  for (const ev of slice) {
    const div = document.createElement("div");
    div.className = "item";

    const t = document.createElement("div");
    t.className = "t";
    t.textContent = ev.title || "(sin título)";

    const m = document.createElement("div");
    m.className = "m";

    const b1 = badge(`${ev.dateISO || ev.date_raw} ${ev.time}`);
    const b2 = badge(ev.scene.join(" • ") || "(sin escena)");
    const b3 = ev.plus18 === 1 ? badge("+18") : (ev.plus18 === 0 ? badge("No +18") : null);
    const b4 = (ev.priceMin != null && ev.priceMax != null) ? badge(`$${ev.priceMin}–$${ev.priceMax}`) : null;

    m.appendChild(b1);
    m.appendChild(b2);
    if (b3) m.appendChild(b3);
    if (b4) m.appendChild(b4);

    div.appendChild(t);
    div.appendChild(m);
    list.appendChild(div);
  }

  if (events.length > max) {
    const more = document.createElement("div");
    more.className = "item muted";
    more.textContent = `Mostrando ${max} de ${events.length} (refina filtros para ver menos)`;
    list.appendChild(more);
  }
}

function badge(txt) {
  const s = document.createElement("span");
  s.className = "badge";
  s.textContent = txt;
  return s;
}

function fmtISO(d) {
  if (!d) return "—";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,"0");
  const dd = String(d.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

// ---------- Timeline ----------
function drawTimeline() {
  const r = layout.timeline;
  stroke(230); fill(250);
  rect(r.x, r.y, r.w, r.h, 12);

  // title
  noStroke(); fill(30);
  textAlign(LEFT, TOP);
  text("Timeline (tamaño = precio midpoint, borde = +18)", r.x + 12, r.y + 10);

  // axes area
  const ax = { x: r.x + 12, y: r.y + 34, w: r.w - 24, h: r.h - 52 };

  // draw baseline
  stroke(200);
  line(ax.x, ax.y + ax.h, ax.x + ax.w, ax.y + ax.h);

  // points
  for (const ev of FILTERED) {
    if (!ev.dateObj) continue;
    const x = ax.x + dateToX(ev.dateObj, ax.w);
    const y = ax.y + ax.h - (Math.random() * 0.85 + 0.1) * ax.h; // jitter vertical

    const sc = ev.scene.length ? ev.scene[0] : "(sin escena)";
    const c = sceneColor.get(sc) || color(0);

    const mid = ev.priceMid != null ? ev.priceMid : 0;
    const rad = priceToRadius(mid);

    // +18: stroke heavy
    if (ev.plus18 === 1) { stroke(0); strokeWeight(2); }
    else { stroke(120); strokeWeight(1); }

    fill(c);
    ellipse(x, y, rad*2, rad*2);
  }

  // brush overlay
  drawBrush(ax);

  // bottom labels
  noStroke(); fill(100);
  textAlign(LEFT, BOTTOM);
  text(fmtISO(dateMin), ax.x, ax.y + ax.h + 18);
  textAlign(RIGHT, BOTTOM);
  text(fmtISO(dateMax), ax.x + ax.w, ax.y + ax.h + 18);

  // capture interactions
  handleBrush(ax);
}

function dateToX(d, w) {
  const t = d.getTime();
  const a = dateMin.getTime();
  const b = dateMax.getTime();
  if (b <= a) return 0;
  return ((t - a) / (b - a)) * w;
}

function xToDate(x, w) {
  const a = dateMin.getTime();
  const b = dateMax.getTime();
  const t = a + (x / w) * (b - a);
  return new Date(t);
}

function priceToRadius(mid) {
  // escala suave con sqrt
  const v = Math.max(0, mid);
  const r = Math.sqrt(v);
  return constrain(map(r, 0, 20, 3.5, 14), 3.5, 14);
}

function drawBrush(ax) {
  const b = window.VIZUI.state.brush;
  if (!b.active || b.a == null || b.b == null) return;

  const x1 = Math.min(b.a, b.b);
  const x2 = Math.max(b.a, b.b);
  noStroke();
  fill(0, 0, 0, 25);
  rect(ax.x + x1, ax.y, x2 - x1, ax.h);
}

function handleBrush(ax) {
  const b = window.VIZUI.state.brush;

  // start drag in timeline axes
  const inside = mouseX >= ax.x && mouseX <= ax.x + ax.w && mouseY >= ax.y && mouseY <= ax.y + ax.h;

  if (mouseIsPressed && inside && !b.dragging) {
    b.dragging = true;
    b.active = true;
    b.a = constrain(mouseX - ax.x, 0, ax.w);
    b.b = b.a;
  }

  if (b.dragging) {
    b.b = constrain(mouseX - ax.x, 0, ax.w);
  }

  if (!mouseIsPressed && b.dragging) {
    b.dragging = false;

    const x1 = Math.min(b.a, b.b);
    const x2 = Math.max(b.a, b.b);

    // tiny drag cancels
    if (Math.abs(x2 - x1) < 6) {
      b.active = false;
      b.a = b.b = null;
      window.VIZUI.setDateRange(null, null);
      return;
    }

    const d1 = xToDate(x1, ax.w);
    const d2 = xToDate(x2, ax.w);

    // normalize to UTC day boundaries
    const from = new Date(Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate()));
    const to = new Date(Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate(), 23, 59, 59));

    window.VIZUI.setDateRange(from, to);
  }
}

// ---------- Heatmap ----------
function drawHeatmap() {
  const r = layout.heatmap;
  stroke(230); fill(250);
  rect(r.x, r.y, r.w, r.h, 12);

  noStroke(); fill(30);
  textAlign(LEFT, TOP);
  text("Heatmap: escena × particularidades (conteo)", r.x + 12, r.y + 10);

  const grid = { x: r.x + 12, y: r.y + 34, w: r.w - 24, h: r.h - 46 };

  // compute matrix counts from FILTERED
  const counts = new Map(); // key scene|tag => count
  const rowTotals = new Map();
  const colTotals = new Map();

  for (const ev of FILTERED) {
    const scenes = ev.scene.length ? ev.scene : ["(sin escena)"];
    for (const sc of scenes) {
      for (const tag of (ev.symbols || [])) {
        if (!TAGS.includes(tag)) continue; // only top tags shown
        const k = sc + "|" + tag;
        counts.set(k, (counts.get(k) || 0) + 1);
        rowTotals.set(sc, (rowTotals.get(sc) || 0) + 1);
        colTotals.set(tag, (colTotals.get(tag) || 0) + 1);
      }
    }
  }

  const rows = SCENES;
  const cols = TAGS;

  const cellW = grid.w / Math.max(cols.length, 1);
  const cellH = grid.h / Math.max(rows.length, 1);

  // find max cell for scaling
  let maxC = 1;
  for (const v of counts.values()) maxC = Math.max(maxC, v);

  // draw cells
  for (let ri = 0; ri < rows.length; ri++) {
    const sc = rows[ri];
    for (let ci = 0; ci < cols.length; ci++) {
      const tag = cols[ci];
      const k = sc + "|" + tag;
      const c = counts.get(k) || 0;

      const x = grid.x + ci * cellW;
      const y = grid.y + ri * cellH;

      // intensity
      const t = c / maxC;
      const base = color(250);
      const ink = color(30);
      const col = lerpColor(base, ink, t * 0.85);

      noStroke();
      fill(col);
      rect(x, y, cellW, cellH);

      // number
      if (cellW > 22 && cellH > 14 && c > 0) {
        fill(t > 0.55 ? 255 : 40);
        textAlign(CENTER, CENTER);
        text(String(c), x + cellW/2, y + cellH/2);
      }
    }
  }

  // grid lines
  stroke(235);
  for (let ci = 0; ci <= cols.length; ci++) {
    const x = grid.x + ci * cellW;
    line(x, grid.y, x, grid.y + grid.h);
  }
  for (let ri = 0; ri <= rows.length; ri++) {
    const y = grid.y + ri * cellH;
    line(grid.x, y, grid.x + grid.w, y);
  }

  // labels (top and left)
  noStroke();
  fill(80);
  textSize(10);

  // top tag labels (rotated)
  for (let ci = 0; ci < cols.length; ci++) {
    const tag = cols[ci];
    const x = grid.x + ci * cellW + 4;
    const y = grid.y - 6;
    push();
    translate(x, y);
    rotate(-PI/4);
    textAlign(LEFT, BOTTOM);
    text(tag.slice(0, 18), 0, 0);
    pop();
  }

  // left scene labels
  for (let ri = 0; ri < rows.length; ri++) {
    const sc = rows[ri];
    const x = grid.x - 6;
    const y = grid.y + ri * cellH + cellH/2;
    textAlign(RIGHT, CENTER);
    text(sc.slice(0, 18), x, y);
  }

  textSize(12);

  // click handling
  handleHeatmapClick(grid, rows, cols, cellW, cellH);
}

function handleHeatmapClick(grid, rows, cols, cellW, cellH) {
  // simple click detection (on mouse release)
  if (!mouseIsPressed) return;
  // we’ll only trigger on press-to-release edge using a latch
  if (!window.__hmLatch) window.__hmLatch = { down: false };
  const latch = window.__hmLatch;

  const inside = mouseX >= grid.x && mouseX <= grid.x + grid.w && mouseY >= grid.y && mouseY <= grid.y + grid.h;

  if (mouseIsPressed && inside && !latch.down) {
    latch.down = true;
    latch.x = mouseX; latch.y = mouseY;
  }

  if (!mouseIsPressed && latch.down) {
    latch.down = false;
  }

  // trigger on press only (avoids double)
  if (latch.down && inside) {
    const ci = Math.floor((mouseX - grid.x) / cellW);
    const ri = Math.floor((mouseY - grid.y) / cellH);
    if (ri >= 0 && ri < rows.length && ci >= 0 && ci < cols.length) {
      const scene = rows[ri];
      const tag = cols[ci];
      window.VIZUI.setHeatmapSelection(scene, tag);
      latch.down = false; // consume click
    }
  }
}

function sceneToColor(scene) {
  // deterministic hash -> grayscale-ish palette
  let h = 0;
  for (let i = 0; i < scene.length; i++) h = (h * 31 + scene.charCodeAt(i)) >>> 0;
  const r = 40 + (h % 180);
  const g = 40 + ((h >> 8) % 180);
  const b = 40 + ((h >> 16) % 180);
  return color(r, g, b, 210);
}