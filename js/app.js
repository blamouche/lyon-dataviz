/* ============================================================
   Lyon Data — logique applicative
   - Catalogue de couches librement combinables (les thèmes ne
     sont que des présélections)
   - Analyse par zone (arrondissements / quartiers) : comptage
     spatial des objets affichés, zoom sur une zone au clic
   - Choroplèthes DVF (prix) et SSMSI (délinquance)
   ============================================================ */

// ---------- Thème clair / sombre ----------
const THEME_KEY = "lyon-data-theme";
const VALID_THEMES = ["light", "dark"];
function getStoredTheme() {
  const raw = localStorage.getItem(THEME_KEY);
  return VALID_THEMES.includes(raw) ? raw : "light";
}
function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#ffffff";
}
function syncMapBasemapWithTheme(theme) {
  const want = theme === "dark" ? "dark" : "light";
  if (currentBasemap === want) return;
  map.removeLayer(BASEMAPS[currentBasemap]);
  currentBasemap = want;
  BASEMAPS[currentBasemap].addTo(map);
}
function applyTheme(theme, { persist = true, syncBasemap = true } = {}) {
  if (!VALID_THEMES.includes(theme)) theme = "light";
  document.documentElement.setAttribute("data-theme", theme);
  if (persist) localStorage.setItem(THEME_KEY, theme);

  const themeBtn = document.getElementById("btn-theme");
  if (themeBtn) {
    const icon = theme === "dark" ? "fa-sun" : "fa-moon";
    const label = theme === "dark" ? "Clair" : "Sombre";
    themeBtn.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
  }

  if (syncBasemap && typeof map !== "undefined") syncMapBasemapWithTheme(theme);
}
applyTheme(getStoredTheme(), { syncBasemap: false });

// ---------- Carte ----------
const map = L.map("map", { zoomControl: false }).setView([45.7578, 4.8351], 13);
L.control.zoom({ position: "bottomleft" }).addTo(map);
L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

const BASEMAPS = {
  dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19
  }),
  light: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19
  })
};
let currentBasemap = getStoredTheme() === "dark" ? "dark" : "light";
BASEMAPS[currentBasemap].addTo(map);

const themeBtn = document.getElementById("btn-theme");
if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  });
}

// ---------- Barre d'état cartographique ----------
map.on("mousemove", (e) => {
  document.getElementById("sb-coords").textContent =
    `${e.latlng.lat.toFixed(4)} N · ${e.latlng.lng.toFixed(4)} E`;
});
map.on("zoomend", () => {
  document.getElementById("sb-zoom").textContent = `ZOOM ${map.getZoom()}`;
});

// ---------- Sélection de POI (clic sur un marqueur) ----------
map.on("popupopen", (e) => {
  const source = e.popup._source;
  if (source?._layerDef && source?._poiProps) {
    selectedPoi = { def: source._layerDef, props: source._poiProps, source,
      color: source._poiColor || source._layerDef.color };
    updateInsights();
  }
});
map.on("popupclose", (e) => {
  const source = e.popup._source;
  if (selectedPoi && selectedPoi.source === source) {
    selectedPoi = null;
    updateInsights();
  }
});

function updateObjectCount() {
  let total = 0;
  for (const layer of activeLayers.values()) total += layer._featureCount || 0;
  document.getElementById("sb-objects").textContent =
    `${total.toLocaleString("fr-FR")} OBJETS`;
}

// ---------- État ----------
const ALL_LAYERS = [];
THEMES.forEach((t) => t.layers.forEach((l) => {
  l.themeId = t.id; l.themeLabel = t.label; l.themeEmoji = t.emoji;
  ALL_LAYERS.push(l);
}));
const LAYER_BY_ID = new Map(ALL_LAYERS.map((l) => [l.id, l]));

const layerCache = new Map();   // layerId -> Promise<L.Layer>
const activeLayers = new Map(); // layerId -> L.Layer
const activeThemes = new Set(); // thèmes actuellement sélectionnés (filtre multi-thèmes)
let dvfDataPromise = null;
let arrondGeojsonPromise = null;

// Indicateur de délinquance affiché (modifiable via le sélecteur)
let crimeIndicator = window.DELINQUANCE_DATA
  ? "__all__"
  : null;

// Analyse par zone
const zoneState = {
  enabled: false,
  level: "arrond",
  geojsonCache: new Map(),  // level -> Promise<geojson>
  countCache: new Map(),    // `${level}:${layerId}` -> Map(zoneId -> count)
  layer: null,              // L.geoJSON des zones
  labels: null,             // L.layerGroup des étiquettes
  selectedId: null
};

// POI sélectionné (clic sur un marqueur de la carte)
let selectedPoi = null; // { def, props }

const $ = (sel) => document.querySelector(sel);

// ---------- Statut ----------
let statusTimer = null;
function showStatus(msg, isError = false) {
  const el = $("#status");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.hidden = false;
  clearTimeout(statusTimer);
  if (isError) statusTimer = setTimeout(() => { el.hidden = true; }, 6000);
}
function hideStatus() {
  clearTimeout(statusTimer);
  $("#status").hidden = true;
}

// ============================================================
// Interface : présélections + catalogue
// ============================================================
const themeGrid = $("#theme-grid");
THEMES.forEach((theme) => {
  const btn = document.createElement("button");
  btn.className = "theme-btn";
  btn.dataset.theme = theme.id;
  btn.innerHTML = `<span class="emoji">${theme.emoji}</span><span>${theme.label}</span>`;
  btn.addEventListener("click", () => toggleTheme(theme));
  themeGrid.appendChild(btn);
});

// Catalogue complet, groupé par famille
const catalog = $("#layer-catalog");
const subgroupSyncFns = []; // resynchronisation des cases maîtresses de sous-rubrique
THEMES.forEach((theme) => {
  const details = document.createElement("details");
  details.className = "layer-group";
  details.id = `grp-${theme.id}`;
  details.open = false;
  details.innerHTML = `<summary>${theme.emoji} ${theme.label}
      <span class="grp-count" id="grpcount-${theme.id}"></span></summary>`;
  const ul = document.createElement("ul");
  ul.className = "layer-list";
  // Certaines couches déclarent une sous-rubrique (ex. Transports →
  // Métro / Tramway / Bus) : on les regroupe dans un <details> imbriqué
  // doté d'une case maîtresse « tout activer / désactiver ».
  const subLists = new Map(); // libellé de sous-rubrique -> <ul> cible
  theme.layers.forEach((def) => {
    const item = buildLayerItem(def);
    if (!def.subgroup) { ul.appendChild(item); return; }
    let subUl = subLists.get(def.subgroup);
    if (!subUl) {
      const sub = document.createElement("details");
      sub.className = "layer-subgroup";
      sub.open = true;

      const summary = document.createElement("summary");
      const master = document.createElement("input");
      master.type = "checkbox";
      master.className = "subgroup-toggle";
      master.title = "Tout activer / désactiver";
      const label = document.createElement("span");
      label.className = "subgroup-label";
      label.textContent = def.subgroup;
      summary.append(master, label);
      sub.appendChild(summary);

      subUl = document.createElement("ul");
      subUl.className = "layer-list";
      sub.appendChild(subUl);

      const childChecks = () =>
        [...subUl.querySelectorAll(".layer-item > input[type=checkbox]")];
      // La case maîtresse pilote les couches de la sous-rubrique…
      master.addEventListener("click", (e) => e.stopPropagation()); // ne replie pas le <details>
      master.addEventListener("change", () => {
        childChecks().forEach((c) => {
          if (c.checked !== master.checked) {
            c.checked = master.checked;
            c.dispatchEvent(new Event("change"));
          }
        });
      });
      // …et reflète l'état réel des couches (cochée / mixte / décochée).
      const sync = () => {
        const kids = childChecks();
        const on = kids.filter((c) => c.checked).length;
        master.checked = kids.length > 0 && on === kids.length;
        master.indeterminate = on > 0 && on < kids.length;
      };
      subUl.addEventListener("change", sync); // clic sur une couche enfant
      subgroupSyncFns.push(sync);

      const wrapper = document.createElement("li");
      wrapper.className = "layer-subgroup-item";
      wrapper.appendChild(sub);
      ul.appendChild(wrapper);
      subLists.set(def.subgroup, subUl);
    }
    subUl.appendChild(item);
  });
  details.appendChild(ul);
  catalog.appendChild(details);
});
// Resynchronise les cases maîtresses des sous-rubriques avec l'état des couches
// (utile après toggleTheme, qui coche les couches sans émettre d'événement).
function syncSubgroupToggles() { subgroupSyncFns.forEach((fn) => fn()); }

function buildLayerItem(def) {
  const li = document.createElement("li");
  li.className = "layer-item";
  li.dataset.name = def.name.toLowerCase();
  li.innerHTML = `
    <input type="checkbox" id="chk-${def.id}">
    <span class="layer-swatch ${def.geom === "line" ? "line" : ""} ${def.geom === "ramp" ? "ramp" : ""}"
          style="background:${def.color}"></span>
    <span class="layer-meta">
      <span class="layer-name">${def.name} <span class="layer-status" id="st-${def.id}"></span></span>
      <span class="layer-desc">${def.desc}</span>
    </span>`;
  const chk = li.querySelector("input");
  li.addEventListener("click", (e) => {
    if (e.target.closest("input, select, option")) return;
    chk.checked = !chk.checked;
    chk.dispatchEvent(new Event("change"));
  });
  chk.addEventListener("change", () => toggleLayer(def, chk.checked));

  // Sélecteur d'indicateur pour la couche délinquance
  if (def.type === "delinquance-choropleth" && window.DELINQUANCE_DATA) {
    const select = document.createElement("select");
    select.className = "select-input small";
    select.id = "crime-select";
    // Option "Tout" en première position
    const allOpt = document.createElement("option");
    allOpt.value = "__all__";
    allOpt.textContent = "Tout";
    if (crimeIndicator === "__all__") allOpt.selected = true;
    select.appendChild(allOpt);
    window.DELINQUANCE_DATA.indicateurs.forEach((ind) => {
      const opt = document.createElement("option");
      opt.value = ind;
      opt.textContent = ind;
      if (ind === crimeIndicator) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      crimeIndicator = select.value;
      restyleCrimeLayer();
      refreshPanels();
    });
    li.querySelector(".layer-meta").appendChild(select);
  }
  return li;
}

// Recherche dans le catalogue
$("#layer-search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll(".layer-group").forEach((grp) => {
    let visible = 0;
    grp.querySelectorAll(".layer-item").forEach((li) => {
      const show = !q || li.dataset.name.includes(q);
      li.style.display = show ? "" : "none";
      if (show) visible++;
    });
    // Masque les sous-rubriques sans résultat ; les déplie pendant la recherche
    grp.querySelectorAll(".layer-subgroup-item").forEach((wrap) => {
      const hasMatch = [...wrap.querySelectorAll(".layer-item")]
        .some((li) => li.style.display !== "none");
      wrap.style.display = hasMatch ? "" : "none";
      if (q && hasMatch) wrap.querySelector(".layer-subgroup").open = true;
    });
    grp.style.display = visible ? "" : "none";
    if (q) grp.open = true;
  });
});

// Une présélection agit comme un filtre : plusieurs thèmes peuvent être
// sélectionnés (union de leurs couches par défaut) ou aucun.
function toggleTheme(theme) {
  const already = activeThemes.has(theme.id);
  if (already) {
    activeThemes.delete(theme.id);
    // Retire toutes les couches de ce thème
    for (const def of ALL_LAYERS) {
      if (def.themeId !== theme.id) continue;
      const chk = $(`#chk-${def.id}`);
      if (chk && chk.checked) {
        chk.checked = false;
        toggleLayer(def, false);
      }
    }
  } else {
    activeThemes.add(theme.id);
    // Ajoute les couches par défaut de ce thème sans toucher aux autres
    for (const def of ALL_LAYERS) {
      if (def.themeId !== theme.id || !def.defaultOn) continue;
      const chk = $(`#chk-${def.id}`);
      if (chk && !chk.checked) {
        chk.checked = true;
        toggleLayer(def, true);
      }
    }
  }

  document.querySelectorAll(".theme-btn").forEach((b) =>
    b.classList.toggle("active", activeThemes.has(b.dataset.theme))
  );
  document.querySelectorAll(".layer-group").forEach((grp) => {
    grp.open = activeThemes.has(grp.id.replace("grp-", ""));
  });
  syncSubgroupToggles();
}

// ============================================================
// Activation / désactivation d'une couche
// ============================================================
async function toggleLayer(def, on) {
  const statusEl = $(`#st-${def.id}`);
  if (!on) {
    const layer = activeLayers.get(def.id);
    if (layer) {
      if (layer._destroy) layer._destroy();
      map.removeLayer(layer);
      activeLayers.delete(def.id);
    }
    refreshPanels();
    return;
  }
  try {
    statusEl.innerHTML = '<span class="layer-spinner"></span>';
    const layer = await getLayer(def);
    const chk = $(`#chk-${def.id}`);
    if (!chk || !chk.checked) { statusEl.innerHTML = ""; return; }
    layer.addTo(map);
    if (layer._resume) layer._resume();
    activeLayers.set(def.id, layer);
    statusEl.innerHTML = `<span class="layer-count">${(layer._featureCount ?? 0).toLocaleString("fr-FR")}</span>`;
    refreshPanels();
  } catch (err) {
    console.error(`Erreur de chargement « ${def.name} »`, err);
    statusEl.innerHTML = "⚠️";
    showStatus(`Impossible de charger « ${def.name} ». Réessayez plus tard.`, true);
  }
}

function getLayer(def) {
  if (!layerCache.has(def.id)) {
    const promise = buildLayer(def).catch((err) => {
      layerCache.delete(def.id);
      throw err;
    });
    layerCache.set(def.id, promise);
  }
  return layerCache.get(def.id);
}

function buildLayer(def) {
  switch (def.type) {
    case "wfs": return buildWfsLayer(def);
    case "velov": return buildVelovLayer(def);
    case "overpass": return buildOverpassLayer(def);
    case "vehicles": return buildVehicleLayer(def);
    case "dvf-choropleth": return buildDvfChoropleth(def);
    case "dvf-points": return buildDvfPoints(def);
    case "delinquance-choropleth": return buildCrimeLayer(def);
    case "eau-potable-choropleth": return buildEauPotableLayer(def);
    default: throw new Error(`Type de couche inconnu : ${def.type}`);
  }
}

function refreshPanels() {
  updateLegend();
  updateObjectCount();
  updateGroupCounts();
  if (zoneState.enabled) updateZoneOverlay();
  updateInsights();
}

function updateGroupCounts() {
  THEMES.forEach((t) => {
    const n = t.layers.filter((l) => activeLayers.has(l.id)).length;
    const el = $(`#grpcount-${t.id}`);
    if (el) el.textContent = n ? `${n} active${n > 1 ? "s" : ""}` : "";
  });
}

// ---------- Popups ----------
function fmtValue(v) {
  if (v === true) return "Oui";
  if (v === false) return "Non";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function buildPopup(def, props) {
  const cfg = def.popup || {};
  let title = cfg.title ? props[cfg.title] : null;
  if (title == null || title === "") {
    for (const k of ["nom", "name", "titre", "adresse", "libelle"]) {
      if (props[k]) { title = props[k]; break; }
    }
  }
  let html = `<div class="popup-title">${title ?? def.name}</div>`;
  for (const row of cfg.rows || []) {
    const [label, field, formatter] = row;
    let v = props[field];
    if (formatter) v = formatter(v);
    if (v == null || v === "" || v === "None") continue;
    html += `<div class="popup-row"><span class="k">${label} :</span><span>${fmtValue(v)}</span></div>`;
  }
  html += `<div class="popup-src">Source : ${def.source}</div>`;
  return html;
}

// ---------- Fiche POI dans le panneau de droite ----------
function poiRow(label, value, highlight = false) {
  return `<div class="poi-row"><span class="poi-k">${label}</span><span class="poi-v${highlight ? " poi-highlight" : ""}">${value}</span></div>`;
}

function buildPoiDetailHtml(def, props, color) {
  const dotColor = color || def.color;
  const cfg = def.popup || {};
  // Titre
  let title = cfg.title ? props[cfg.title] : null;
  if (title == null || title === "") {
    for (const k of ["nom", "name", "titre", "adresse", "libelle"]) {
      if (props[k]) { title = props[k]; break; }
    }
  }
  title = title ?? def.name;

  // Construction des lignes de détail — cas spéciaux d'abord
  let rows = "";

  // Vélo'v
  if (props.bikes != null && props.stands != null) {
    if (props.name) rows += poiRow("Station", props.name);
    rows += poiRow("Vélos disponibles", props.bikes, true);
    rows += poiRow("Places libres", props.stands);
    if (props.address) rows += poiRow("Adresse", props.address);
  }
  // Véhicules TCL
  else if (props.ligne != null && props.direction != null) {
    rows += poiRow("Ligne", props.ligne, true);
    rows += poiRow("Direction", props.direction);
    if (props.departure) rows += poiRow("Départ", props.departure);
    if (props.progress != null) rows += poiRow("Progression", props.progress + " %");
  }
  // Choroplèthe DVF (arrondissement)
  else if (props.medianPrice != null) {
    if (props.nomreduit || props.nom) rows += poiRow("Arrondissement", props.nomreduit || props.nom);
    rows += poiRow("Prix médian", props.medianPrice ? Math.round(props.medianPrice).toLocaleString("fr-FR") + " €/m²" : "N/A", true);
    if (props.salesCount != null) rows += poiRow("Ventes analysées", props.salesCount);
  }
  // Vente DVF (point)
  else if (props.price != null && props.ppm2 != null) {
    if (props.title) rows += poiRow("Type", props.title);
    rows += poiRow("Prix de vente", Math.round(props.price).toLocaleString("fr-FR") + " €", true);
    rows += poiRow("Prix au m²", Math.round(props.ppm2).toLocaleString("fr-FR") + " €/m²");
    if (props.date) rows += poiRow("Date de vente", props.date);
  }
  // Config popup standard (WFS, etc.)
  else if (cfg.rows && cfg.rows.length) {
    for (const row of cfg.rows) {
      const [label, field, formatter] = row;
      let v = props[field];
      if (formatter) v = formatter(v);
      if (v == null || v === "" || v === "None") continue;
      rows += poiRow(label, fmtValue(v));
    }
  }
  // Fallback : afficher les props utiles (Overpass, etc.)
  else {
    const show = ["address", "adresse", "opening_hours", "horaires",
      "phone", "telephone", "type", "soustheme", "nature",
      "statut_public_prive", "capacite", "gestionnaire", "pmr", "ascenseur",
      "desserte_merged", "typeamenagement", "reseau",
      "infoloc", "acceslibre", "dispohoraires", "precision_horaires",
      "commune", "surf_tot_m2", "jourtenue", "senscirculation",
      "nom_enseigne", "nom_station", "nom_operateur", "nbemplacements",
      "typeautopartage"];
    for (const k of show) {
      const v = props[k];
      if (v == null || v === "" || v === "None" || typeof v === "object") continue;
      const label = k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
      rows += poiRow(label, fmtValue(v));
    }
  }

  const source = props.source || def.source;
  return `<div class="poi-detail">
    <div class="poi-detail-head">
      <span class="poi-dot" style="background:${dotColor}"></span>
      <span class="poi-title">${title}</span>
      <button class="poi-clear" onclick="selectedPoi=null;map.closePopup();updateInsights()">✕</button>
    </div>
    <div class="poi-layer">${def.name}</div>
    ${rows}
    <div class="poi-src">Source : ${source}</div>
  </div>`;
}

// ---------- Géométrie : centre représentatif & point-dans-polygone ----------
function geomCenter(geometry) {
  let sx = 0, sy = 0, n = 0;
  (function walk(c) {
    if (typeof c[0] === "number") { sx += c[0]; sy += c[1]; n++; }
    else c.forEach(walk);
  })(geometry.coordinates);
  return n ? [sy / n, sx / n] : null; // [lat, lng]
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(x, y, polygon) {
  if (!pointInRing(x, y, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(x, y, polygon[h])) return false;
  }
  return true;
}

function pointInGeometry(lat, lng, geometry) {
  if (geometry.type === "Polygon") return pointInPolygon(lng, lat, geometry.coordinates);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((poly) => pointInPolygon(lng, lat, poly));
  }
  return false;
}

// ============================================================
// Constructeurs de couches
// ============================================================
// Extrait les codes de ligne uniques depuis un champ desserte (ex: "A:A,A:R,D:A" → "A, D")
function extractLineCodes(desserte) {
  if (!desserte) return "";
  const codes = new Set();
  for (const part of desserte.split(",")) {
    const code = part.split(":")[0].trim();
    if (code) codes.add(code);
  }
  return [...codes].sort().join(", ");
}

async function buildWfsLayer(def) {
  const resp = await fetch(def.url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const geojson = await resp.json();
  let features = geojson.features || [];

  // Filtrage côté client (ex: ne garder que les arrêts métro/tram)
  if (def.filter) {
    features = features.filter(f => def.filter(f.properties));
  }

  // Déduplication par champ (ex: fusionner les quais A/R d'une même station)
  if (def.dedupeField) {
    const seen = new Map();
    for (const f of features) {
      const key = f.properties[def.dedupeField];
      if (!seen.has(key)) {
        seen.set(key, f);
      } else {
        // Fusionner les dessertes dans le premier feature
        const existing = seen.get(key);
        const merged = [existing.properties.desserte || "", f.properties.desserte || ""].join(",");
        existing.properties.desserte_merged = extractLineCodes(merged);
        // Propager PMR=true si au moins un quai l'est
        if (f.properties.pmr && !existing.properties.pmr) existing.properties.pmr = true;
        if (f.properties.ascenseur && !existing.properties.ascenseur) existing.properties.ascenseur = true;
      }
    }
    // Compléter les stations qui n'ont pas été fusionnées
    for (const f of seen.values()) {
      if (!f.properties.desserte_merged) {
        f.properties.desserte_merged = extractLineCodes(f.properties.desserte || "");
      }
    }
    features = [...seen.values()];
  }

  // Reconstruire le FeatureCollection avec les features filtrés/dédupliqués
  geojson.features = features;

  const layer = L.geoJSON(geojson, {
    // NB : Leaflet applique aussi `style` aux marqueurs issus de pointToLayer
    // (via resetStyle). Pour les points, on doit donc y reproduire la couleur
    // par objet (stationColorFn), sinon `fillColor: def.color` l'écraserait.
    style: (feature) => {
      const t = feature.geometry && feature.geometry.type;
      if (t === "Point" || t === "MultiPoint") {
        const fillColor = def.stationColorFn
          ? def.stationColorFn(feature.properties, def.color)
          : def.color;
        return { color: getCssVar('--marker-stroke'), weight: 1.5, fillColor, fillOpacity: 0.95, opacity: 1 };
      }
      let color = def.color;
      if (def.lineColorField && feature.properties[def.lineColorField]) {
        color = feature.properties[def.lineColorField];
      }
      return {
        color,
        weight: def.weight || 2,
        fillColor: def.color,
        fillOpacity: def.fillOpacity ?? 0.3,
        opacity: 0.9
      };
    },
    pointToLayer: (feature, latlng) => {
      const fillColor = def.stationColorFn
        ? def.stationColorFn(feature.properties, def.color)
        : def.color;
      const marker = L.circleMarker(latlng, {
        radius: def.radius || 6.5, color: getCssVar('--marker-stroke'), weight: 1.5,
        fillColor, fillOpacity: 0.95
      });
      marker._fillColor = fillColor;
      return marker;
    },
    onEachFeature: (feature, lyr) => {
      lyr._layerDef = def;
      lyr._poiProps = feature.properties;
      lyr._poiColor = lyr._fillColor || def.color;
      lyr.bindPopup(buildPopup(def, feature.properties));
    }
  });

  // Points représentatifs pour l'analyse par zone (hors couches linéaires)
  const points = def.geom === "line" ? [] :
    features.map((f) => geomCenter(f.geometry)).filter(Boolean);

  let result = layer;
  if (def.cluster) {
    result = L.markerClusterGroup({ disableClusteringAtZoom: 17, showCoverageOnHover: false });
    result.addLayer(layer);
  }
  result._featureCount = features.length;
  result._points = points;
  return result;
}

async function buildVelovLayer(def) {
  const resp = await fetch(VELOV_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  const stations = (data.values || []).filter((s) => s.lat && s.lng);

  const group = L.featureGroup();
  let totalBikes = 0, totalStands = 0, withBikes = 0;
  for (const s of stations) {
    const bikes = s.available_bikes ?? 0;
    const stands = s.available_bike_stands ?? 0;
    totalBikes += bikes;
    totalStands += stands;
    if (bikes > 0) withBikes++;
    const color = bikes === 0 ? "#f8716a" : bikes < 4 ? "#fbbf24" : "#34d399";
    const marker = L.circleMarker([s.lat, s.lng], {
      radius: 6.5, color: getCssVar('--marker-stroke'), weight: 1.5, fillColor: color, fillOpacity: 0.95
    });
    marker._layerDef = def;
    marker._poiProps = { name: s.name?.replace(/^\d+\s*-\s*/, "") || "Station Vélo'v", bikes, stands, address: s.address || "—", source: def.source };
    marker.bindPopup(
      `<div class="popup-title">🚲 ${s.name?.replace(/^\d+\s*-\s*/, "") || "Station Vélo'v"}</div>
       <div class="popup-row"><span class="k">Vélos disponibles :</span><span><strong>${bikes}</strong></span></div>
       <div class="popup-row"><span class="k">Places libres :</span><span class="v-num">${stands}</span></div>
       <div class="popup-row"><span class="k">Adresse :</span><span>${s.address || "—"}</span></div>
       <div class="popup-src">Source : ${def.source} — temps réel</div>`
    );
    group.addLayer(marker);
  }
  group._featureCount = stations.length;
  group._points = stations.map((s) => [s.lat, s.lng]);
  group._velovStats = {
    totalBikes, totalStands,
    pctWithBikes: stations.length ? Math.round((withBikes / stations.length) * 100) : 0
  };
  return group;
}

async function buildOverpassLayer(def) {
  const query = `[out:json][timeout:30];
    area["name"="Lyon"]["boundary"="administrative"]["admin_level"="8"]->.a;
    nwr(area.a)${def.osmFilter};
    out center tags;`;
  const resp = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();

  const group = L.featureGroup();
  const points = [];
  for (const el of data.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null) continue;
    points.push([lat, lon]);
    const tags = el.tags || {};
    const marker = L.circleMarker([lat, lon], {
      radius: 6.5, color: getCssVar('--marker-stroke'), weight: 1.5, fillColor: def.color, fillOpacity: 0.95
    });
    const addr = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
    marker._layerDef = def;
    marker._poiProps = { name: tags.name || def.name, address: addr || null, opening_hours: tags.opening_hours || null, phone: tags.phone || null, source: def.source };
    marker.bindPopup(
      `<div class="popup-title">${tags.name || def.name}</div>
       ${addr ? `<div class="popup-row"><span class="k">Adresse :</span><span>${addr}</span></div>` : ""}
       ${tags.opening_hours ? `<div class="popup-row"><span class="k">Horaires :</span><span>${tags.opening_hours}</span></div>` : ""}
       ${tags.phone ? `<div class="popup-row"><span class="k">Téléphone :</span><span>${tags.phone}</span></div>` : ""}
       <div class="popup-src">Source : ${def.source}</div>`
    );
    group.addLayer(marker);
  }
  let result = group;
  if (def.cluster) {
    result = L.markerClusterGroup({ disableClusteringAtZoom: 17, showCoverageOnHover: false });
    result.addLayer(group);
  }
  result._featureCount = points.length;
  result._points = points;
  return result;
}

// ---------- Fond commun : polygones des arrondissements ----------
function getArrondGeojson() {
  if (arrondGeojsonPromise) return arrondGeojsonPromise;
  arrondGeojsonPromise = (async () => {
    const resp = await fetch(wfsUrl("grandlyon", "metropole-de-lyon:adr_voie_lieu.adrarrond"));
    if (!resp.ok) throw new Error(`Arrondissements : HTTP ${resp.status}`);
    const geojson = await resp.json();
    geojson.features = geojson.features.filter((f) =>
      LYON_ARRONDISSEMENTS.includes(f.properties.insee));
    return geojson;
  })().catch((err) => { arrondGeojsonPromise = null; throw err; });
  return arrondGeojsonPromise;
}

// ---------- DVF : prix immobiliers ----------
function loadDvfData() {
  if (dvfDataPromise) return dvfDataPromise;
  dvfDataPromise = (async () => {
    if (!window.DVF_DATA) throw new Error("DVF : data/dvf-2024.js introuvable");
    const salesByArrond = {};
    for (const [insee, rows] of Object.entries(window.DVF_DATA.arrondissements)) {
      salesByArrond[insee] = rows.map(([lat, lon, price, surface, ppm2, rooms, date]) =>
        ({ lat, lon, price, surface, ppm2, rooms, date }));
    }
    return salesByArrond;
  })().catch((err) => { dvfDataPromise = null; throw err; });
  return dvfDataPromise;
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const DVF_GRADES = [3000, 3500, 4000, 4500, 5000];
const DVF_COLORS = ["#ffffcc", "#fed976", "#fd8d3c", "#fc4e2a", "#bd0026", "#67000d"];
function dvfColor(v) {
  for (let i = 0; i < DVF_GRADES.length; i++) if (v < DVF_GRADES[i]) return DVF_COLORS[i];
  return DVF_COLORS[DVF_GRADES.length];
}

async function buildDvfChoropleth(def) {
  const [salesByArrond, arrondBase] = await Promise.all([loadDvfData(), getArrondGeojson()]);
  const arrond = { type: "FeatureCollection", features: arrondBase.features };

  const stats = [];
  const layer = L.geoJSON(arrond, {
    style: (feature) => {
      const sales = salesByArrond[feature.properties.insee] || [];
      const med = median(sales.map((s) => s.ppm2));
      return {
        color: getCssVar('--marker-stroke'), weight: 1.5,
        fillColor: med ? dvfColor(med) : "#555",
        fillOpacity: 0.7
      };
    },
    onEachFeature: (feature, lyr) => {
      const sales = salesByArrond[feature.properties.insee] || [];
      const med = median(sales.map((s) => s.ppm2));
      stats.push({ insee: feature.properties.insee, nom: feature.properties.nomreduit || feature.properties.nom,
                   median: med, count: sales.length });
      lyr._layerDef = def;
      lyr._poiProps = { ...feature.properties, medianPrice: med, salesCount: sales.length, source: def.source };
      lyr.bindPopup(
        `<div class="popup-title">${feature.properties.nom}</div>
         <div class="popup-row"><span class="k">Prix médian :</span>
           <span><strong>${med ? Math.round(med).toLocaleString("fr-FR") + " €/m²" : "données insuffisantes"}</strong></span></div>
         <div class="popup-row"><span class="k">Ventes analysées :</span><span class="v-num">${sales.length}</span></div>
         <div class="popup-src">Source : ${def.source} — appartements, 2024</div>`
      );
    }
  });
  stats.sort((a, b) => a.insee.localeCompare(b.insee));
  layer._featureCount = arrond.features.length;
  layer._isChoropleth = true;
  layer._dvfStats = stats;
  return layer;
}

async function buildDvfPoints(def) {
  const salesByArrond = await loadDvfData();
  const cluster = L.markerClusterGroup({ disableClusteringAtZoom: 18, showCoverageOnHover: false });
  const points = [];
  for (const sales of Object.values(salesByArrond)) {
    for (const s of sales) {
      if (!s.lat || !s.lon) continue;
      points.push([s.lat, s.lon]);
      const marker = L.circleMarker([s.lat, s.lon], {
        radius: 5.5, color: getCssVar('--marker-stroke'), weight: 1, fillColor: dvfColor(s.ppm2), fillOpacity: 0.92
      });
      marker._layerDef = def;
      marker._poiProps = { title: `Appartement ${s.rooms ? s.rooms + " pièce(s), " : ""}${Math.round(s.surface)} m²`, price: s.price, ppm2: s.ppm2, surface: s.surface, rooms: s.rooms, date: s.date, source: def.source };
      marker.bindPopup(
        `<div class="popup-title">Appartement ${s.rooms ? s.rooms + " pièce(s), " : ""}${Math.round(s.surface)} m²</div>
         <div class="popup-row"><span class="k">Prix de vente :</span><span><strong>${Math.round(s.price).toLocaleString("fr-FR")} €</strong></span></div>
         <div class="popup-row"><span class="k">Prix au m² :</span><span class="v-num">${Math.round(s.ppm2).toLocaleString("fr-FR")} €/m²</span></div>
         <div class="popup-row"><span class="k">Date de vente :</span><span class="v-num">${s.date}</span></div>
         <div class="popup-src">Source : ${def.source}</div>`
      );
      cluster.addLayer(marker);
    }
  }
  cluster._featureCount = points.length;
  cluster._points = points;
  return cluster;
}

// ---------- Délinquance (SSMSI) ----------
const CRIME_COLORS = ["#ede9fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#6d28d9"];

function crimeRate(insee, indicator) {
  const a = window.DELINQUANCE_DATA?.arrondissements?.[insee];
  if (!a) return null;
  if (indicator === "__all__") {
    let totalCount = 0;
    for (const ind of window.DELINQUANCE_DATA.indicateurs) {
      const v = a.data?.[ind];
      if (v) totalCount += v[0];
    }
    const pop = a.pop;
    return (totalCount && pop) ? (totalCount / pop) * 1000 : null;
  }
  const v = a.data?.[indicator];
  return v ? v[1] : null; // taux pour mille
}
function crimeCount(insee, indicator) {
  const a = window.DELINQUANCE_DATA?.arrondissements?.[insee];
  if (!a) return null;
  if (indicator === "__all__") {
    let total = 0;
    for (const ind of window.DELINQUANCE_DATA.indicateurs) {
      const v = a.data?.[ind];
      if (v) total += v[0];
    }
    return total || null;
  }
  const v = a.data?.[indicator];
  return v ? v[0] : null;
}

// Bornes de classes (5 classes linéaires entre min et max des 9 arrondissements)
function crimeBreaks(indicator) {
  const rates = LYON_ARRONDISSEMENTS.map((i) => crimeRate(i, indicator)).filter((v) => v != null);
  const min = Math.min(...rates), max = Math.max(...rates);
  const step = (max - min) / CRIME_COLORS.length || 1;
  return Array.from({ length: CRIME_COLORS.length - 1 }, (_, i) => min + step * (i + 1));
}
function crimeColor(rate, breaks) {
  for (let i = 0; i < breaks.length; i++) if (rate < breaks[i]) return CRIME_COLORS[i];
  return CRIME_COLORS[CRIME_COLORS.length - 1];
}

function crimePopup(def, props) {
  const insee = props.insee;
  const rate = crimeRate(insee, crimeIndicator);
  const count = crimeCount(insee, crimeIndicator);
  const pop = window.DELINQUANCE_DATA?.arrondissements?.[insee]?.pop;
  const label = crimeIndicator === "__all__" ? "Tous les faits" : crimeIndicator;
  return `<div class="popup-title">${props.nom}</div>
    <div class="popup-row"><span class="k">${label} :</span></div>
    <div class="popup-row"><span class="k">Taux :</span>
      <span><strong>${rate != null ? rate.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " ‰" : "n.d."}</strong> (pour 1 000 hab.)</span></div>
    <div class="popup-row"><span class="k">Faits enregistrés :</span><span class="v-num">${count != null ? count.toLocaleString("fr-FR") : "n.d."}</span></div>
    ${pop ? `<div class="popup-row"><span class="k">Population :</span><span class="v-num">${pop.toLocaleString("fr-FR")}</span></div>` : ""}
    <div class="popup-src">Source : ${def.source} — ${window.DELINQUANCE_DATA.meta.year}</div>`;
}

async function buildCrimeLayer(def) {
  if (!window.DELINQUANCE_DATA) throw new Error("data/delinquance-2025.js introuvable");
  const arrondBase = await getArrondGeojson();
  const breaks = crimeBreaks(crimeIndicator);

  const layer = L.geoJSON({ type: "FeatureCollection", features: arrondBase.features }, {
    style: (feature) => {
      const rate = crimeRate(feature.properties.insee, crimeIndicator);
      return {
        color: getCssVar('--marker-stroke'), weight: 1.5,
        fillColor: rate != null ? crimeColor(rate, breaks) : "#555",
        fillOpacity: 0.7
      };
    },
    onEachFeature: (feature, lyr) => {
      lyr._layerDef = def;
      lyr._poiProps = { ...feature.properties, source: def.source, isCrime: true };
      lyr.bindPopup(() => crimePopup(def, feature.properties));
    }
  });
  layer._featureCount = arrondBase.features.length;
  layer._isCrime = true;
  return layer;
}

// Re-colore la choroplèthe quand l'indicateur change
function restyleCrimeLayer() {
  const layer = activeLayers.get("delinquance");
  if (!layer) return;
  const breaks = crimeBreaks(crimeIndicator);
  layer.eachLayer((lyr) => {
    const rate = crimeRate(lyr.feature.properties.insee, crimeIndicator);
    lyr.setStyle({ fillColor: rate != null ? crimeColor(rate, breaks) : "#555" });
  });
}

// ---------- Eau potable (contrôle sanitaire ARS / Hub'Eau) ----------
const eauIsConforme = (c) => !!c && /conforme/i.test(c) && !/non conforme/i.test(c);

function eauPopup(def, props, agg) {
  const name = props.nomreduit || props.nom;
  if (!agg) {
    return `<div class="popup-title">${name}</div>
      <div class="popup-row"><span class="k">Eau potable :</span><span>aucun contrôle récent</span></div>
      <div class="popup-src">Source : ${def.source}</div>`;
  }
  const conf = eauIsConforme(agg.latest.conclusion_conformite_prelevement);
  const rate = agg.total ? Math.round((agg.conformes / agg.total) * 100) : null;
  const cmap = { C: "Conforme", N: "Non conforme", D: "Dérogation", S: "Surveillance" };
  const fmtC = (v) => cmap[v] || v || "—";
  const d = agg.latest.date_prelevement ? agg.latest.date_prelevement.slice(0, 10) : "—";
  return `<div class="popup-title">${name}</div>
    <div class="popup-row"><span class="k">Verdict :</span><span><strong>${conf ? "✓ Eau conforme" : "⚠ Non conforme"}</strong></span></div>
    <div class="popup-row"><span class="k">Conformité bactério. :</span><span>${fmtC(agg.latest.conformite_limites_bact_prelevement)}</span></div>
    <div class="popup-row"><span class="k">Conformité physico-chim. :</span><span>${fmtC(agg.latest.conformite_limites_pc_prelevement)}</span></div>
    <div class="popup-row"><span class="k">Taux de conformité (6 mois) :</span><span class="v-num">${rate != null ? rate + " %" : "—"}</span></div>
    <div class="popup-row"><span class="k">Prélèvements analysés :</span><span class="v-num">${agg.total}</span></div>
    <div class="popup-row"><span class="k">Dernier contrôle :</span><span class="v-num">${d}</span></div>
    <div class="popup-src">Source : ${def.source} — contrôle sanitaire</div>`;
}

async function buildEauPotableLayer(def) {
  // 1) Polygones des communes de la Métropole
  const resp = await fetch(COMMUNES_WFS);
  if (!resp.ok) throw new Error(`Communes : HTTP ${resp.status}`);
  const communes = await resp.json();
  communes.features = communes.features.filter(
    (f) => f.properties.communegl === true && f.properties.insee);
  const inseeList = [...new Set(communes.features.map((f) => f.properties.insee))];

  // 2) Résultats du contrôle sanitaire (≈ 1 ligne par prélèvement, triées par date desc).
  //    Hub'Eau limite à 20 communes par requête → on découpe en lots parallèles.
  const chunks = [];
  for (let i = 0; i < inseeList.length; i += EAU_COMMUNES_PAR_REQUETE) {
    chunks.push(inseeList.slice(i, i + EAU_COMMUNES_PAR_REQUETE));
  }
  const results = await Promise.all(chunks.map(async (chunk) => {
    const hu = await fetch(eauPotableUrl(chunk));
    if (!hu.ok) throw new Error(`Hub'Eau : HTTP ${hu.status}`);
    return (await hu.json()).data || [];
  }));
  const rows = results.flat();

  // 3) Agrégation par commune : dernier prélèvement + taux de conformité
  const byCommune = new Map(); // insee -> { latest, total, conformes }
  for (const r of rows) {
    let agg = byCommune.get(r.code_commune);
    if (!agg) { agg = { latest: r, total: 0, conformes: 0 }; byCommune.set(r.code_commune, agg); }
    agg.total++;
    if (eauIsConforme(r.conclusion_conformite_prelevement)) agg.conformes++;
  }

  const stats = [];
  const layer = L.geoJSON(communes, {
    style: (feature) => {
      const agg = byCommune.get(feature.properties.insee);
      const verdict = agg
        ? (eauIsConforme(agg.latest.conclusion_conformite_prelevement) ? "conforme" : "nonconforme")
        : "nodata";
      return { color: getCssVar('--marker-stroke'), weight: 1.2, fillColor: EAU_COLORS[verdict], fillOpacity: 0.6 };
    },
    onEachFeature: (feature, lyr) => {
      const agg = byCommune.get(feature.properties.insee);
      stats.push({
        insee: feature.properties.insee,
        nom: feature.properties.nomreduit || feature.properties.nom,
        total: agg?.total || 0, conformes: agg?.conformes || 0
      });
      lyr._layerDef = def;
      lyr._poiProps = { ...feature.properties, source: def.source };
      lyr.bindPopup(eauPopup(def, feature.properties, agg));
    }
  });
  layer._featureCount = communes.features.length;
  layer._isEau = true;
  layer._eauStats = stats;
  return layer;
}

// ============================================================
// Analyse par zone
// ============================================================
const zoneLevelSelect = $("#zone-level");
Object.entries(ZONE_LEVELS).forEach(([key, lvl]) => {
  const opt = document.createElement("option");
  opt.value = key;
  opt.textContent = lvl.label;
  zoneLevelSelect.appendChild(opt);
});

$("#zone-toggle").addEventListener("change", async (e) => {
  zoneState.enabled = e.target.checked;
  $("#zone-controls").hidden = !zoneState.enabled;
  if (zoneState.enabled) {
    await activateZones();
  } else {
    deactivateZones();
  }
  refreshPanels();
});

zoneLevelSelect.addEventListener("change", async () => {
  zoneState.level = zoneLevelSelect.value;
  zoneState.selectedId = null;
  if (zoneState.enabled) {
    deactivateZones();
    await activateZones();
    refreshPanels();
  }
});

function getZonesGeojson(level) {
  if (!zoneState.geojsonCache.has(level)) {
    const lvl = ZONE_LEVELS[level];
    const promise = (async () => {
      const resp = await fetch(lvl.url);
      if (!resp.ok) throw new Error(`Zones : HTTP ${resp.status}`);
      const geojson = await resp.json();
      geojson.features = geojson.features.filter((f) => lvl.filter(f.properties));
      return geojson;
    })().catch((err) => { zoneState.geojsonCache.delete(level); throw err; });
    zoneState.geojsonCache.set(level, promise);
  }
  return zoneState.geojsonCache.get(level);
}

async function activateZones() {
  try {
    showStatus("Chargement des zones…");
    const geojson = await getZonesGeojson(zoneState.level);
    hideStatus();
    if (!zoneState.enabled) return;
    const lvl = ZONE_LEVELS[zoneState.level];

    zoneState.layer = L.geoJSON(geojson, {
      style: () => zoneStyle(false),
      onEachFeature: (feature, lyr) => {
        const id = lvl.zoneId(feature.properties);
        lyr.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          zoneState.selectedId = zoneState.selectedId === id ? null : id;
          updateZoneStyles();
          updateInsights();
        });
      }
    }).addTo(map);

    zoneState.labels = L.layerGroup().addTo(map);
    updateZoneOverlay();
  } catch (err) {
    console.error("Erreur de chargement des zones", err);
    showStatus("Impossible de charger les zones d'analyse.", true);
    $("#zone-toggle").checked = false;
    zoneState.enabled = false;
    $("#zone-controls").hidden = true;
  }
}

function deactivateZones() {
  if (zoneState.layer) { map.removeLayer(zoneState.layer); zoneState.layer = null; }
  if (zoneState.labels) { map.removeLayer(zoneState.labels); zoneState.labels = null; }
  zoneState.selectedId = null;
}

function zoneStyle(selected) {
  return {
    color: selected ? "#EF3340" : "rgba(239, 51, 64, 0.65)",
    weight: selected ? 3 : 1.4,
    dashArray: selected ? null : "4 3",
    fillColor: "#EF3340",
    fillOpacity: selected ? 0.12 : 0.03
  };
}

// Comptage des objets d'une couche dans chaque zone (mémoïsé)
function zoneCountsForLayer(layerId, zoneFeatures) {
  const key = `${zoneState.level}:${layerId}`;
  if (zoneState.countCache.has(key)) return zoneState.countCache.get(key);
  const layer = activeLayers.get(layerId);
  const points = layer?._points;
  if (!points) return null;

  const lvl = ZONE_LEVELS[zoneState.level];
  const counts = new Map();
  for (const f of zoneFeatures) counts.set(lvl.zoneId(f.properties), 0);
  for (const [lat, lng] of points) {
    for (const f of zoneFeatures) {
      if (pointInGeometry(lat, lng, f.geometry)) {
        const id = lvl.zoneId(f.properties);
        counts.set(id, counts.get(id) + 1);
        break;
      }
    }
  }
  zoneState.countCache.set(key, counts);
  return counts;
}

// Total tous jeux actifs confondus, par zone
function zoneTotals(zoneFeatures) {
  const lvl = ZONE_LEVELS[zoneState.level];
  const totals = new Map(zoneFeatures.map((f) => [lvl.zoneId(f.properties), 0]));
  for (const layerId of activeLayers.keys()) {
    const counts = zoneCountsForLayer(layerId, zoneFeatures);
    if (!counts) continue;
    for (const [id, n] of counts) totals.set(id, totals.get(id) + n);
  }
  return totals;
}

async function updateZoneOverlay() {
  if (!zoneState.enabled || !zoneState.layer || !zoneState.labels) return;
  const geojson = await getZonesGeojson(zoneState.level);
  const lvl = ZONE_LEVELS[zoneState.level];
  const totals = zoneTotals(geojson.features);

  zoneState.labels.clearLayers();
  zoneState.layer.eachLayer((lyr) => {
    const id = lvl.zoneId(lyr.feature.properties);
    const total = totals.get(id) ?? 0;
    const center = lyr.getBounds().getCenter();
    const label = L.marker(center, {
      interactive: false,
      icon: L.divIcon({
        className: "zone-label-wrap",
        html: `<div class="zone-label">${total.toLocaleString("fr-FR")}</div>`,
        iconSize: null
      })
    });
    zoneState.labels.addLayer(label);
  });
  updateZoneStyles();
  zoneState.layer.bringToFront();
}

function updateZoneStyles() {
  if (!zoneState.layer) return;
  const lvl = ZONE_LEVELS[zoneState.level];
  zoneState.layer.eachLayer((lyr) => {
    const id = lvl.zoneId(lyr.feature.properties);
    lyr.setStyle(zoneStyle(id === zoneState.selectedId));
  });
}

// ============================================================
// Synthèse (KPI + graphiques + focus zone)
// ============================================================
const rightPanel = $("#right-panel");
const rightPanelToggle = $("#right-panel-toggle");
let rightPanelManuallyClosed = false;

$("#right-panel-close").addEventListener("click", () => {
  rightPanel.classList.add("right-panel--collapsed");
  rightPanelManuallyClosed = true;
  rightPanelToggle.hidden = false;
  // Pas d'invalidateSize ici : la transition CSS vient de commencer,
  // un appel trop tôt met en cache une taille intermédiaire et fausse
  // le décalage calculé par invalidateSize(pan:true) au transitionend.
});

$("#right-panel-toggle").addEventListener("click", () => {
  rightPanel.classList.remove("right-panel--collapsed");
  rightPanelManuallyClosed = false;
  rightPanelToggle.hidden = true;
  // Idem : on laisse transitionend gérer invalidateSize
});

rightPanel.addEventListener("transitionend", (e) => {
  if (e.propertyName === "width" || e.propertyName === "transform") {
    // invalidateSize(pan:true par défaut) recalcule la taille du conteneur
    // et appelle panBy pour recentrer la carte automatiquement.
    map.invalidateSize();
  }
});

function updateInsights() {
  const div = $("#insights");
  if (activeLayers.size === 0 && !selectedPoi) {
    rightPanel.hidden = true;
    rightPanelToggle.hidden = true;
    rightPanelManuallyClosed = false;
    div.innerHTML = "";
    return;
  }
  // Panneau pas encore visible → l'ouvrir avec animation
  if (rightPanel.hidden) {
    rightPanel.hidden = false;
    rightPanel.style.width = "0";
    rightPanel.style.opacity = "0";
    requestAnimationFrame(() => {
      rightPanel.style.width = "";
      rightPanel.style.opacity = "";
    });

    // Fallback : transitionend peut ne pas se déclencher quand
    // le panneau passe de display:none à visible.
    setTimeout(() => map.invalidateSize(), 400);
  }
  // Si un POI est sélectionné, forcer l'ouverture du panneau
  if (selectedPoi) {
    rightPanel.classList.remove("right-panel--collapsed");
    rightPanelToggle.hidden = true;
  } else if (rightPanelManuallyClosed) {
    rightPanelToggle.hidden = false;
  } else {
    rightPanel.classList.remove("right-panel--collapsed");
    rightPanelToggle.hidden = true;
  }

  let html = "";

  // ----- Détail du POI sélectionné -----
  if (selectedPoi) {
    html += buildPoiDetailHtml(selectedPoi.def, selectedPoi.props, selectedPoi.color);
  }

  // ----- Focus sur la zone sélectionnée -----
  if (zoneState.enabled && zoneState.selectedId && zoneState.layer) {
    const lvl = ZONE_LEVELS[zoneState.level];
    let zoneFeature = null;
    zoneState.layer.eachLayer((lyr) => {
      if (lvl.zoneId(lyr.feature.properties) === zoneState.selectedId) zoneFeature = lyr.feature;
    });
    if (zoneFeature) {
      const name = lvl.zoneName(zoneFeature.properties);
      let rows = "";
      let total = 0;
      for (const def of ALL_LAYERS) {
        if (!activeLayers.has(def.id)) continue;
        const counts = zoneCountsForLayer(def.id, [zoneFeature]);
        if (!counts) continue;
        const n = counts.get(zoneState.selectedId) ?? 0;
        total += n;
        rows += `<div class="zone-row"><span class="dot" style="background:${def.color}"></span>
                 <span class="zr-name">${def.name}</span>
                 <span class="zr-val">${n.toLocaleString("fr-FR")}</span></div>`;
      }
      // Indicateurs propres aux arrondissements
      let extra = "";
      if (zoneState.level === "arrond") {
        const insee = zoneState.selectedId;
        const dvf = activeLayers.get("dvf");
        const stat = dvf?._dvfStats?.find((s) => s.insee === insee);
        if (stat?.median) {
          extra += `<div class="zone-row"><span class="dot" style="background:#fd8d3c"></span>
                    <span class="zr-name">Prix médian appart. (2024)</span>
                    <span class="zr-val">${Math.round(stat.median).toLocaleString("fr-FR")} €/m²</span></div>`;
        }
        if (activeLayers.has("delinquance")) {
          const rate = crimeRate(insee, crimeIndicator);
          if (rate != null) {
            const zoneLabel = crimeIndicator === "__all__" ? "Tous les faits" : crimeIndicator;
            extra += `<div class="zone-row"><span class="dot" style="background:#a78bfa"></span>
                      <span class="zr-name">${zoneLabel}</span>
                      <span class="zr-val">${rate.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ‰</span></div>`;
          }
        }
      }
      html += `<div class="zone-focus">
        <div class="zone-focus-head">
          <span class="zone-focus-name">📍 ${name}</span>
          <button class="zone-clear" onclick="zoneState.selectedId=null;updateZoneStyles();updateInsights()">✕</button>
        </div>
        ${rows}${extra}
        <div class="zone-row total"><span class="zr-name">Total objets dans la zone</span>
          <span class="zr-val">${total.toLocaleString("fr-FR")}</span></div>
      </div>`;
    }
  }

  // ----- KPI -----
  const kpis = [];
  const velov = activeLayers.get("velov");
  if (velov?._velovStats) {
    const v = velov._velovStats;
    kpis.push({ value: v.totalBikes.toLocaleString("fr-FR"), label: "Vélo'v disponibles", highlight: true });
    kpis.push({ value: v.pctWithBikes + '<span class="unit"> %</span>', label: "Stations avec vélos" });
  }
  const dvf = activeLayers.get("dvf");
  if (dvf?._dvfStats) {
    const all = dvf._dvfStats.filter((s) => s.median);
    const cityMedian = median(all.map((s) => s.median));
    const totalSales = all.reduce((acc, s) => acc + s.count, 0);
    kpis.push({ value: Math.round(cityMedian).toLocaleString("fr-FR") + '<span class="unit"> €/m²</span>', label: "Médiane ville (appart.)", highlight: true });
    kpis.push({ value: totalSales.toLocaleString("fr-FR"), label: "Ventes analysées · 2024" });
  }
  if (activeLayers.has("delinquance") && window.DELINQUANCE_DATA) {
    const counts = LYON_ARRONDISSEMENTS.map((i) => crimeCount(i, crimeIndicator)).filter((v) => v != null);
    const totalFaits = counts.reduce((a, b) => a + b, 0);
    const pops = LYON_ARRONDISSEMENTS.map((i) => window.DELINQUANCE_DATA.arrondissements[i]?.pop || 0);
    const totalPop = pops.reduce((a, b) => a + b, 0);
    const cityRate = totalPop ? (totalFaits / totalPop) * 1000 : null;
    kpis.push({ value: totalFaits.toLocaleString("fr-FR"), label: `Faits · ${window.DELINQUANCE_DATA.meta.year}`, highlight: true });
    if (cityRate != null) {
      kpis.push({ value: cityRate.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + '<span class="unit"> ‰</span>', label: "Taux ville (pour 1 000 hab.)" });
    }
  }
  const air = activeLayers.get("air-indice");
  if (air) {
    let lyon = null;
    air.eachLayer((m) => {
      const p = m._poiProps;
      if (p && p.code_zone === "69123") lyon = p;
    });
    if (lyon?.lib_qual) {
      kpis.push({ value: lyon.lib_qual, label: "Qualité de l'air à Lyon · aujourd'hui", highlight: true });
    }
    kpis.push({ value: (air._featureCount ?? 0).toLocaleString("fr-FR"), label: "Communes suivies (agglo.)" });
  }
  const eau = activeLayers.get("eau-potable");
  if (eau?._eauStats) {
    const s = eau._eauStats.filter((x) => x.total > 0);
    const totalPrel = s.reduce((a, b) => a + b.total, 0);
    const totalConf = s.reduce((a, b) => a + b.conformes, 0);
    const rate = totalPrel ? Math.round((totalConf / totalPrel) * 100) : null;
    if (rate != null) {
      kpis.push({ value: rate + '<span class="unit"> %</span>', label: "Prélèvements conformes · 6 mois", highlight: true });
    }
    kpis.push({ value: totalPrel.toLocaleString("fr-FR"), label: "Prélèvements analysés" });
    kpis.push({ value: s.length.toLocaleString("fr-FR"), label: "Communes contrôlées" });
  }
  for (const def of ALL_LAYERS) {
    if (!activeLayers.has(def.id)) continue;
    if (["velov", "dvf", "delinquance", "air-indice", "eau-potable"].includes(def.id)) continue;
    kpis.push({ value: (activeLayers.get(def.id)._featureCount ?? 0).toLocaleString("fr-FR"), label: def.name });
  }
  if (kpis.length) {
    html += `<div class="kpi-grid">` + kpis.map((k) =>
      `<div class="kpi ${k.highlight ? "highlight" : ""}">
         <div class="kpi-value">${k.value}</div>
         <div class="kpi-label">${k.label}</div>
       </div>`).join("") + `</div>`;
  }

  // ----- Graphique DVF -----
  if (dvf?._dvfStats) {
    const stats = dvf._dvfStats.filter((s) => s.median);
    const max = Math.max(...stats.map((s) => s.median));
    html += `<div class="chart">
      <div class="chart-title">Prix médian au m² par arrondissement · 2024</div>` +
      stats.map((s) =>
        `<div class="bar-row">
           <span class="bar-label">${s.nom.replace("Lyon ", "Ly ")}</span>
           <span class="bar-track"><span class="bar-fill" style="width:${Math.round((s.median / max) * 100)}%"></span></span>
           <span class="bar-value">${Math.round(s.median).toLocaleString("fr-FR")} €</span>
         </div>`).join("") + `</div>`;
  }

  // ----- Graphique délinquance -----
  if (activeLayers.has("delinquance") && window.DELINQUANCE_DATA) {
    const chartLabel = crimeIndicator === "__all__" ? "Tous les faits" : crimeIndicator;
    const rates = LYON_ARRONDISSEMENTS
      .map((insee, i) => ({ nom: `Ly ${i + 1}`, rate: crimeRate(insee, crimeIndicator) }))
      .filter((r) => r.rate != null);
    const max = Math.max(...rates.map((r) => r.rate));
    html += `<div class="chart">
      <div class="chart-title">${chartLabel} · taux ‰ par arrondissement · ${window.DELINQUANCE_DATA.meta.year}</div>` +
      rates.map((r) =>
        `<div class="bar-row">
           <span class="bar-label">${r.nom}</span>
           <span class="bar-track"><span class="bar-fill crime" style="width:${Math.round((r.rate / max) * 100)}%"></span></span>
           <span class="bar-value">${r.rate.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ‰</span>
         </div>`).join("") + `</div>`;
  }

  div.innerHTML = html;
}

// ============================================================
// Légende
// ============================================================
const legendControl = L.control({ position: "bottomright" });
legendControl.onAdd = () => {
  const div = L.DomUtil.create("div", "legend");
  div.id = "legend";
  return div;
};
legendControl.addTo(map);

function updateLegend() {
  const div = document.getElementById("legend");
  if (!div) return;
  if (activeLayers.size === 0) { div.style.display = "none"; return; }
  div.style.display = "block";

  let html = `<h3>Couches actives</h3>`;
  for (const def of ALL_LAYERS) {
    const layer = activeLayers.get(def.id);
    if (!layer) continue;
    if (layer._isChoropleth) {
      html += `<div><strong>Prix médian au m² (2024)</strong></div>`;
      let prev = null;
      for (let i = 0; i <= DVF_GRADES.length; i++) {
        const label = i === 0
          ? `moins de ${DVF_GRADES[0].toLocaleString("fr-FR")} €`
          : i === DVF_GRADES.length
            ? `plus de ${DVF_GRADES[i - 1].toLocaleString("fr-FR")} €`
            : `${prev.toLocaleString("fr-FR")} – ${DVF_GRADES[i].toLocaleString("fr-FR")} €`;
        html += `<div class="row"><span class="chip square" style="background:${DVF_COLORS[i]}"></span>${label}</div>`;
        prev = DVF_GRADES[i];
      }
    } else if (layer._isCrime) {
      const breaks = crimeBreaks(crimeIndicator);
      html += `<div><strong>Délinquance · taux ‰ (${window.DELINQUANCE_DATA.meta.year})</strong></div>`;
      const fmt = (v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
      for (let i = 0; i < CRIME_COLORS.length; i++) {
        const label = i === 0
          ? `moins de ${fmt(breaks[0])}`
          : i === CRIME_COLORS.length - 1
            ? `plus de ${fmt(breaks[breaks.length - 1])}`
            : `${fmt(breaks[i - 1])} – ${fmt(breaks[i])}`;
        html += `<div class="row"><span class="chip square" style="background:${CRIME_COLORS[i]}"></span>${label}</div>`;
      }
    } else if (def.legend === "atmo") {
      html += `<div><strong>Indice ATMO du jour</strong></div>`;
      for (const s of ATMO_SCALE) {
        html += `<div class="row"><span class="chip" style="background:${s.color}"></span>${s.label}</div>`;
      }
    } else if (layer._isEau) {
      html += `<div><strong>Eau potable · contrôle sanitaire</strong></div>
               <div class="row"><span class="chip square" style="background:${EAU_COLORS.conforme}"></span>Conforme</div>
               <div class="row"><span class="chip square" style="background:${EAU_COLORS.nonconforme}"></span>Non conforme</div>
               <div class="row"><span class="chip square" style="background:${EAU_COLORS.nodata}"></span>Pas de contrôle récent</div>`;
    } else if (def.id === "velov") {
      html += `<div class="row"><span class="chip" style="background:#34d399"></span>Vélo'v : 4 vélos ou +</div>
               <div class="row"><span class="chip" style="background:#fbbf24"></span>Vélo'v : 1 à 3 vélos</div>
               <div class="row"><span class="chip" style="background:#f8716a"></span>Vélo'v : aucun vélo</div>`;
    } else {
      const shape = def.geom === "line" || def.geom === "polygon" ? "square" : "";
      html += `<div class="row"><span class="chip ${shape}" style="background:${def.color}"></span>${def.name}</div>`;
    }
  }
  div.innerHTML = html;
}

// ---------- Dialog sources ----------
$("#btn-sources").addEventListener("click", () => $("#sources-dialog").showModal());

// ---------- Démarrage : aucun thème présélectionné ----------
// L'utilisateur active lui-même les filtres thématiques.

// ---------- Compteur de visites ----------
(async function updateVisitCounter() {
  const el = document.getElementById("visit-count");
  if (!el) return;
  try {
    const resp = await fetch("https://api.counterapi.dev/v1/blamouche/lyon-dataviz/up");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    el.textContent = Number(data.count ?? data.value ?? data).toLocaleString("fr-FR");
  } catch (err) {
    console.warn("Compteur de visites indisponible", err);
    el.textContent = "—";
  }
})();
