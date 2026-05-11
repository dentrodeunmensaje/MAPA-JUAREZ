/* global window, document */

(function () {
  const state = {
    filters: {
      plus18: "all",       // all | only1 | only0
      priceMin: null,
      priceMax: null,
      dateFrom: null,      // Date UTC
      dateTo: null,        // Date UTC
      activeScene: null,   // from heatmap click
      activeTag: null,     // from heatmap click
    },
    brush: { active: false, a: null, b: null }, // timeline brush pixels
    onChange: () => {},
  };

  function setOnChange(fn) { state.onChange = fn; }

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const ch of children) n.appendChild(ch);
    return n;
  }

  function buildControls(container) {
    container.innerHTML = "";

    // +18
    container.appendChild(el("div", { class: "control" }, [
      el("label", {}, [
        document.createTextNode("+18"),
        el("select", { onchange: (e) => { state.filters.plus18 = e.target.value; state.onChange(); }}, [
          el("option", { value: "all", text: "Todos" }),
          el("option", { value: "only1", text: "Solo +18" }),
          el("option", { value: "only0", text: "Solo no +18" }),
        ])
      ])
    ]));

    // Precio
    container.appendChild(el("div", { class: "control" }, [
      el("label", { text: "Precio (MXN) — rango (traslape)" }),
      el("div", { class: "row" }, [
        el("label", {}, [
          document.createTextNode("Mín"),
          el("input", {
            type: "number",
            placeholder: "—",
            onchange: (e) => { state.filters.priceMin = e.target.value === "" ? null : Number(e.target.value); state.onChange(); }
          })
        ]),
        el("label", {}, [
          document.createTextNode("Máx"),
          el("input", {
            type: "number",
            placeholder: "—",
            onchange: (e) => { state.filters.priceMax = e.target.value === "" ? null : Number(e.target.value); state.onChange(); }
          })
        ]),
      ])
    ]));

    // Reset
    container.appendChild(el("div", { class: "control" }, [
      el("button", {
        onclick: () => {
          state.filters.plus18 = "all";
          state.filters.priceMin = null;
          state.filters.priceMax = null;
          state.filters.dateFrom = null;
          state.filters.dateTo = null;
          state.filters.activeScene = null;
          state.filters.activeTag = null;
          state.brush = { active: false, a: null, b: null };
          buildControls(container); // re-render
          state.onChange();
        }
      }, [document.createTextNode("Reset")])
    ]));
  }

  function setHeatmapSelection(scene, tag) {
    // toggle: si ya está seleccionado, lo limpia
    if (state.filters.activeScene === scene && state.filters.activeTag === tag) {
      state.filters.activeScene = null;
      state.filters.activeTag = null;
    } else {
      state.filters.activeScene = scene;
      state.filters.activeTag = tag;
    }
    state.onChange();
  }

  function setDateRange(fromDate, toDate) {
    state.filters.dateFrom = fromDate;
    state.filters.dateTo = toDate;
    state.onChange();
  }

  function setSelectionText(text) {
    const elSel = document.getElementById("selection");
    if (elSel) elSel.textContent = text || "—";
  }

  window.VIZUI = {
    state,
    setOnChange,
    buildControls,
    setHeatmapSelection,
    setDateRange,
    setSelectionText,
  };
})();