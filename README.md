# Lyon Data

Plateforme d'exploration des données ouvertes de la ville de Lyon, pensée pour des
utilisateurs **non techniques** : on choisit une présélection thématique ou on
compose soi-même son catalogue de couches, la carte affiche les données
correspondantes et le panneau latéral fournit une synthèse chiffrée (KPIs,
graphiques, fiche de détail du point ou de la zone sélectionnée).

Interface « plateforme analytique » (Inter + JetBrains Mono), avec fond de carte
sombre/clair commutable, cartes KPI, barre d'état cartographique et légende
dynamique. Le design system et la vision produit sont documentés dans
[PRD.md](PRD.md).

## Concept en trois niveaux

1. **Présélections thématiques** — boutons rapides qui activent un ensemble de
couches piochées dans le catalogue (plusieurs présélections peuvent être
combinées).
2. **Catalogue de données** — toutes les couches classées par nature, avec
recherche, sous-rubriques et case maîtresse pour activer/désactiver plusieurs
couches d'un coup.
3. **Synthèse** — KPIs calculés côté client, graphiques en barres CSS, fiche du
POI cliqué, détail d'une zone d'analyse sélectionnée et graphique d'évolution
de la délinquance par arrondissement.

## Présélections thématiques

| Présélection | Couches activées |
|---|---|
| 🌡️ **Canicule** | parcs, plans d'eau, cours d'eau, fontaines d'eau potable, piscines, musées |
| 🎶 **Fête de la musique 2026** | programmation OpenAgenda du 21 juin 2026 |
| 🚇 **Transports en commun** | métro & funiculaire, stations, tramway, positions théoriques, lignes de bus |
| 🏠 **Logement** | prix médian au m² des appartements (DVF 2024) |
| 🎓 **Éducation & famille** | écoles, collèges, lycées |
| 🛡️ **Sécurité** | délinquance par arrondissement, commissariats de police |
| 🏥 **Santé** | hôpitaux, pharmacies, défibrillateurs, casernes de pompiers |
| 🌳 **Qualité de vie** | parcs, plans d'eau, marchés |
| 🚲 **Vélo** | stations Vélo'v temps réel, aménagements cyclables |
| 🌍 **Qualité environnementale** | indice ATMO du jour, contrôle sanitaire de l'eau potable |

## Catalogue de données

| Catégorie | Exemples de couches |
|---|---|
| 🚇 Transports & mobilité | Lignes de métro/funiculaire et tramway, stations, bus, arrêts TCL, stations Vélo'v **en temps réel**, aménagements cyclables, autopartage, bornes de recharge, positions théoriques des rames |
| 🌳 Espaces verts & eau | Parcs et jardins, arbres d'alignement, plans d'eau, cours d'eau, fontaines d'eau potable |
| 🎓 Éducation & petite enfance | Écoles, collèges, lycées, crèches |
| 🏥 Santé | Hôpitaux, pharmacies, défibrillateurs |
| 🛡️ Sécurité & secours | Délinquance par arrondissement (taux pour 1 000 hab.), commissariats, casernes de pompiers |
| 🏠 Immobilier | Prix médian au m² des appartements par arrondissement (DVF 2024) + détail de chaque vente |
| 🌍 Environnement | Indice ATMO du jour par commune, conformité du contrôle sanitaire de l'eau potable |
| 🎭 Culture, sport & vie locale | Fête de la musique, piscines, musées, marchés, toilettes publiques |

## Lancer l'application

C'est un site statique, sans installation ni compilation :

Ouvrir `index.html` dans un navigateur (double-clic), ou servir le dossier :

```bash
cd lyon-dataviz
python3 -m http.server 8000   # puis http://localhost:8000
```

N'importe quel hébergement statique convient (GitHub Pages, Netlify…).

## Architecture / Fichiers clés

```
index.html              Structure de la page (barre de présélections, catalogue, carte, synthèse)
css/style.css         Habillage sombre/clair, KPIs, graphiques, animation des véhicules
js/config.js          Catalogue de données, présélections thématiques, URLs et palettes
js/app.js             Carte Leaflet, chargement des couches, analyse par zone, synthèse, légende
js/vehicles.js        Positions théoriques animées des métros et trams TCL
scripts/build_dvf.py         Préparation annuelle des données DVF
data/dvf-2024.js             Ventes immobilières pré-filtrées (window.DVF_DATA)
scripts/build_delinquance.py Préparation annuelle des données SSMSI
data/delinquance.js          Statistiques de délinquance par arrondissement et par année (window.DELINQUANCE_DATA)
data/tcl-schedule.js         Fréquences théoriques TCL pour l'animation des véhicules
```

Bibliothèques : [Leaflet](https://leafletjs.com) + Leaflet.markercluster (via CDN). Aucun build.

## Sources de données

Toutes les couches sont chargées **en direct** depuis les services ouverts,
sauf les données embarquées (DVF et délinquance) qui sont pré-compilées :

- **[data.grandlyon.com](https://data.grandlyon.com)** (Métropole de Lyon, Ville de Lyon, SYTRAL) —
  flux WFS GeoJSON : transports TCL, parcs, équipements, éducation, communes, arrondissements…
- **Vélo'v / JCDecaux** — disponibilité des stations en temps réel.
- **[data.gouv.fr](https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/)** —
  Demandes de valeurs foncières (DVF) géolocalisées, DGFiP/Etalab.
- **[OpenStreetMap](https://www.openstreetmap.org)** via l'API Overpass —
  commissariats, casernes de pompiers, pharmacies.
- **[Atmo France](https://www.atmo-france.org)** (flux WFS national agrégeant les
  AASQA, ici Atmo Auvergne-Rhône-Alpes) — indice ATMO quotidien de la qualité de
  l'air par commune, sous licence ODbL.
- **[Hub'Eau](https://hubeau.eaufrance.fr)** (API du Système d'information sur
  l'eau) — résultats du contrôle sanitaire de l'eau potable (ARS / Ministère de
  la Santé), agrégés par commune.
- **SSMSI (ministère de l'Intérieur)** — base statistique communale de la délinquance
  enregistrée, diffusée sur [data.gouv.fr](https://www.data.gouv.fr/datasets/bases-statistiques-communale-departementale-et-regionale-de-la-delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/).
- **OpenAgenda / Ministère de la Culture** — programmation de la Fête de la musique,
  via le dataset keyless « Évènements publics OpenAgenda » d'[OpenDataSoft](https://public.opendatasoft.com/explore/dataset/evenements-publics-openagenda/).
- **Fond de carte** : tuiles CARTO (sombre/clair), données © contributeurs OpenStreetMap.

## Mise à jour annuelle des données embarquées

Deux jeux de données sont pré-compilés car leurs serveurs d'origine ne
permettent pas un appel direct depuis un navigateur (CORS ou volume) :

### Prix immobiliers (DVF)

```bash
python3 scripts/build_dvf.py
```

Le script télécharge les ventes 2024 des 9 arrondissements de Lyon, ne conserve
que les ventes d'appartements aux valeurs plausibles, et écrit
`data/dvf-2024.js` (`window.DVF_DATA`). À relancer à chaque nouveau millésime
DVF (publication annuelle), puis adapter le nom du fichier dans `index.html` si
l'année change.

### Délinquance (SSMSI)

```bash
python3 scripts/build_delinquance.py
```

Le script télécharge la base communale SSMSI (~38 Mo compressé), filtre les 9
arrondissements de Lyon sur toutes les années disponibles et écrit
`data/delinquance.js` (`window.DELINQUANCE_DATA`). Le fichier contient l'historique
2016‑2025 ; la dernière année reste celle affichée par défaut sur la carte et dans
les KPI. Lorsqu'un arrondissement est sélectionné dans l'analyse par zone, un
graphique d'évolution du taux pour l'indicateur courant s'affiche dans la synthèse.
À relancer à chaque nouveau millésime.

## Ajouter une couche

Le point d'extension unique est `js/config.js` : ajouter un objet dans le
`CATALOG` (et éventuellement le référencer dans une ou plusieurs
`PRESELECTIONS`). Les types supportés sont :

- `wfs` : flux GeoJSON data.grandlyon.com (points, lignes, polygones).
- `overpass` : requête Overpass API (OpenStreetMap).
- `velov` : API temps réel JCDecaux.
- `openagenda` : API OpenDataSoft / OpenAgenda.
- `vehicles` : animation de positions théoriques TCL (nécessite `data/tcl-schedule.js`).
- `dvf-choropleth` / `dvf-points` : données embarquées DVF.
- `delinquance-choropleth` : données embarquées SSMSI.
- `eau-potable-choropleth` : contours communaux + API Hub'Eau.

## Notes techniques

- Le thème clair/sombre est persistant dans `localStorage` et bascule aussi le
  fond de carte CARTO.
- L'analyse par zone fonctionne sur les couches de points ; les lignes et
  polygones ne sont pas comptabilisés dans les zones.
- Le compteur de visites est masqué en interface mais reste actif en arrière-plan.
