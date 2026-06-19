/* ============================================================
   Positions théoriques des véhicules TCL
   Calcule la position estimée des métros et trams à partir
   des fréquences théoriques (data/tcl-schedule.js) et des
   géométries de lignes (WFS data.grandlyon.com).
   Animation fluide via requestAnimationFrame, avec arrêts
   aux stations (temps de stationnement).
   ============================================================ */

// ---------- Géométrie ----------

/** Extrait un tableau plat de [lng, lat] depuis LineString ou MultiLineString. */
function flattenCoordinates(geometry) {
  if (geometry.type === "LineString") return geometry.coordinates;
  if (geometry.type === "MultiLineString") {
    let result = [];
    for (let i = 0; i < geometry.coordinates.length; i++) {
      const seg = geometry.coordinates[i];
      if (i === 0) {
        result = result.concat(seg);
      } else {
        // Éviter le doublon au point de jonction
        const last = result[result.length - 1];
        const first = seg[0];
        const offset = (last[0] === first[0] && last[1] === first[1]) ? 1 : 0;
        result = result.concat(seg.slice(offset));
      }
    }
    return result;
  }
  return [];
}

/** Distances cumulées euclidiennes le long d'une polyligne [lng, lat]. */
function computeCumulativeDistances(coords) {
  const cumDists = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0];
    const dy = coords[i][1] - coords[i - 1][1];
    cumDists.push(cumDists[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return cumDists;
}

/** Interpole un point le long de la polyligne à une fraction donnée (0–1).
 *  Retourne { latLng, bearing } ou null si les coords sont vides.
 *  bearing : cap géographique en degrés (0 = nord, 90 = est, sens horaire). */
function interpolateAlongRoute(coords, cumDists, fraction) {
  if (coords.length < 2) return null;

  // Cap d'un segment donné (coords[i] → coords[i+1])
  function segmentBearing(i) {
    const dx = coords[i + 1][0] - coords[i][0]; // Δlng (est)
    const dy = coords[i + 1][1] - coords[i][1]; // Δlat (nord)
    let b = Math.atan2(dx, dy) * (180 / Math.PI);
    if (b < 0) b += 360;
    return b;
  }

  if (fraction <= 0) return { latLng: L.latLng(coords[0][1], coords[0][0]), bearing: segmentBearing(0) };
  if (fraction >= 1) return { latLng: L.latLng(coords[coords.length - 1][1], coords[coords.length - 1][0]), bearing: segmentBearing(coords.length - 2) };

  const totalDist = cumDists[cumDists.length - 1];
  const targetDist = fraction * totalDist;

  // Recherche binaire du segment
  let lo = 0, hi = cumDists.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumDists[mid] <= targetDist) lo = mid;
    else hi = mid;
  }

  const segLen = cumDists[lo + 1] - cumDists[lo];
  if (segLen === 0) return { latLng: L.latLng(coords[lo][1], coords[lo][0]), bearing: segmentBearing(lo) };

  const segFraction = (targetDist - cumDists[lo]) / segLen;
  const lng = coords[lo][0] + segFraction * (coords[lo + 1][0] - coords[lo][0]);
  const lat = coords[lo][1] + segFraction * (coords[lo + 1][1] - coords[lo][1]);

  return { latLng: L.latLng(lat, lng), bearing: segmentBearing(lo) };
}

// ---------- Projection de points sur la polyligne ----------

/** Projette un point [lng, lat] sur le segment le plus proche de la polyligne.
 *  Retourne { fraction, distance } où fraction ∈ [0, 1] est la position
 *  le long de la polyligne et distance est la distance euclidienne au point
 *  projeté le plus proche. */
function projectPointOnPolyline(point, coords, cumDists) {
  let bestDist = Infinity;
  let bestCumDist = 0;
  const totalDist = cumDists[cumDists.length - 1];

  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][0], ay = coords[i][1];
    const bx = coords[i + 1][0], by = coords[i + 1][1];
    const px = point[0], py = point[1];

    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;

    // Paramètre t de la projection sur le segment [A, B]
    let t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));

    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);

    if (dist < bestDist) {
      bestDist = dist;
      bestCumDist = cumDists[i] + t * (cumDists[i + 1] - cumDists[i]);
    }
  }

  return {
    fraction: totalDist > 0 ? bestCumDist / totalDist : 0,
    distance: bestDist
  };
}

// ---------- Carte temps→position avec arrêts aux stations ----------

/** Construit une fonction qui mappe le progrès temporel (0–1) à la position
 *  le long de la ligne (0–1), en incluant les temps d'arrêt aux stations.
 *  - stopFractions : positions des stations intermédiaires, triées (0 < f < 1)
 *  - journeyDuration : durée totale du trajet en minutes (déjà avec arrêts)
 *  - dwellSeconds : temps d'arrêt en secondes à chaque station intermédiaire */
function buildTimePositionMap(stopFractions, journeyDuration, dwellSeconds) {
  if (stopFractions.length === 0) return (progress) => progress;

  const dwellMinutes = dwellSeconds / 60;
  const nIntermediate = stopFractions.length;
  const totalDwellTime = nIntermediate * dwellMinutes;
  const travelTime = journeyDuration - totalDwellTime;

  if (travelTime <= 0) return (progress) => progress;

  // Points de référence : origine (0) → stations intermédiaires → destination (1)
  const allPoints = [0, ...stopFractions, 1];
  const segments = [];
  let timeAccum = 0;

  for (let i = 0; i < allPoints.length - 1; i++) {
    const fromFrac = allPoints[i];
    const toFrac = allPoints[i + 1];
    const dist = toFrac - fromFrac;

    // Segment de voyage (position change)
    const segTravelTime = dist * travelTime;
    const segTimeFrac = segTravelTime / journeyDuration;

    segments.push({
      startTime: timeAccum,
      endTime: timeAccum + segTimeFrac,
      startPos: fromFrac,
      endPos: toFrac
    });
    timeAccum += segTimeFrac;

    // Arrêt à la station (sauf à la destination finale)
    if (i < allPoints.length - 2) {
      const dwellFrac = dwellMinutes / journeyDuration;
      segments.push({
        startTime: timeAccum,
        endTime: timeAccum + dwellFrac,
        startPos: toFrac,
        endPos: toFrac // position constante pendant l'arrêt
      });
      timeAccum += dwellFrac;
    }
  }

  return function(progress) {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    for (const seg of segments) {
      if (progress >= seg.startTime && progress < seg.endTime) {
        const segProgress = (progress - seg.startTime) / (seg.endTime - seg.startTime);
        return seg.startPos + segProgress * (seg.endPos - seg.startPos);
      }
    }
    return 1;
  };
}

/** Temps d'arrêt en secondes par type de transport. */
const DWELL_TIMES = { MET: 25, FUN: 20, TRA: 20 };

// ---------- Temps ----------

/** Minutes depuis minuit. Résolution à la millisecond pour une animation fluide.
 *  Gère le service après minuit (0h30 → 1470). */
function getMinutesSinceMidnight() {
  const now = new Date();
  let m = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 60000;
  if (m < 300) m += 1440; // avant 5h → service de la veille
  return m;
}

// ---------- Calcul des véhicules actifs ----------

/** Pour un schedule de direction, retourne les véhicules actuellement en circulation.
 *  Chaque véhicule : { departureTime, progress } avec progress ∈ [0, 1[ */
function getActiveVehicles(schedule, minutesSinceMidnight) {
  const vehicles = [];
  const journeyDuration = schedule.journeyDuration;
  const earliestDeparture = minutesSinceMidnight - journeyDuration;

  for (const period of schedule.periods) {
    // La période chevauche-t-elle la fenêtre de lookback ?
    if (period.end <= earliestDeparture || period.start > minutesSinceMidnight) continue;

    const windowStart = Math.max(period.start, earliestDeparture);
    const windowEnd = Math.min(period.end, minutesSinceMidnight);

    // Premier départ dans la fenêtre
    const n = Math.ceil((windowStart - period.start) / period.headway);
    let departure = period.start + n * period.headway;

    while (departure <= windowEnd) {
      const progress = (minutesSinceMidnight - departure) / journeyDuration;
      if (progress >= 0 && progress < 1) {
        vehicles.push({ departureTime: departure, progress });
      }
      departure += period.headway;
    }
  }

  return vehicles;
}

// ---------- Matching schedule ↔ WFS ----------

/** Matche une feature WFS avec son entrée dans TCL_SCHEDULE_DATA. */
function matchRouteToSchedule(feature) {
  const props = feature.properties;
  const lineSchedule = window.TCL_SCHEDULE_DATA?.lines?.[props.ligne];
  if (!lineSchedule) return null;
  const dirSchedule = lineSchedule.directions.find(
    d => d.nom_trace === props.nom_trace
  );
  if (!dirSchedule) return null;
  return { lineSchedule, dirSchedule };
}

/** Extrait les identifiants de ligne depuis le champ desserte
 *  (ex: "A:R,T1:A" → ["A","T1"]). */
function parseDesserte(desserte) {
  if (!desserte) return [];
  return desserte.split(",")
    .map(s => s.trim().split(":")[0])
    .filter(s => s.length > 0);
}

// ---------- Markers ----------

/** Crée un marker Leaflet pour un véhicule directionnel. */
function createVehicleMarker(latLng, bearing, route, vehicle, layerDef) {
  const isMetro = route.family === "MET" || route.family === "FUN";
  const c = route.color;
  const w = 30, h = isMetro ? 14 : 16;
  let svg;
  if (isMetro) {
    svg = `<svg viewBox="0 0 30 14" width="${w}" height="${h}">
      <rect x="1" y="2" width="22" height="10" rx="3" fill="${c}" stroke="#fff" stroke-width="0.7"/>
      <path d="M22 2 Q27 7 22 12" fill="${c}" stroke="#fff" stroke-width="0.7" stroke-linejoin="round"/>
      <rect x="4" y="4" width="4" height="4" rx="0.8" fill="rgba(255,255,255,0.85)"/>
      <rect x="10" y="4" width="4" height="4" rx="0.8" fill="rgba(255,255,255,0.85)"/>
      <rect x="16" y="4" width="4" height="4" rx="0.8" fill="rgba(255,255,255,0.85)"/>
    </svg>`;
  } else {
    svg = `<svg viewBox="0 0 30 16" width="${w}" height="${h}">
      <rect x="1" y="3" width="24" height="10" rx="2.5" fill="${c}" stroke="#fff" stroke-width="0.7"/>
      <path d="M24 3 Q28 8 24 13" fill="${c}" stroke="#fff" stroke-width="0.7" stroke-linejoin="round"/>
      <rect x="4" y="5" width="5" height="4" rx="0.8" fill="rgba(255,255,255,0.85)"/>
      <rect x="11" y="5" width="5" height="4" rx="0.8" fill="rgba(255,255,255,0.85)"/>
      <rect x="18" y="5" width="5" height="4" rx="0.8" fill="rgba(255,255,255,0.85)"/>
      <line x1="12" y1="3" x2="12" y2="1" stroke="#fff" stroke-width="1.2"/>
      <line x1="8" y1="1" x2="16" y2="1" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>
    </svg>`;
  }
  // L'SVG est orienté vers l'est (droite). Rotation = cap - 90° pour l'orienter.
  const rot = bearing - 90;
  const icon = L.divIcon({
    className: "vehicle-icon",
    html: `<div class="vehicle-marker${isMetro ? " metro" : ""}" style="transform:rotate(${rot}deg)">${svg}</div>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
    popupAnchor: [0, -h / 2]
  });

  const marker = L.marker(latLng, { icon, interactive: true });
  marker._bearing = bearing;

  const departureH = Math.floor(vehicle.departureTime / 60) % 24;
  const departureM = Math.floor(vehicle.departureTime % 60);
  const progressPct = Math.round(vehicle.progress * 100);

  marker._layerDef = layerDef;
  marker._poiProps = { ligne: route.ligne, direction: route.nomTrace, departure: `${String(departureH).padStart(2, "0")}:${String(departureM).padStart(2, "0")}`, progress: progressPct, source: "Positions théoriques (horaires TCL)" };
  marker.bindPopup(
    `<div class="popup-mini">` +
    `<div class="popup-title">Ligne ${route.ligne}</div>` +
    `<div class="popup-type"><span class="popup-dot" style="background:${layerDef.color}"></span>${layerDef.name}</div>` +
    `<div class="popup-hint">Fiche détaillée dans la synthèse →</div>` +
    `</div>`
  );

  return marker;
}

// ---------- Animation fluide ----------

/** Met à jour les positions et rotations de tous les marqueurs.
 *  Appelé à chaque frame par la boucle requestAnimationFrame.
 *  Utilise la carte temps→position de chaque route pour inclure les arrêts. */
function updateVehicles(group, routes, markerMap, layerDef) {
  const now = getMinutesSinceMidnight();
  const desired = new Map(); // vehicleId → { latLng, bearing, route, vehicle }

  for (const route of routes) {
    const vehicles = getActiveVehicles(route.schedule, now);
    for (const v of vehicles) {
      const id = `${route.ligne}:${route.nom_trace}:${v.departureTime.toFixed(2)}`;
      // Convertir le progrès temporel en position le long de la ligne
      // (avec arrêts aux stations si la carte est disponible)
      const position = route.positionFromProgress
        ? route.positionFromProgress(v.progress)
        : v.progress;
      const interp = interpolateAlongRoute(route.coords, route.cumDists, position);
      if (interp) desired.set(id, { latLng: interp.latLng, bearing: interp.bearing, route, vehicle: v });
    }
  }

  // Retirer les marqueurs qui ne sont plus actifs
  for (const [id, marker] of markerMap) {
    if (!desired.has(id)) {
      group.removeLayer(marker);
      markerMap.delete(id);
    }
  }

  // Ajouter ou déplacer les marqueurs
  for (const [id, data] of desired) {
    if (markerMap.has(id)) {
      const marker = markerMap.get(id);
      marker.setLatLng(data.latLng);
      // Mise à jour de la rotation directionnelle
      const vm = marker.getElement()?.querySelector(".vehicle-marker");
      if (vm) {
        let prev = marker._bearing || 0;
        let next = data.bearing;
        // Normaliser la différence angulaire pour éviter le spin 359→1
        let diff = next - prev;
        if (diff > 180) next -= 360;
        if (diff < -180) next += 360;
        marker._bearing = next;
        vm.style.transform = `rotate(${next - 90}deg)`;
      }
    } else {
      const marker = createVehicleMarker(data.latLng, data.bearing, data.route, data.vehicle, layerDef);
      group.addLayer(marker);
      // Désactiver la transition CSS le temps du placement initial,
      // sinon le marker « glisse » depuis le coin de la carte.
      const el = marker.getElement();
      if (el) el.classList.add("vehicle-entering");
      requestAnimationFrame(() => {
        if (el) el.classList.remove("vehicle-entering");
      });
      markerMap.set(id, marker);
    }
  }

  group._featureCount = markerMap.size;
}

// ---------- Construction de la couche ----------

/** Point d'entrée principal — appelé par buildLayer() dans app.js. */
async function buildVehicleLayer(def) {
  if (!window.TCL_SCHEDULE_DATA) {
    throw new Error("data/tcl-schedule.js introuvable");
  }

  // 1. Récupérer les géométries de lignes depuis le WFS
  const resp = await fetch(def.wfsUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const geojson = await resp.json();

  // 2. Récupérer les arrêts pour calculer les positions de stations
  const knownLines = new Set(Object.keys(window.TCL_SCHEDULE_DATA.lines));
  let stopsGeojson = { features: [] };
  try {
    const stopsResp = await fetch(wfsUrl("rdata", "tcl_sytral.tclarret", true));
    if (stopsResp.ok) stopsGeojson = await stopsResp.json();
  } catch (e) { /* Les arrêts sont optionnels */ }

  // Indexer les arrêts par ligne : Map<ligne, Map<nom, {lng, lat}>>
  // (on utilise le nom pour dédupliquer les 2 quais A/R d'une même station)
  const stopsByLine = new Map();
  for (const f of stopsGeojson.features || []) {
    const p = f.properties;
    const lines = parseDesserte(p.desserte).filter(l => knownLines.has(l));
    for (const line of lines) {
      if (!stopsByLine.has(line)) stopsByLine.set(line, new Map());
      stopsByLine.get(line).set(p.nom, {
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1]
      });
    }
  }

  // 3. Construire le tableau de routes (match WFS ↔ schedule + stations)
  const routes = [];
  for (const feature of geojson.features || []) {
    const props = feature.properties;
    const match = matchRouteToSchedule(feature);
    if (!match) continue;

    const coords = flattenCoordinates(feature.geometry);
    if (coords.length < 2) continue;

    const cumDists = computeCumulativeDistances(coords);
    const route = {
      ligne: props.ligne,
      nom_trace: props.nom_trace,
      nomTrace: props.nom_trace, // pour le popup
      color: props.couleur_hex || match.lineSchedule.color,
      family: props.famille_transport || match.lineSchedule.family,
      coords,
      cumDists,
      totalDist: cumDists[cumDists.length - 1],
      schedule: match.dirSchedule
    };

    // Projeter les stations sur la polyligne et construire la carte temps→position
    const lineStops = stopsByLine.get(props.ligne);
    if (lineStops && lineStops.size > 0) {
      const projectedStops = [];
      const seen = new Set(); // dédupliquer les stations très proches
      for (const [nom, s] of lineStops) {
        const proj = projectPointOnPolyline([s.lng, s.lat], coords, cumDists);
        // Ne garder que les stations assez proches de la ligne (< ~200m en coordonnées)
        if (proj.distance > 0.002) continue;
        // Ignorer les stations aux extrémités (terminus)
        if (proj.fraction <= 0.01 || proj.fraction >= 0.99) continue;
        // Dédupliquer par fraction (arrondie à 2 décimales)
        const key = proj.fraction.toFixed(2);
        if (seen.has(key)) continue;
        seen.add(key);
        projectedStops.push(proj.fraction);
      }
      projectedStops.sort((a, b) => a - b);

      const dwellSec = DWELL_TIMES[route.family] || 20;
      route.positionFromProgress = buildTimePositionMap(
        projectedStops, match.dirSchedule.journeyDuration, dwellSec
      );
    }

    routes.push(route);
  }

  if (routes.length === 0) {
    throw new Error("Aucune correspondance entre WFS et horaires");
  }

  // 4. Créer le groupe et la map de marqueurs
  const group = L.featureGroup();
  const markerMap = new Map(); // vehicleId → L.marker

  // 5. Boucle d'animation fluide via requestAnimationFrame (60 fps)
  let animFrameId = null;

  function animateLoop() {
    updateVehicles(group, routes, markerMap, def);
    animFrameId = requestAnimationFrame(animateLoop);
  }

  // Premier calcul immédiat
  updateVehicles(group, routes, markerMap, def);
  animFrameId = requestAnimationFrame(animateLoop);

  // 6. Hooks de cycle de vie
  group._destroy = () => {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  };
  group._resume = () => {
    if (animFrameId !== null) cancelAnimationFrame(animFrameId);
    updateVehicles(group, routes, markerMap, def);
    animFrameId = requestAnimationFrame(animateLoop);
  };

  // 7. Métadonnées pour l'intégration UI
  group._featureCount = markerMap.size;
  group._points = []; // Pas de comptage par zone pour les véhicules

  return group;
}