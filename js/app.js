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
const map = L.map("map", { zoomControl: false, minZoom: 12 }).setView([45.7578, 4.8351], 12);
L.control.zoom({ position: "bottomleft" }).addTo(map);
L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);
// L'attribution est affichée dans .map-statusbar pour rester toujours visible
map.attributionControl.setPrefix("");

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
CATALOG.forEach((c) => c.layers.forEach((l) => {
  l.categoryId = c.id; l.categoryLabel = c.label; l.categoryEmoji = c.emoji;
  ALL_LAYERS.push(l);
}));
const LAYER_BY_ID = new Map(ALL_LAYERS.map((l) => [l.id, l]));

const layerCache = new Map();   // layerId -> Promise<L.Layer>
const activeLayers = new Map(); // layerId -> L.Layer
const activePreselections = new Set(); // présélections actives (filtre multi-thèmes)
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
// Présélections thématiques : chaque bouton active un ensemble de couches
// piochées dans n'importe quelle catégorie du catalogue.
const themeGrid = $("#theme-grid");
PRESELECTIONS.forEach((presel) => {
  const btn = document.createElement("button");
  btn.className = "theme-btn";
  btn.dataset.preselection = presel.id;
  if (presel.hint) btn.title = presel.hint;
  btn.innerHTML = `<span class="emoji">${presel.emoji}</span><span>${presel.label}</span>`;
  btn.addEventListener("click", () => togglePreselection(presel));
  themeGrid.appendChild(btn);
});

// Catalogue complet, groupé par catégorie (nature des données)
const catalog = $("#layer-catalog");
const subgroupSyncFns = []; // resynchronisation des cases maîtresses de sous-rubrique
CATALOG.forEach((category) => {
  const details = document.createElement("details");
  details.className = "layer-group";
  details.id = `grp-${category.id}`;
  details.open = false;
  details.innerHTML = `<summary>${category.emoji} ${category.label}
      <span class="grp-count" id="grpcount-${category.id}"></span></summary>`;
  const ul = document.createElement("ul");
  ul.className = "layer-list";
  // Certaines couches déclarent une sous-rubrique (ex. Transports →
  // Métro / Tramway / Bus) : on les regroupe dans un <details> imbriqué
  // doté d'une case maîtresse « tout activer / désactiver ».
  const subLists = new Map(); // libellé de sous-rubrique -> <ul> cible
  category.layers.forEach((def) => {
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
// (utile après togglePreselection, qui coche les couches sans émettre d'événement).
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

// Une couche est-elle encore réclamée par une présélection active ?
// (sert à ne pas la désactiver si deux présélections la partagent, ex. « parcs »)
function layerStillClaimed(layerId) {
  for (const p of PRESELECTIONS) {
    if (activePreselections.has(p.id) && p.layers.includes(layerId)) return true;
  }
  return false;
}

// Une présélection agit comme un filtre : plusieurs peuvent être actives
// (union de leurs couches) ou aucune. Les couches désignées peuvent
// appartenir à n'importe quelle catégorie du catalogue.
function togglePreselection(presel) {
  const already = activePreselections.has(presel.id);
  if (already) {
    activePreselections.delete(presel.id);
    // Retire les couches de cette présélection, sauf celles encore
    // réclamées par une autre présélection active.
    for (const id of presel.layers) {
      if (layerStillClaimed(id)) continue;
      const chk = $(`#chk-${id}`);
      if (chk && chk.checked) {
        chk.checked = false;
        toggleLayer(LAYER_BY_ID.get(id), false);
      }
    }
  } else {
    activePreselections.add(presel.id);
    // Active les couches de la présélection sans toucher aux autres
    for (const id of presel.layers) {
      const chk = $(`#chk-${id}`);
      if (chk && !chk.checked) {
        chk.checked = true;
        toggleLayer(LAYER_BY_ID.get(id), true);
      }
    }
  }

  document.querySelectorAll(".theme-btn").forEach((b) =>
    b.classList.toggle("active", activePreselections.has(b.dataset.preselection))
  );
  // Déplie les catégories du catalogue contenant au moins une couche active.
  document.querySelectorAll(".layer-group").forEach((grp) => {
    const catId = grp.id.replace("grp-", "");
    grp.open = ALL_LAYERS.some((l) => l.categoryId === catId && activeLayers.has(l.id));
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
    case "openagenda": return buildOpenAgendaLayer(def);
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
  CATALOG.forEach((c) => {
    const n = c.layers.filter((l) => activeLayers.has(l.id)).length;
    const el = $(`#grpcount-${c.id}`);
    if (el) el.textContent = n ? `${n} active${n > 1 ? "s" : ""}` : "";
  });
}

// ============================================================
// Popups (carte) & fiches détaillées (panneau Synthèse)
// ------------------------------------------------------------
// La bulle sur la carte ne montre que le minimum (nom + type).
// Le détail complet — un template propre à chaque type de donnée,
// nourri de tous les champs renvoyés par l'API — s'affiche dans la
// fiche du panneau de droite (buildPoiDetailHtml).
// ============================================================

// --- Échappement HTML & formateurs de valeurs ---
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function fmtNum(n) { const x = Number(n); return isNaN(x) ? esc(n) : x.toLocaleString("fr-FR"); }
function fmtDateFR(v) {
  const d = new Date(v);
  if (isNaN(d)) return esc(String(v));
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
function fmtHoraires(v) { return Array.isArray(v) ? v.map(esc).join("<br>") : esc(String(v)); }
function telLink(v) { return `<a href="tel:${esc(String(v).replace(/[^\d+]/g, ""))}">${esc(v)}</a>`; }
function mailLink(v) { return `<a href="mailto:${esc(v)}">${esc(v)}</a>`; }
function urlLink(v, label) {
  let u = String(v).trim(); if (!/^https?:/i.test(u)) u = "https://" + u;
  return `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(label || v)}</a>`;
}
function humanize(k) { return k.replace(/[_:]/g, " ").replace(/^\w/, (c) => c.toUpperCase()); }
function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }

// --- Titre & type affichés (carte + en-tête de fiche) ---
function poiTitle(def, props) {
  const cfg = def.popup || {};
  let t = cfg.title ? props[cfg.title] : null;
  if (t == null || t === "") {
    for (const k of ["nom", "name", "titre", "title_fr", "nom_enseigne", "nom_station", "essencefrancais", "lib_zone", "adresse", "libelle"]) {
      if (props[k]) { t = props[k]; break; }
    }
  }
  return t ?? def.name;
}
function poiTypeLabel(def, props) {
  const sub = props.nature || props.soustheme || props.type_equip || props.categorie;
  if (sub && typeof sub === "string") return cap(String(sub).toLowerCase());
  return def.name;
}

// --- Bulle carte : strict minimum (nom + type) ---
function buildPopup(def, props) {
  return `<div class="popup-mini">
    <div class="popup-title">${esc(poiTitle(def, props))}</div>
    <div class="popup-type"><span class="popup-dot" style="background:${def.color}"></span>${esc(poiTypeLabel(def, props))}</div>
    <div class="popup-hint">Fiche détaillée dans la synthèse →</div>
  </div>`;
}

// --- Primitives de fiche ---
function fHead(title, sub, color) {
  return `<div class="fiche-head">
    <span class="fiche-dot" style="background:${color}"></span>
    <div class="fiche-headtext">
      <div class="fiche-title">${esc(title)}</div>
      <div class="fiche-sub">${esc(sub)}</div>
    </div>
    <button class="poi-clear" onclick="selectedPoi=null;map.closePopup();updateInsights()" title="Fermer la fiche">✕</button>
  </div>`;
}
function fSection(title, inner) {
  if (!inner) return "";
  return `<div class="fiche-section"><div class="fiche-sec-title">${esc(title)}</div>${inner}</div>`;
}
function fRow(label, value, opts = {}) {
  if (value == null || value === "") return "";
  const v = opts.html ? value : esc(String(value));
  const cls = ["fiche-v", opts.mono && "mono", opts.strong && "strong", opts.accent && "accent"].filter(Boolean).join(" ");
  return `<div class="fiche-row"><span class="fiche-k">${esc(label)}</span><span class="${cls}">${v}</span></div>`;
}
function fHero(value, label, color) {
  return `<div class="fiche-hero"${color ? ` style="--hero:${color}"` : ""}>
    <div class="fiche-hero-val">${value}</div><div class="fiche-hero-lbl">${esc(label)}</div></div>`;
}
function fBadges(arr) {
  const items = arr.filter(Boolean).map((s) => `<span class="fiche-badge">${esc(s)}</span>`).join("");
  return items ? `<div class="fiche-badges">${items}</div>` : "";
}
function fNote(text) { return text ? `<div class="fiche-note">${esc(text)}</div>` : ""; }

// --- Dictionnaire de champs pour le template générique (WFS) ---
// clé brute -> [libellé, section, formateur(optionnel, renvoie du HTML sûr)]
const FIELD = {
  nature: ["Nature", "Identité"], soustheme: ["Type", "Identité"], theme: ["Thème", "Identité"],
  type: ["Type", "Identité"], categorie: ["Catégorie", "Identité"], statut_public_prive: ["Statut", "Identité"],
  type_equip: ["Type d'équipement", "Identité"], label: ["Label", "Identité"], reglement: ["Règlement", "Identité"],
  gestion: ["Gestion", "Identité"], gestionnaire: ["Gestionnaire", "Identité"], ctm: ["Territoire", "Identité"],
  ministere_tutelle: ["Ministère de tutelle", "Identité"], circonscription: ["Circonscription", "Identité"],
  nom_operateur: ["Opérateur", "Identité"], nom_amenageur: ["Aménageur", "Identité"],
  nom_enseigne: ["Enseigne", "Identité"], nom_station: ["Station", "Identité"],
  date_ouverture: ["Ouverture", "Identité", fmtDateFR], ann_ouvert: ["Année d'ouverture", "Identité"],
  anneecreation: ["Année de création", "Identité"], datecreation: ["Création", "Identité", fmtDateFR],
  essence: ["Nom scientifique", "Caractéristiques"], genre: ["Genre", "Caractéristiques"],
  espece: ["Espèce", "Caractéristiques"], variete: ["Variété", "Caractéristiques"],
  architecture: ["Port", "Caractéristiques"], naturerevetement: ["Revêtement", "Caractéristiques"],
  circonference_cm: ["Circonférence", "Caractéristiques", (v) => v + " cm"],
  hauteurtotale_m: ["Hauteur", "Caractéristiques", (v) => v + " m"],
  hauteurfut_m: ["Hauteur du fût", "Caractéristiques", (v) => v + " m"],
  diametrecouronne_m: ["Diamètre de couronne", "Caractéristiques", (v) => v + " m"],
  anneeplantation: ["Année de plantation", "Caractéristiques"],
  dateplantation: ["Date de plantation", "Caractéristiques", fmtDateFR],
  capacite: ["Capacité", "Caractéristiques", (v) => fmtNum(v) + " places"],
  nombre_d_eleves: ["Effectif", "Caractéristiques", (v) => fmtNum(v) + " élèves"],
  surf_tot_m2: ["Superficie", "Caractéristiques", (v) => (v / 10000).toFixed(2) + " ha"],
  nbemplacements: ["Emplacements", "Caractéristiques"], nbre_pdc: ["Points de charge", "Caractéristiques"],
  puissance_nominale: ["Puissance", "Caractéristiques", (v) => v + " kW"],
  tarification: ["Tarif", "Caractéristiques", (v) => v + " €"],
  implantation_station: ["Implantation", "Caractéristiques"], typeautopartage: ["Réseau", "Caractéristiques"],
  reseau: ["Réseau", "Caractéristiques"], typeamenagement: ["Aménagement", "Caractéristiques"],
  senscirculation: ["Sens de circulation", "Caractéristiques"],
  date_mise_en_service: ["Mise en service", "Caractéristiques", fmtDateFR],
  anneerealisation: ["Année de réalisation", "Caractéristiques"],
  horaires: ["Horaires", "Horaires & accès", fmtHoraires], precision_horaires: ["Précisions", "Horaires & accès"],
  jourtenue: ["Jour de tenue", "Horaires & accès"], condition_acces: ["Conditions d'accès", "Horaires & accès"],
  accessibilite_pmr: ["Accessibilité PMR", "Horaires & accès"], restriction_gabarit: ["Restriction gabarit", "Horaires & accès"],
  acces: ["Accès", "Horaires & accès"], circulation: ["Circulation", "Horaires & accès"],
  accesenviront: ["Environnement", "Horaires & accès"], dispojours: ["Jours de disponibilité", "Horaires & accès"],
  dispohoraires: ["Disponibilité", "Horaires & accès"], etatfonctiont: ["État de fonctionnement", "Horaires & accès"],
  etat: ["État", "Horaires & accès"],
  adresse: ["Adresse", "Localisation"], commune: ["Commune", "Localisation"], code_postal: ["Code postal", "Localisation"],
  codepost: ["Code postal", "Localisation"], nomvoie: ["Voie", "Localisation"], voie: ["Voie", "Localisation"],
  localisation: ["Emplacement", "Localisation"], infoloc: ["Précision", "Localisation"],
  precision_localisation: ["Précision", "Localisation"],
  telephone: ["Téléphone", "Contact", telLink], telephone_operateur: ["Téléphone", "Contact", telLink],
  mail: ["Courriel", "Contact", mailLink], contact_operateur: ["Contact opérateur", "Contact", mailLink],
  url: ["Site web", "Contact", (v) => urlLink(v, "Ouvrir le site")],
  observations: ["Observations", "Autres"]
};
// Champs booléens -> libellé (rendus en pastilles quand vrai)
const BOOL_LABEL = {
  restauration: "Restauration", hebergement: "Internat", ulis: "ULIS",
  ecole_maternelle: "Maternelle", ecole_elementaire: "Élémentaire",
  eau: "Point d'eau", toilettes: "Toilettes", chien: "Chiens admis", esp_can: "Espace canin",
  banking: "Terminal de paiement", bonus: "Station bonus",
  prise_type_2: "Prise Type 2", prise_type_combo_ccs: "Combo CCS", prise_type_chademo: "CHAdeMO",
  prise_type_ef: "Prise E/F", prise_type_autre: "Autre prise",
  gratuit: "Gratuit", paiement_cb: "Paiement CB", paiement_acte: "Paiement à l'acte",
  paiement_autre: "Autre paiement", reservation: "Réservation", station_deux_roues: "Deux-roues",
  cable_t2_attache: "Câble T2 attaché", electrodepediatrique: "Électrodes pédiatriques",
  presenceaccueil: "Accueil sur place", presencepostesecurite: "Poste de sécurité",
  pmr: "Accessible PMR", ascenseur: "Ascenseur"
};
// Champs techniques à ne jamais afficher
const FIELD_DENY = new Set([
  "gid", "uid", "id_ariane", "code_nature", "code_type_contrat_prive", "codeinsee", "codefuv", "codegenre",
  "code_insee", "codinsee", "insee", "identifiant", "idexterne", "idstation", "id_station_itinerance",
  "id_station_local", "id_pdc_itinerance", "id_pdc_local", "siren_siret", "siret", "siren_amenageur",
  "num_pdl", "num", "numero", "multi_uai", "pial", "uai", "datemaj", "date_maj", "datereleve", "majdonnees",
  "last_update", "last_update_fme", "last_update_gl", "provenance", "photo", "source", "openinghours",
  "openinghoursspecification", "sameas", "wikipedia", "address", "effectifs_par_uai", "raccordement",
  "code_insee_commune", "num_pdl", "numvoie", "clos", "isCrime"
]);

// --- Template générique (couches WFS hétérogènes) ---
function ficheGeneric(def, props) {
  const ORDER = ["Identité", "Localisation", "Caractéristiques", "Horaires & accès", "Contact", "Autres"];
  const buckets = {}; ORDER.forEach((s) => (buckets[s] = ""));
  const badges = [];
  const titleKey = (def.popup && def.popup.title) || "nom";
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === "" || v === "None") continue;
    if (k === titleKey || k === "source" || FIELD_DENY.has(k) || k.startsWith("_")) continue;
    if (typeof v === "boolean") { if (v) badges.push(BOOL_LABEL[k] || humanize(k)); continue; }
    if (typeof v === "object") continue;
    const fd = FIELD[k];
    if (fd) {
      const [label, section, fmt] = fd;
      buckets[section] += fRow(label, fmt ? fmt(v) : esc(String(v)), { html: true });
    } else {
      buckets["Autres"] += fRow(humanize(k), esc(String(v)), { html: true });
    }
  }
  let html = "";
  if (badges.length) html += fSection("Services & équipements", fBadges(badges));
  for (const s of ORDER) if (buckets[s]) html += fSection(s, buckets[s]);
  return html;
}

// --- Vélo'v (temps réel) ---
function ficheVelov(p) {
  const total = p.total != null ? p.total : (Number(p.bikes || 0) + Number(p.stands || 0));
  const pct = total ? Math.round((p.bikes / total) * 100) : 0;
  const open = p.status ? /open|ouv/i.test(p.status) : true;
  let html = `<div class="fiche-gauge-row">
    ${fHero(`<span class="mono">${p.bikes}</span>`, "vélos dispo.", "#34d399")}
    ${fHero(`<span class="mono">${p.stands}</span>`, "places libres", "#60a5fa")}
  </div>
  <div class="fiche-gauge"><span style="width:${pct}%"></span></div>
  <div class="fiche-gauge-cap">${p.bikes} / ${total} bornes occupées</div>`;
  html += fSection("État", fBadges([open ? "Station ouverte" : "Station fermée", p.banking ? "Terminal de paiement" : null]));
  let rows = "";
  if (p.ebikes != null) rows += fRow("Vélos électriques", p.ebikes, { mono: true });
  if (p.mbikes != null) rows += fRow("Vélos mécaniques", p.mbikes, { mono: true });
  if (total) rows += fRow("Capacité totale", total + " bornes");
  if (p.commune) rows += fRow("Commune", p.commune);
  if (p.address) rows += fRow("Adresse", p.address);
  if (p.last_update) rows += fRow("Mise à jour", fmtDateFR(p.last_update), { html: true });
  html += fSection("Informations", rows);
  return html;
}

// --- Gare ferroviaire SNCF (couche Métropole adrgareferpct) ---
function ficheGare(p) {
  let rows = "";
  if (p.soustheme) rows += fRow("Type", p.soustheme);
  if (p.idexterne) rows += fRow("Code gare (UIC)", String(p.idexterne), { mono: true });
  if (p.identifiant) rows += fRow("Identifiant Métropole", p.identifiant, { mono: true });
  let html = fSection("Informations", rows);
  if (p.nom) {
    const search = `https://www.garesetconnexions.sncf/fr/recherche?q=${encodeURIComponent(p.nom)}`;
    html += fSection("Horaires & services", fRow("Fiche gare", urlLink(search, "SNCF Gares & Connexions"), { html: true }));
  }
  return html || fNote("Aucun détail supplémentaire disponible.");
}

// --- Évènement OpenAgenda (Fête de la musique) ---
function ficheEvent(p) {
  let html = "";
  if (p.image) html += `<img class="fiche-img" src="${esc(p.image)}" alt="" loading="lazy">`;
  if (p.quand) html += fSection("Quand", fRow("Date", p.quand, { strong: true }));
  if (p.description) html += fNote(p.description);
  let lieu = "";
  if (p.lieu) lieu += fRow("Lieu", p.lieu, { strong: true });
  if (p.adresse) lieu += fRow("Adresse", p.adresse);
  if (p.quartier) lieu += fRow("Quartier", p.quartier);
  if (p.acces) lieu += fRow("Accès", p.acces);
  html += fSection("Où", lieu);
  let prat = "";
  if (p.age_min != null || p.age_max != null) {
    const a = p.age_min != null && p.age_max != null ? `${p.age_min}–${p.age_max} ans`
      : (p.age_min != null ? `dès ${p.age_min} ans` : `jusqu'à ${p.age_max} ans`);
    prat += fRow("Public", a);
  }
  if (p.conditions) prat += fRow("Conditions", p.conditions);
  if (p.accessibilite) prat += fRow("Accessibilité", p.accessibilite);
  if (p.organisateur) prat += fRow("Organisateur", p.organisateur);
  html += fSection("Infos pratiques", prat);
  let liens = "";
  if (p.url) liens += fRow("Programme", urlLink(p.url, "Voir l'évènement"), { html: true });
  if (p.site) liens += fRow("Site du lieu", urlLink(p.site, "Ouvrir"), { html: true });
  if (p.tel) liens += fRow("Téléphone", telLink(p.tel), { html: true });
  html += fSection("Liens & contact", liens);
  return html;
}

// --- Overpass / OpenStreetMap (police, pompiers, pharmacies) ---
const OSM_LABEL = {
  operator: "Exploitant", opening_hours: "Horaires", phone: "Téléphone", "contact:phone": "Téléphone",
  website: "Site web", "contact:website": "Site web", email: "Courriel", "contact:email": "Courriel",
  wheelchair: "Accès PMR", brand: "Enseigne", healthcare: "Type de soin", dispensing: "Délivre des médicaments",
  emergency: "Urgences", description: "Description", "addr:postcode": "Code postal"
};
const OSM_DENY = new Set(["name", "source", "amenity", "addr:housenumber", "addr:street", "addr:city", "ref"]);
function ficheOverpass(def, p) {
  let rows = "";
  if (p.adresse) rows += fRow("Adresse", p.adresse);
  for (const [k, v] of Object.entries(p)) {
    if (v == null || v === "" || typeof v === "object") continue;
    if (k === "adresse" || k === "name" || k === "source" || k.startsWith("_") || OSM_DENY.has(k)) continue;
    if (k.startsWith("addr:") && k !== "addr:postcode") continue;
    const label = OSM_LABEL[k] || humanize(k);
    let val = esc(String(v)), html = false;
    if (/phone/.test(k)) { val = telLink(v); html = true; }
    else if (/website|url/.test(k)) { val = urlLink(v, "Ouvrir"); html = true; }
    else if (/email/.test(k)) { val = mailLink(v); html = true; }
    else if (v === "yes") val = "Oui"; else if (v === "no") val = "Non";
    rows += fRow(label, val, { html });
  }
  return fSection("Informations", rows) || fNote("Données OpenStreetMap limitées pour ce point.");
}

// --- Véhicule TCL (position théorique) ---
function ficheVehicle(p) {
  let html = fHero(`<span class="mono">${esc(p.ligne || "—")}</span>`, "ligne", "#E8308A");
  let rows = "";
  if (p.direction) rows += fRow("Direction", p.direction, { strong: true });
  if (p.departure) rows += fRow("Départ", p.departure, { mono: true });
  if (p.progress != null) rows += fRow("Progression estimée", p.progress + " %", { mono: true });
  html += fSection("Course", rows);
  html += fNote("Position estimée d'après les fréquences théoriques (non temps réel).");
  return html;
}

// --- Vente DVF (point) ---
function ficheDvfSale(p) {
  let html = fHero(`<span class="mono">${fmtNum(Math.round(p.price))} €</span>`, "prix de vente", "#f59e0b");
  let rows = "";
  if (p.title) rows += fRow("Bien", p.title);
  if (p.surface) rows += fRow("Surface", Math.round(p.surface) + " m²");
  if (p.rooms) rows += fRow("Pièces", p.rooms);
  if (p.ppm2) rows += fRow("Prix au m²", fmtNum(Math.round(p.ppm2)) + " €/m²", { mono: true });
  if (p.date) rows += fRow("Date de vente", p.date);
  html += fSection("Caractéristiques", rows);
  return html;
}

// --- Choroplèthe DVF (arrondissement) ---
function ficheDvfArrond(p) {
  const name = p.nomreduit || p.nom;
  let html = fHero(`<span class="mono">${p.medianPrice ? fmtNum(Math.round(p.medianPrice)) + " €/m²" : "n.d."}</span>`, "prix médian (appart. 2024)", "#fd8d3c");
  let rows = "";
  if (name) rows += fRow("Arrondissement", name, { strong: true });
  if (p.salesCount != null) rows += fRow("Ventes analysées", fmtNum(p.salesCount), { mono: true });
  html += fSection("Marché immobilier", rows);
  return html;
}

// --- Choroplèthe délinquance (arrondissement) ---
function ficheCrime(p) {
  const insee = p.insee;
  const data = window.DELINQUANCE_DATA;
  const a = data?.arrondissements?.[insee];
  const label = crimeIndicator === "__all__" ? "Tous les faits" : crimeIndicator;
  const rate = crimeRate(insee, crimeIndicator);
  const count = crimeCount(insee, crimeIndicator);
  let html = fHero(`<span class="mono">${rate != null ? rate.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " ‰" : "n.d."}</span>`,
    `${label.toLowerCase()} · pour 1 000 hab.`, "#a78bfa");
  let rows = "";
  if (p.nom) rows += fRow("Arrondissement", p.nom, { strong: true });
  if (count != null) rows += fRow("Faits enregistrés", fmtNum(count), { mono: true });
  if (a?.pop) rows += fRow("Population", fmtNum(a.pop), { mono: true });
  rows += fRow("Millésime", data?.meta?.year);
  html += fSection("Synthèse", rows);
  // Détail par type de faits
  if (a?.data) {
    const items = data.indicateurs
      .map((ind) => ({ ind, v: a.data[ind] ? a.data[ind][0] : null }))
      .filter((x) => x.v != null).sort((x, y) => y.v - x.v);
    let det = "";
    for (const { ind, v } of items) det += fRow(ind, v.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " ‰", { mono: true });
    html += fSection("Détail par type de faits", det);
  }
  return html;
}

// --- Choroplèthe eau potable (commune) ---
function ficheEau(p) {
  const agg = p._eau;
  if (!agg) return fNote("Aucun contrôle sanitaire récent pour cette commune.");
  const cmap = { C: "Conforme", N: "Non conforme", D: "Dérogation", S: "Surveillance" };
  const conf = agg.conforme;
  const rate = agg.total ? Math.round((agg.conformes / agg.total) * 100) : null;
  let html = fHero(conf ? "✓" : "⚠", conf ? "eau conforme" : "non conforme", conf ? "#41ab5d" : "#d7301f");
  let rows = "";
  rows += fRow("Conformité bactériologique", cmap[agg.bact] || agg.bact || "—");
  rows += fRow("Conformité physico-chimique", cmap[agg.pc] || agg.pc || "—");
  if (rate != null) rows += fRow("Taux de conformité (6 mois)", rate + " %", { mono: true });
  rows += fRow("Prélèvements analysés", fmtNum(agg.total), { mono: true });
  if (agg.date) rows += fRow("Dernier contrôle", fmtDateFR(agg.date), { html: true });
  html += fSection("Contrôle sanitaire", rows);
  return html;
}

// --- Indice ATMO (qualité de l'air) ---
function ficheAir(p) {
  const sub = (code) => {
    const s = ATMO_SCALE.find((x) => x.code === Math.round(code));
    return s ? `<span class="fiche-chip" style="background:${s.color}">${esc(s.label)}</span>` : null;
  };
  let html = "";
  if (p.lib_qual) html += fHero(esc(p.lib_qual), "qualité de l'air du jour", p.coul_qual || "#50CCAA");
  let rows = "";
  const pollu = [["Dioxyde d'azote (NO₂)", p.code_no2], ["Ozone (O₃)", p.code_o3],
    ["Particules PM10", p.code_pm10], ["Particules fines PM2.5", p.code_pm25], ["Dioxyde de soufre (SO₂)", p.code_so2]];
  for (const [label, code] of pollu) { if (code != null) { const c = sub(code); if (c) rows += fRow(label, c, { html: true }); } }
  html += fSection("Sous-indices par polluant", rows);
  let info = "";
  if (p.lib_zone) info += fRow("Commune", p.lib_zone);
  if (p.date_ech) info += fRow("Échéance", p.date_ech);
  html += fSection("Informations", info);
  return html;
}

// --- Aiguillage : un template par type de donnée ---
function buildPoiDetailHtml(def, props, color) {
  const dotColor = color || def.color;
  const title = poiTitle(def, props);
  const sub = poiTypeLabel(def, props);
  let body;
  switch (def.type) {
    case "velov": body = ficheVelov(props); break;
    case "overpass": body = ficheOverpass(def, props); break;
    case "openagenda": body = ficheEvent(props); break;
    case "vehicles": body = ficheVehicle(props); break;
    case "dvf-points": body = ficheDvfSale(props); break;
    case "dvf-choropleth": body = ficheDvfArrond(props); break;
    case "delinquance-choropleth": body = ficheCrime(props); break;
    case "eau-potable-choropleth": body = ficheEau(props); break;
    case "wfs": body = (def.id === "gares-sncf") ? ficheGare(props) : ficheGeneric(def, props); break;
    default: body = (def.id === "air-indice") ? ficheAir(props) : ficheGeneric(def, props);
  }
  const source = props.source || def.source;
  return `<div class="fiche">
    ${fHead(title, sub, dotColor)}
    ${body || `<div class="fiche-note">Aucun détail supplémentaire disponible.</div>`}
    <div class="fiche-src">Source : ${esc(source)}</div>
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

// ============================================================
// Marqueurs : pastille colorée + picto (Font Awesome)
// ============================================================
// Couleur d'encre (icône / texte) lisible sur un fond donné
function contrastInk(color) {
  const c = String(color).trim();
  if (c[0] !== "#") return "#fff";
  let h = c.slice(1);
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "rgba(15,23,42,0.92)" : "#fff";
}

// Icône Leaflet : pastille `fillColor` portant le picto `def.icon`
function makePoiIcon(def, fillColor, radius) {
  const d = Math.round((radius || def.radius || 6.5) * 2 + 9); // diamètre en px
  const ink = contrastInk(fillColor);
  const inner = def.icon ? `<i class="fa-solid ${def.icon}" style="color:${ink}"></i>` : "";
  return L.divIcon({
    className: "poi-divicon",
    html: `<span class="poi-pin" style="background:${fillColor};width:${d}px;height:${d}px;font-size:${Math.round(d * 0.46)}px">${inner}</span>`,
    iconSize: [d, d],
    iconAnchor: [d / 2, d / 2],
    popupAnchor: [0, -d / 2]
  });
}

// Groupe de clusters teinté selon la nature des points (couleur de la couche)
function clusterGroup(color, opts = {}) {
  const ink = contrastInk(color);
  return L.markerClusterGroup({
    showCoverageOnHover: false,
    ...opts,
    iconCreateFunction: (cluster) => {
      const n = cluster.getChildCount();
      const d = n < 10 ? 32 : n < 100 ? 38 : 46;
      return L.divIcon({
        className: "poi-cluster-wrap",
        html: `<div class="poi-cluster" style="background:${color};color:${ink};box-shadow:0 0 0 5px ${color}59;width:${d}px;height:${d}px">${n}</div>`,
        iconSize: [d, d]
      });
    }
  });
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
      const marker = L.marker(latlng, { icon: makePoiIcon(def, fillColor), keyboard: false });
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
    result = clusterGroup(def.color, { disableClusteringAtZoom: 17 });
    result.addLayer(layer);
  }

  // Visibilité conditionnelle au zoom minimum (ex. arbres d'alignement)
  if (def.minZoom != null) {
    const updateVisibility = () => {
      const visible = map.getZoom() >= def.minZoom;
      result.eachLayer((lyr) => {
        const el = lyr.getElement?.();
        if (el) el.style.opacity = visible ? "" : "0";
      });
    };
    map.on("zoomend", updateVisibility);
    // Premier rendu différé : les éléments DOM n'existent qu'après addTo(map)
    const existingResume = result._resume;
    result._resume = () => {
      updateVisibility();
      if (existingResume) existingResume();
    };
    const existingDestroy = result._destroy;
    result._destroy = () => {
      map.off("zoomend", updateVisibility);
      if (existingDestroy) existingDestroy();
    };
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
    const marker = L.marker([s.lat, s.lng], { icon: makePoiIcon(def, color), keyboard: false });
    marker._fillColor = color;
    marker._poiColor = color;
    marker._layerDef = def;
    const avail = s.total_stands?.availabilities || s.main_stands?.availabilities || {};
    const capacity = s.bike_stands ?? s.total_stands?.capacity ?? (bikes + stands);
    marker._poiProps = {
      name: s.name?.replace(/^\d+\s*-\s*/, "") || "Station Vélo'v",
      bikes, stands,
      total: capacity,
      ebikes: avail.electricalBikes ?? null,
      mbikes: avail.mechanicalBikes ?? null,
      banking: s.banking === true || s.banking === "1" || s.banking === 1,
      status: s.status || s.etat,
      commune: s.commune || null,
      address: s.address || null,
      last_update: s.last_update || s.last_update_gl || null,
      source: def.source
    };
    marker.bindPopup(buildPopup(def, marker._poiProps));
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
  // Par défaut on se limite à la commune de Lyon ; certaines couches (ex.
  // stations-service, surtout présentes en périphérie) préfèrent l'emprise
  // élargie LYON_BBOX pour ne pas tronquer les résultats.
  const selector = def.bbox
    ? `nwr${def.osmFilter}(${LYON_BBOX[1]},${LYON_BBOX[0]},${LYON_BBOX[3]},${LYON_BBOX[2]});`
    : `area["name"="Lyon"]["boundary"="administrative"]["admin_level"="8"]->.a;
       nwr(area.a)${def.osmFilter};`;
  const query = `[out:json][timeout:30];
    ${selector}
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
    const marker = L.marker([lat, lon], { icon: makePoiIcon(def, def.color), keyboard: false });
    const addr = [tags["addr:housenumber"], tags["addr:street"], tags["addr:postcode"], tags["addr:city"]]
      .filter(Boolean).join(" ");
    marker._layerDef = def;
    // On conserve l'intégralité des tags OSM pour la fiche détaillée
    marker._poiProps = { ...tags, name: tags.name || def.name, adresse: addr || null, source: def.source };
    marker.bindPopup(buildPopup(def, marker._poiProps));
    group.addLayer(marker);
  }
  let result = group;
  if (def.cluster) {
    result = clusterGroup(def.color, { disableClusteringAtZoom: 17 });
    result.addLayer(group);
  }
  result._featureCount = points.length;
  result._points = points;
  return result;
}

// ---------- Évènements OpenAgenda (Fête de la musique) ----------
async function buildOpenAgendaLayer(def) {
  const resp = await fetch(def.url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  const records = data.results || [];

  const group = L.featureGroup();
  const points = [];
  for (const r of records) {
    const c = r.location_coordinates;
    if (!c || c.lat == null || c.lon == null) continue;
    points.push([c.lat, c.lon]);
    const start = r.firstdate_begin ? new Date(r.firstdate_begin) : null;
    const quand = r.daterange_fr || (start
      ? cap(start.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }))
      : null);
    const props = {
      titre: r.title_fr || "Évènement",
      quand,
      description: r.description_fr || r.longdescription_fr || null,
      lieu: r.location_name || null,
      adresse: [r.location_address, r.location_postalcode, r.location_city].filter(Boolean).join(" ") || null,
      quartier: r.location_district || null,
      acces: r.location_access_fr || null,
      accessibilite: r.accessibility_label_fr || null,
      age_min: r.age_min, age_max: r.age_max,
      conditions: r.conditions_fr || null,
      organisateur: r.contributor_organization || null,
      url: r.canonicalurl || null,
      site: r.location_website || null,
      tel: r.location_phone || null,
      image: r.thumbnail || (r.image && (r.image.url || r.image)) || null,
      source: def.source
    };
    const marker = L.marker([c.lat, c.lon], { icon: makePoiIcon(def, def.color), keyboard: false });
    marker._layerDef = def;
    marker._poiProps = props;
    marker.bindPopup(buildPopup(def, props));
    group.addLayer(marker);
  }

  let result = group;
  if (def.cluster) {
    result = clusterGroup(def.color, { disableClusteringAtZoom: 18 });
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
      lyr.bindPopup(buildPopup(def, lyr._poiProps));
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
  const cluster = clusterGroup(def.color, { disableClusteringAtZoom: 18 });
  const points = [];
  for (const sales of Object.values(salesByArrond)) {
    for (const s of sales) {
      if (!s.lat || !s.lon) continue;
      points.push([s.lat, s.lon]);
      const fillColor = dvfColor(s.ppm2);
      const marker = L.marker([s.lat, s.lon], { icon: makePoiIcon(def, fillColor, 5.5), keyboard: false });
      marker._fillColor = fillColor;
      marker._poiColor = fillColor;
      marker._layerDef = def;
      marker._poiProps = { titre: `Appartement ${s.rooms ? s.rooms + " pièce(s), " : ""}${Math.round(s.surface)} m²`, title: `Appartement ${s.rooms ? s.rooms + " pièce(s), " : ""}${Math.round(s.surface)} m²`, price: s.price, ppm2: s.ppm2, surface: s.surface, rooms: s.rooms, date: s.date, source: def.source };
      marker.bindPopup(buildPopup(def, marker._poiProps));
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
      lyr.bindPopup(() => buildPopup(def, feature.properties));
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
      lyr._poiProps = {
        ...feature.properties, source: def.source,
        _eau: agg ? {
          conforme: eauIsConforme(agg.latest.conclusion_conformite_prelevement),
          bact: agg.latest.conformite_limites_bact_prelevement,
          pc: agg.latest.conformite_limites_pc_prelevement,
          total: agg.total, conformes: agg.conformes,
          date: agg.latest.date_prelevement ? agg.latest.date_prelevement.slice(0, 10) : null
        } : null
      };
      lyr.bindPopup(buildPopup(def, feature.properties));
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
const rightPanelHeader = $("#right-panel-header");
const rightPanelToggle = $("#right-panel-toggle");
let isMobileSheetExpanded = false;
const IS_MOBILE = () => window.matchMedia("(max-width: 760px)").matches;

function setMobileSheetExpanded(expanded) {
  isMobileSheetExpanded = expanded;
  rightPanel.classList.toggle("expanded", expanded);
  rightPanelToggle?.setAttribute("aria-label", expanded ? "Fermer la synthèse" : "Ouvrir la synthèse");
}

rightPanelHeader?.addEventListener("click", (e) => {
  if (!IS_MOBILE()) return;
  // Ne pas toggle si l'utilisateur clique sur un élément interactif du contenu
  if (e.target.closest(".right-panel-body, a, button, input, select")) return;
  setMobileSheetExpanded(!isMobileSheetExpanded);
});

rightPanelToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!IS_MOBILE()) return;
  setMobileSheetExpanded(!isMobileSheetExpanded);
});

rightPanel.addEventListener("transitionend", (e) => {
  if (e.propertyName === "width" || e.propertyName === "transform" || e.propertyName === "max-height") {
    // invalidateSize(pan:true par défaut) recalcule la taille du conteneur
    // et appelle panBy pour recentrer la carte automatiquement.
    map.invalidateSize();
  }
});

// ---------- Présélections et catalogue : sheets pliables sur mobile ----------
const themeBar = $("#theme-bar");
const themeBarHeader = $("#theme-bar-header");
const themeBarToggle = $("#theme-bar-toggle");
const sidebar = $("#sidebar");
const sidebarHeader = $("#sidebar-header");
const sidebarToggle = $("#sidebar-toggle");
let isThemeBarExpanded = false;
let isSidebarExpanded = false;

function setThemeBarExpanded(expanded) {
  isThemeBarExpanded = expanded;
  themeBar?.classList.toggle("expanded", expanded);
  themeBarToggle?.setAttribute("aria-label", expanded ? "Fermer les présélections" : "Ouvrir les présélections");
  if (expanded) setSidebarExpanded(false);
}

function setSidebarExpanded(expanded) {
  isSidebarExpanded = expanded;
  sidebar?.classList.toggle("expanded", expanded);
  sidebarToggle?.setAttribute("aria-label", expanded ? "Fermer le catalogue" : "Ouvrir le catalogue");
  if (expanded) setThemeBarExpanded(false);
}

themeBarHeader?.addEventListener("click", () => {
  if (!IS_MOBILE()) return;
  setThemeBarExpanded(!isThemeBarExpanded);
});

themeBarToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!IS_MOBILE()) return;
  setThemeBarExpanded(!isThemeBarExpanded);
});

sidebarHeader?.addEventListener("click", () => {
  if (!IS_MOBILE()) return;
  setSidebarExpanded(!isSidebarExpanded);
});

sidebarToggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!IS_MOBILE()) return;
  setSidebarExpanded(!isSidebarExpanded);
});

[themeBar, sidebar].forEach((el) => {
  if (!el) return;
  el.addEventListener("transitionend", (e) => {
    if (e.propertyName === "max-height") map.invalidateSize();
  });
});

function updateInsights() {
  const div = $("#insights");
  if (activeLayers.size === 0 && !selectedPoi) {
    rightPanel.hidden = true;
    div.innerHTML = "";
    return;
  }
  // Panneau pas encore visible → l'afficher avec animation
  if (rightPanel.hidden) {
    rightPanel.hidden = false;
    if (IS_MOBILE()) {
      // Sur mobile, la sheet est réduite par défaut ; on ne l'ouvre pas
      setMobileSheetExpanded(false);
    } else {
      rightPanel.style.width = "0";
      rightPanel.style.opacity = "0";
      requestAnimationFrame(() => {
        rightPanel.style.width = "";
        rightPanel.style.opacity = "";
      });
    }

    // Fallback : transitionend peut ne pas se déclencher quand
    // le panneau passe de display:none à visible.
    setTimeout(() => map.invalidateSize(), 400);
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

// ---------- Géolocalisation ----------
let locateMarker = null;
const LOCATE_ZOOM = 17;

function createLocateMarker(lat, lng) {
  const color = "#2dd4bf";
  const icon = L.divIcon({
    className: "locate-marker",
    html: `<span class="locate-dot" style="background:${color};box-shadow:0 0 0 4px ${color}44"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });
  return L.marker([lat, lng], { icon, zIndexOffset: 1000 }).bindPopup("Votre position").addTo(map);
}

$("#btn-locate")?.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showStatus("Géolocalisation non supportée par ce navigateur.", true);
    return;
  }
  showStatus("Localisation en cours…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      hideStatus();
      map.setView([lat, lng], LOCATE_ZOOM);
      if (locateMarker) map.removeLayer(locateMarker);
      locateMarker = createLocateMarker(lat, lng);
    },
    (err) => {
      console.error("Géolocalisation refusée ou indisponible", err);
      showStatus("Impossible d'accéder à votre position. Vérifiez les permissions.", true);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

// ---------- Dialog sources ----------
$("#btn-sources").addEventListener("click", () => $("#sources-dialog").showModal());

// ---------- Démarrage : présélection Canicule active par défaut ----------
const CANICULE_PRESELECTION = PRESELECTIONS.find((p) => p.id === "canicule");
if (CANICULE_PRESELECTION) togglePreselection(CANICULE_PRESELECTION);

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
