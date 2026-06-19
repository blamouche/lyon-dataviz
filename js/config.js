/* ============================================================
   Configuration des thèmes et des couches de données.
   Chaque couche déclare sa source (WFS Grand Lyon, Overpass/OSM,
   Vélo'v temps réel ou DVF data.gouv.fr) et son habillage.
   ============================================================ */

// Emprise de la ville de Lyon (lon min, lat min, lon max, lat max)
const LYON_BBOX = [4.76, 45.69, 4.94, 45.83];

const WFS_BASE = "https://download.data.grandlyon.com/wfs";

// Construit une URL WFS GeoJSON (service: "grandlyon" ou "rdata")
function wfsUrl(service, typename, useBbox) {
  // NB : le serveur refuse (HTTP 400) les caractères « / ; : » encodés,
  // on ne les échappe donc pas.
  let url = `${WFS_BASE}/${service}?SERVICE=WFS&VERSION=2.0.0&request=GetFeature` +
    `&typename=${typename}` +
    `&outputFormat=application/json;%20subtype=geojson` +
    `&SRSNAME=EPSG:4326&count=10000`;
  if (useBbox) url += `&bbox=${LYON_BBOX.join(",")},EPSG:4326`;
  return url;
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const VELOV_URL = "https://download.data.grandlyon.com/ws/rdata/jcd_jcdecaux.jcdvelov/all.json?maxfeatures=1000&start=1";
// Ventes immobilières : préparées par scripts/build_dvf.py (à relancer chaque
// année), embarquées via data/dvf-2024.js qui définit window.DVF_DATA.
// Codes INSEE des 9 arrondissements de Lyon
const LYON_ARRONDISSEMENTS = ["69381","69382","69383","69384","69385","69386","69387","69388","69389"];

// ---- Qualité de l'air : indice ATMO du jour ----
// Flux WFS national d'Atmo France agrégeant les AASQA (Atmo Auvergne-Rhône-Alpes
// pour Lyon). La couche « ind_atmo_2021 » couvre J-1, J et J+1 par commune :
// on récupère l'agglomération lyonnaise via bbox puis on filtre le jour courant
// côté client (def.filter). Chaque commune porte sa couleur officielle (coul_qual).
const ATMO_WFS = "https://data.atmo-france.org/geoserver/ind/ows";
function airIndiceUrl() {
  return `${ATMO_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=ind_atmo_2021&outputFormat=application/json&srsName=EPSG:4326` +
    `&bbox=45.60,4.70,45.90,5.00,urn:ogc:def:crs:EPSG::4326&count=2000`;
}
// Date du jour (locale) au format AAAA-MM-JJ, pour ne garder que l'échéance du jour
const AIR_TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
// Échelle officielle de l'indice ATMO (libellés et couleurs Atmo France)
const ATMO_SCALE = [
  { code: 1, label: "Bon",                 color: "#50F0E6" },
  { code: 2, label: "Moyen",               color: "#50CCAA" },
  { code: 3, label: "Dégradé",             color: "#F0E641" },
  { code: 4, label: "Mauvais",             color: "#FF5050" },
  { code: 5, label: "Très mauvais",        color: "#960032" },
  { code: 6, label: "Extrêmement mauvais", color: "#7D2181" }
];
// Libellé d'un sous-indice polluant (code 1→6) pour les popups
function atmoSubLabel(code) {
  const s = ATMO_SCALE.find((x) => x.code === Math.round(code));
  return s ? s.label : null;
}

// ---- Contrôle de l'eau potable (contrôle sanitaire ARS, via Hub'Eau) ----
// Polygones des communes de la Métropole (on ne garde que communegl=true).
const COMMUNES_WFS = wfsUrl("grandlyon", "metropole-de-lyon:adr_voie_lieu.adrcommunes_2024");
// Fenêtre d'analyse du taux de conformité : 6 derniers mois
const EAU_DATE_MIN = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
})();
// Résultats du contrôle sanitaire par commune. Astuce : on filtre sur le pH
// (code_parametre 1302), mesuré à chaque prélèvement, pour obtenir ≈ 1 ligne par
// prélèvement (sinon l'API renvoie 1 ligne par paramètre, soit des dizaines de
// milliers de lignes).
// NB : Hub'Eau limite à 20 codes commune par requête → l'appelant découpe en lots.
const EAU_COMMUNES_PAR_REQUETE = 20;
function eauPotableUrl(inseeChunk) {
  return `https://hubeau.eaufrance.fr/api/v1/qualite_eau_potable/resultats_dis` +
    `?code_commune=${inseeChunk.join(",")}&code_parametre=1302` +
    `&date_min_prelevement=${EAU_DATE_MIN}&size=10000&sort=desc` +
    `&fields=code_commune,nom_commune,date_prelevement,conclusion_conformite_prelevement,` +
    `conformite_limites_bact_prelevement,conformite_limites_pc_prelevement`;
}
// Couleurs du verdict de conformité (contrôle sanitaire)
const EAU_COLORS = { conforme: "#41ab5d", nonconforme: "#d7301f", nodata: "#555" };

// ---- Fête de la musique : programmation OpenAgenda (Ministère de la Culture) ----
// On interroge le dataset keyless « evenements-publics-openagenda » d'OpenDataSoft
// (miroir de l'agenda national OpenAgenda), filtré sur Lyon et l'édition courante.
const FETE_MUSIQUE_YEAR = 2026;
function feteMusiqueUrl() {
  const where = `search("fête de la musique") and location_city="Lyon"` +
    ` and firstdate_begin>="${FETE_MUSIQUE_YEAR}-06-01"` +
    ` and firstdate_begin<="${FETE_MUSIQUE_YEAR}-06-30"`;
  const select = [
    "title_fr", "description_fr", "longdescription_fr", "conditions_fr", "daterange_fr",
    "firstdate_begin", "accessibility_label_fr", "age_min", "age_max",
    "location_name", "location_address", "location_postalcode", "location_city",
    "location_district", "location_access_fr", "location_phone", "location_website",
    "location_coordinates", "contributor_organization", "thumbnail", "canonicalurl"
  ].join(",");
  return `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/` +
    `evenements-publics-openagenda/records?where=${encodeURIComponent(where)}` +
    `&limit=100&select=${select}`;
}

// Couleurs officielles des lignes TCL (métro, funiculaire, tramway)
const LINE_COLORS = {
  A: "#E8308A", B: "#0075BF", C: "#F8961D", D: "#009E3D",
  F1: "#95C23D", F2: "#95C23D",
  T1: "#8C368C", T2: "#8C368C", T3: "#8C368C",
  T4: "#8C368C", T5: "#8C368C", T6: "#F191A3", T7: "#8C368C"
};

// Retourne la couleur de la première ligne desservie par une station
// (à partir du champ desserte_merged : "A, B" ou "T1, T2")
function stationLineColor(props, fallback) {
  const codes = (props.desserte_merged || props.desserte || "").split(/,\s*/);
  for (const code of codes) {
    const c = LINE_COLORS[code.trim()];
    if (c) return c;
  }
  return fallback;
}

// Mailles disponibles pour l'analyse par zone
const ZONE_LEVELS = {
  arrond: {
    label: "Arrondissements (9)",
    url: wfsUrl("grandlyon", "metropole-de-lyon:adr_voie_lieu.adrarrond"),
    filter: (p) => LYON_ARRONDISSEMENTS.includes(p.insee),
    zoneId: (p) => p.insee,
    zoneName: (p) => p.nom
  },
  quartier: {
    label: "Quartiers Ville de Lyon (36)",
    url: wfsUrl("grandlyon", "ville-de-lyon:vdl_vie_citoyenne.perimetre_de_quartier"),
    filter: () => true,
    zoneId: (p) => String(p.code),
    zoneName: (p) => `${p.nom} — Lyon ${p.numero_arrondissement}ᵉ`
  }
};

// ============================================================
//  CATALOGUE DE DONNÉES — classé par NATURE des données.
//  Chaque source n'apparaît qu'UNE seule fois, indépendamment
//  des présélections thématiques (définies plus bas) qui peuvent
//  la convoquer dans n'importe quel thème.
// ============================================================
const CATALOG = [
  {
    id: "mobilite",
    label: "Transports & mobilité",
    emoji: "🚇",
    layers: [
      {
        id: "metro", name: "Métro & funiculaire", desc: "Tracé des lignes A, B, C, D et funiculaires (TCL)",
        subgroup: "🚇 Métro & funiculaire",
        type: "wfs", url: wfsUrl("rdata", "tcl_sytral.tcllignemf_2_0_0"),
        geom: "line", color: "#e2001a", lineColorField: "couleur_hex", weight: 4,
        popup: { title: "ligne", rows: [["Trajet", "nom_trace"], ["Type", "famille_transport"]] },
        source: "SYTRAL / data.grandlyon.com"
      },
      {
        id: "stations-metro", icon: "fa-train-subway", name: "Stations de métro", desc: "Stations des lignes A, B, C, D et funiculaires",
        subgroup: "🚇 Métro & funiculaire",
        type: "wfs", url: wfsUrl("rdata", "tcl_sytral.tclarret", true),
        geom: "point", color: "#e2001a",
        filter: (props) => /(^|,)([ABCD]):/.test(props.desserte || "") || /(^|,)F[12]:/.test(props.desserte || ""),
        dedupeField: "nom", radius: 7, stationColorFn: stationLineColor,
        popup: { title: "nom", rows: [["Lignes", "desserte_merged"], ["Accessible PMR", "pmr"], ["Ascenseur", "ascenseur"]] },
        source: "SYTRAL / data.grandlyon.com"
      },
      {
        id: "metro-vehicles", name: "Métro (positions théoriques)", desc: "Position estimée des rames, calculée d'après les fréquences théoriques",
        subgroup: "🚇 Métro & funiculaire",
        type: "vehicles", wfsUrl: wfsUrl("rdata", "tcl_sytral.tcllignemf_2_0_0"),
        geom: "point", color: "#E8308A",
        source: "Positions théoriques (horaires TCL / SYTRAL)"
      },
      {
        id: "tram", name: "Tramway", desc: "Tracé des lignes de tramway (TCL)",
        subgroup: "🚊 Tramway",
        type: "wfs", url: wfsUrl("rdata", "tcl_sytral.tcllignetram_2_0_0"),
        geom: "line", color: "#7b2982", lineColorField: "couleur_hex", weight: 3,
        popup: { title: "ligne", rows: [["Trajet", "nom_trace"]] },
        source: "SYTRAL / data.grandlyon.com"
      },
      {
        id: "stations-tram", icon: "fa-train-tram", name: "Stations de tramway", desc: "Stations des lignes de tramway (T1–T7)",
        subgroup: "🚊 Tramway",
        type: "wfs", url: wfsUrl("rdata", "tcl_sytral.tclarret", true),
        geom: "point", color: "#7b2982",
        filter: (props) => /(^|,)T[1-7]:/.test(props.desserte || ""),
        dedupeField: "nom", radius: 6, stationColorFn: stationLineColor,
        popup: { title: "nom", rows: [["Lignes", "desserte_merged"], ["Accessible PMR", "pmr"]] },
        source: "SYTRAL / data.grandlyon.com"
      },
      {
        id: "tram-vehicles", name: "Tramway (positions théoriques)", desc: "Position estimée des trams, calculée d'après les fréquences théoriques",
        subgroup: "🚊 Tramway",
        type: "vehicles", wfsUrl: wfsUrl("rdata", "tcl_sytral.tcllignetram_2_0_0"),
        geom: "point", color: "#8C368C",
        source: "Positions théoriques (horaires TCL / SYTRAL)"
      },
      {
        id: "bus", name: "Lignes de bus", desc: "Tracé des lignes de bus TCL (régulières, express, nuit)",
        subgroup: "🚌 Bus",
        type: "wfs", url: wfsUrl("rdata", "tcl_sytral.tcllignebus_2_0_0", true),
        geom: "line", color: "#5B93F2", lineColorField: "couleur_hex", weight: 2,
        popup: { title: "ligne", rows: [["Trajet", "nom_trace"], ["Type", "nom_type_ligne"], ["Sens", "sens"]] },
        source: "SYTRAL / data.grandlyon.com"
      },
      {
        id: "arrets", icon: "fa-bus", name: "Arrêts bus, tram et métro", desc: "Tous les points d'arrêt TCL dans Lyon",
        subgroup: "🚌 Bus",
        type: "wfs", url: wfsUrl("rdata", "tcl_sytral.tclarret", true),
        geom: "point", color: "#60a5fa", cluster: true,
        popup: { title: "nom", rows: [["Lignes", "desserte"], ["Accessible PMR", "pmr"]] },
        source: "SYTRAL / data.grandlyon.com"
      },
      {
        id: "voies-ferrees", name: "Lignes ferroviaires SNCF", desc: "Tracé des voies ferrées du réseau ferré national (hors tramway)",
        subgroup: "🚆 Train",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:fpc_fond_plan_communaut.fpcvoieferree", true),
        geom: "line", color: "#64748b", weight: 2,
        filter: (props) => /^VOIFER/.test(props.typevoie || ""),
        source: "Métropole de Lyon"
      },
      {
        id: "gares-sncf", icon: "fa-train", name: "Gares SNCF", desc: "Gares et haltes ferroviaires",
        subgroup: "🚆 Train",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:adr_voie_lieu.adrgareferpct", true),
        geom: "point", color: "#334155",
        popup: { title: "nom", rows: [["Type", "soustheme"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "velov", icon: "fa-bicycle", name: "Stations Vélo'v (temps réel)", desc: "Vélos et places disponibles, mis à jour en continu",
        subgroup: "🚲 Vélo",
        type: "velov",
        color: "#d32f2f", cluster: true,
        source: "JCDecaux / data.grandlyon.com"
      },
      {
        id: "cyclable", name: "Aménagements cyclables", desc: "Pistes et bandes cyclables",
        subgroup: "🚲 Vélo",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:pvo_patrimoine_voirie.pvoamenagementcyclable", true),
        geom: "line", color: "#4ade80", weight: 2,
        popup: { title: "nom", rows: [["Type", "typeamenagement"], ["Réseau", "reseau"], ["Sens", "senscirculation"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "velo-reparation", icon: "fa-wrench", name: "Stations de réparation vélo", desc: "Pompes à vélo en libre-service",
        subgroup: "🚲 Vélo",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:pvo_patrimoine_voirie.pvostationvelovpompe", true),
        geom: "point", color: "#0891b2", cluster: true,
        popup: { title: "nom", rows: [["Adresse", "adresse"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "velo-magasins", icon: "fa-shop", name: "Magasins de vélo", desc: "Vente et réparation de vélos (commerces)",
        subgroup: "🚲 Vélo",
        type: "overpass", osmFilter: '["shop"="bicycle"]',
        color: "#db2777", cluster: true,
        source: "OpenStreetMap"
      },
      {
        id: "autopartage", icon: "fa-car-side", name: "Stations d'autopartage", desc: "Voitures en libre-service (Citiz…)",
        subgroup: "🚗 Voiture",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:pvo_patrimoine_voirie.pvostationautopartage", true),
        geom: "point", color: "#c084fc",
        popup: { title: "nom", rows: [["Adresse", "adresse"], ["Réseau", "typeautopartage"], ["Emplacements", "nbemplacements"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "irve", icon: "fa-charging-station", name: "Bornes de recharge électrique", desc: "Bornes publiques pour véhicules électriques",
        subgroup: "🚗 Voiture",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:nrj_energie.irve", true),
        geom: "point", color: "#22d3ee", cluster: true,
        popup: { title: "nom_enseigne", rows: [["Station", "nom_station"], ["Adresse", "adresse_station"], ["Opérateur", "nom_operateur"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "stations-service", icon: "fa-gas-pump", name: "Stations-service", desc: "Stations-service et points de carburant",
        subgroup: "🚗 Voiture",
        type: "overpass", osmFilter: '["amenity"="fuel"]', bbox: true,
        color: "#f97316", cluster: true,
        source: "OpenStreetMap"
      }
    ]
  },
  {
    id: "espaces-verts",
    label: "Espaces verts & eau",
    emoji: "🌳",
    layers: [
      {
        id: "parcs", name: "Parcs et jardins", desc: "Espaces verts publics de la ville",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:com_donnees_communales.comparcjardin_1_0_0", true),
        geom: "polygon", color: "#34d399", fillOpacity: 0.45,
        popup: { title: "nom", rows: [["Commune", "commune"], ["Surface", "surf_tot_m2", v => v ? (v/10000).toFixed(1) + " ha" : null], ["Horaires", "precision_horaires"]] },
        source: "Ville de Lyon / data.grandlyon.com"
      },
      {
        id: "arbres", name: "Arbres d'alignement", desc: "Arbres recensés par la Métropole (≈ 10 000 dans Lyon)",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:abr_arbres_alignement.abrarbre", true),
        geom: "point", color: "#16a34a", radius: 0.1, minZoom: 17,
        popup: { title: "essencefrancais", rows: [["Essence", "essence"], ["Commune", "commune"], ["Hauteur", "hauteurtotale_m", v => v ? v + " m" : null], ["Circonférence", "circonference_cm", v => v ? v + " cm" : null], ["Planté en", "anneeplantation"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "plans-eau", name: "Plans d'eau", desc: "Surfaces d'eau (lacs, étangs, bras morts)",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:fpc_fond_plan_communaut.fpcplandeau", true),
        geom: "polygon", color: "#60a5fa", fillOpacity: 0.5,
        popup: { title: "gid", rows: [["Identifiant", "gid"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "cours-eau", name: "Cours d'eau", desc: "Fleuves, rivières et ruisseaux (Rhône, Saône…)",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:adr_voie_lieu.adrlieulin", true),
        geom: "line", color: "#3b82f6", weight: 2,
        filter: (props) => props.theme === "HYDROGRAPHIE" && props.soustheme === "Cours d'eau",
        popup: { title: "nom", rows: [["Nature", "soustheme"], ["Taille", "taille"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "fontaines", icon: "fa-droplet", name: "Fontaines d'eau potable", desc: "Bornes-fontaines et points d'eau potable accessibles au public",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:adr_voie_lieu.adrbornefontaine_latest", true),
        geom: "point", color: "#0ea5e9", cluster: true,
        popup: { title: "identifiant", rows: [["Année de pose", "anneepose"], ["Commune", "commune"]] },
        source: "Métropole de Lyon / Eau du Grand Lyon"
      }
    ]
  },
  {
    id: "education",
    label: "Éducation & petite enfance",
    emoji: "🎓",
    layers: [
      {
        id: "ecoles", icon: "fa-school", name: "Écoles", desc: "Écoles maternelles et élémentaires",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:edu_education.ecole", true),
        geom: "point", color: "#facc15", cluster: true,
        popup: { title: "nom", rows: [["Type", "nature"], ["Statut", "statut_public_prive"], ["Adresse", "adresse"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "colleges", icon: "fa-graduation-cap", name: "Collèges", desc: "Collèges publics et privés",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:edu_education.college", true),
        geom: "point", color: "#fb923c",
        popup: { title: "nom", rows: [["Statut", "statut_public_prive"], ["Adresse", "adresse"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "lycees", icon: "fa-user-graduate", name: "Lycées", desc: "Lycées publics et privés",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:edu_education.lycee", true),
        geom: "point", color: "#f87171",
        popup: { title: "nom", rows: [["Statut", "statut_public_prive"], ["Adresse", "adresse"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "creches", icon: "fa-baby-carriage", name: "Crèches", desc: "Établissements d'accueil du jeune enfant",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:car_care.carcreche_latest", true),
        geom: "point", color: "#f472b6", cluster: true,
        popup: { title: "nom", rows: [["Adresse", "adresse"], ["Capacité", "capacite", v => v ? v + " places" : null], ["Gestionnaire", "gestionnaire"]] },
        source: "Métropole de Lyon"
      }
    ]
  },
  {
    id: "sante",
    label: "Santé",
    emoji: "🏥",
    layers: [
      {
        id: "hopitaux", icon: "fa-hospital", name: "Hôpitaux & cliniques", desc: "Établissements hospitaliers",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:adr_voie_lieu.adrhopitalpct", true),
        geom: "point", color: "#f87171",
        popup: { title: "nom", rows: [["Type", "soustheme"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "pharmacies", icon: "fa-mortar-pestle", name: "Pharmacies", desc: "Officines de pharmacie",
        type: "overpass", osmFilter: '["amenity"="pharmacy"]',
        color: "#4ade80", cluster: true,
        source: "OpenStreetMap"
      },
      {
        id: "defib", icon: "fa-heart-pulse", name: "Défibrillateurs", desc: "Défibrillateurs accessibles au public",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:car_care.cardefibrillateur_latest", true),
        geom: "point", color: "#EF3340", cluster: true,
        popup: { title: "nom", rows: [["Adresse", "address", v => v && [v.streetAddress, v.addressLocality].filter(Boolean).join(", ")], ["Accès libre", "acceslibre"], ["Disponibilité", "dispohoraires"]] },
        source: "Métropole de Lyon"
      }
    ]
  },
  {
    id: "securite",
    label: "Sécurité & secours",
    emoji: "🛡️",
    layers: [
      {
        id: "delinquance", name: "Délinquance par arrondissement",
        desc: "Taux pour 1 000 habitants, par type de faits (police & gendarmerie, 2025)",
        type: "delinquance-choropleth", geom: "ramp", color: "#a78bfa",
        source: "SSMSI (min. Intérieur) / data.gouv.fr"
      },
      {
        id: "police", icon: "fa-shield-halved", name: "Commissariats & police", desc: "Postes de police nationale et municipale",
        type: "overpass", osmFilter: '["amenity"="police"]',
        color: "#818cf8",
        source: "OpenStreetMap"
      },
      {
        id: "pompiers", icon: "fa-fire-extinguisher", name: "Casernes de pompiers", desc: "Centres d'incendie et de secours",
        type: "overpass", osmFilter: '["amenity"="fire_station"]',
        color: "#fb923c",
        source: "OpenStreetMap"
      }
    ]
  },
  {
    id: "immobilier",
    label: "Immobilier",
    emoji: "🏠",
    layers: [
      {
        id: "dvf", name: "Prix des appartements par arrondissement", desc: "Prix médian au m² des ventes 2024 (source notariale DVF)",
        type: "dvf-choropleth", geom: "ramp",
        color: "#fd8d3c",
        source: "DVF / data.gouv.fr (DGFiP)"
      },
      {
        id: "dvf-points", icon: "fa-building", name: "Ventes 2024 (détail)", desc: "Chaque vente d'appartement géolocalisée, avec prix",
        type: "dvf-points",
        color: "#f59e0b", cluster: true,
        source: "DVF / data.gouv.fr (DGFiP)"
      }
    ]
  },
  {
    id: "environnement",
    label: "Environnement",
    emoji: "🌍",
    layers: [
      {
        id: "air-indice", icon: "fa-wind", name: "Indice ATMO du jour",
        desc: "Qualité de l'air prévue aujourd'hui par commune (NO₂, O₃, PM10, PM2.5, SO₂)",
        type: "wfs", url: airIndiceUrl(),
        geom: "point", color: "#50CCAA", radius: 8,
        filter: (p) => p.date_ech === AIR_TODAY,
        stationColorFn: (p, fallback) => p.coul_qual || fallback,
        legend: "atmo",
        popup: {
          title: "lib_zone",
          rows: [
            ["Qualité de l'air", "lib_qual"],
            ["Dioxyde d'azote (NO₂)", "code_no2", atmoSubLabel],
            ["Ozone (O₃)", "code_o3", atmoSubLabel],
            ["Particules PM10", "code_pm10", atmoSubLabel],
            ["Particules fines PM2.5", "code_pm25", atmoSubLabel],
            ["Dioxyde de soufre (SO₂)", "code_so2", atmoSubLabel],
            ["Échéance", "date_ech"]
          ]
        },
        source: "Atmo France / Atmo Auvergne-Rhône-Alpes"
      },
      {
        id: "eau-potable", name: "Contrôle de l'eau potable",
        desc: "Conformité du contrôle sanitaire (ARS) par commune · 6 derniers mois",
        type: "eau-potable-choropleth", geom: "ramp", color: "#41ab5d",
        source: "Ministère de la Santé / ARS via Hub'Eau"
      }
    ]
  },
  {
    id: "loisirs",
    label: "Culture, sport & vie locale",
    emoji: "🎭",
    layers: [
      {
        id: "fete-musique", icon: "fa-music", name: "Fête de la musique 2026",
        desc: "Concerts et animations du 21 juin 2026 à Lyon (programmation OpenAgenda)",
        type: "openagenda", url: feteMusiqueUrl(),
        geom: "point", color: "#d946ef",
        popup: {
          title: "titre",
          rows: [
            ["Quand", "horaire"],
            ["Lieu", "lieu"],
            ["Adresse", "adresse"],
            ["À propos", "description", v => v ? (v.length > 180 ? v.slice(0, 177) + "…" : v) : null]
          ]
        },
        source: "OpenAgenda / Ministère de la Culture via OpenDataSoft"
      },
      {
        id: "piscines", icon: "fa-person-swimming", name: "Piscines", desc: "Piscines et centres nautiques publics",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:adr_voie_lieu.adrequippiscinepct", true),
        geom: "point", color: "#38bdf8",
        popup: { title: "nom", rows: [["Adresse", "adresse"], ["Téléphone", "telephone"], ["Horaires", "horaires"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "musees", icon: "fa-landmark", name: "Musées", desc: "Musées et lieux d'exposition",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:adr_voie_lieu.adrmusee", true),
        geom: "auto", color: "#e879f9",
        popup: { title: "nom", rows: [["Adresse", "adresse"], ["Horaires", "horaires"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "marches", icon: "fa-store", name: "Marchés", desc: "Marchés alimentaires et forains, avec jours de tenue",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:eco_economie.ecomarcheinstance_latest", true),
        geom: "point", color: "#fb923c",
        popup: { title: "adresse", rows: [["Jour", "jourtenue"], ["Type", "type"], ["Commune", "commune"]] },
        source: "Métropole de Lyon"
      },
      {
        id: "toilettes", icon: "fa-restroom", name: "Toilettes publiques", desc: "Sanitaires accessibles au public",
        type: "wfs", url: wfsUrl("grandlyon", "metropole-de-lyon:adr_voie_lieu.adrtoilettepublique_latest", true),
        geom: "point", color: "#94a3b8", cluster: true,
        popup: { title: "adresse", rows: [["Précision", "infoloc"]] },
        source: "Métropole de Lyon"
      }
    ]
  }
];

// ============================================================
//  PRÉSÉLECTIONS THÉMATIQUES — totalement découplées du catalogue.
//  Une présélection est un usage (« Canicule », « Se déplacer »…) qui
//  active un ensemble de couches piochées dans n'importe quelle
//  catégorie du catalogue, désignées par leur `id`. Une même couche
//  peut être convoquée par plusieurs présélections (ex. « parcs »).
// ============================================================
const PRESELECTIONS = [
  {
    id: "canicule",
    label: "Canicule",
    emoji: "🌡️",
    hint: "Parcs, cours d'eau, plans d'eau, fontaines d'eau potable, piscines et musées (lieux frais) pour se rafraîchir.",
    layers: ["parcs", "plans-eau", "cours-eau", "fontaines", "piscines", "musees"]
  },
  {
    id: "fete-musique-2026",
    label: "Fête de la musique 2026",
    emoji: "🎶",
    hint: "Programmation de la Fête de la musique du 21 juin 2026 à Lyon (source OpenAgenda).",
    layers: ["fete-musique"]
  },
  {
    id: "transports-commun",
    label: "Transports en commun",
    emoji: "🚇",
    hint: "Métro, funiculaire, tramway, positions théoriques des rames et lignes de bus TCL.",
    layers: ["metro", "stations-metro", "metro-vehicles", "tram", "stations-tram", "tram-vehicles", "bus"]
  },
  {
    id: "logement",
    label: "Logement",
    emoji: "🏠",
    hint: "Prix de l'immobilier issus des ventes réelles enregistrées par l'État (DVF 2024).",
    layers: ["dvf"]
  },
  {
    id: "education",
    label: "Éducation & famille",
    emoji: "🎓",
    hint: "Écoles, collèges et lycées.",
    layers: ["ecoles", "colleges", "lycees"]
  },
  {
    id: "securite",
    label: "Sécurité & santé",
    emoji: "🛡️",
    hint: "Délinquance, commissariats, pompiers et hôpitaux.",
    layers: ["delinquance", "police", "pompiers", "hopitaux"]
  },
  {
    id: "qualite",
    label: "Qualité de vie",
    emoji: "🌳",
    hint: "Parcs, marchés et piscines.",
    layers: ["parcs", "marches", "piscines"]
  },
  {
    id: "qualite-environnementale",
    label: "Qualité environnementale",
    emoji: "🌍",
    hint: "Qualité de l'air (indice ATMO) et contrôle sanitaire de l'eau potable, commune par commune.",
    layers: ["air-indice", "eau-potable"]
  }
];
