# Lyon Analytics

Plateforme d'exploration des données ouvertes de la ville de Lyon, pensée pour
des utilisateurs **non techniques** : on choisit un thème, la carte affiche les
informations correspondantes avec une synthèse chiffrée (KPIs, graphique).

Interface sombre type « plateforme analytique » : Inter + JetBrains Mono,
cartes KPI, barre d'état cartographique, fond de carte sombre/clair commutable.
Le design system est documenté dans [PRD.md](PRD.md).

## Thèmes proposés

| Thème | Exemples de couches |
|---|---|
| 🚇 Transports | Lignes de métro/funiculaire et tramway, stations Vélo'v **en temps réel**, arrêts TCL, pistes cyclables, autopartage, bornes de recharge |
| 🌳 Qualité de vie | Parcs et jardins, marchés, piscines, musées, toilettes publiques |
| 🛡️ Sécurité & santé | Commissariats, casernes de pompiers, hôpitaux, défibrillateurs, pharmacies |
| 🏠 Logement | Prix médian au m² des appartements par arrondissement (ventes DVF 2024) + détail de chaque vente |
| 🎓 Éducation & famille | Écoles, collèges, lycées, crèches |

## Lancer l'application

C'est un site statique, sans installation ni compilation :

Ouvrir `index.html` dans un navigateur (double-clic), ou servir le dossier :

```bash
cd lyon-dataviz
python3 -m http.server 8000   # puis http://localhost:8000
```

N'importe quel hébergement statique convient (GitHub Pages, Netlify…).

## Sources de données

Toutes les couches sont chargées **en direct** depuis les services ouverts,
sauf les prix immobiliers (pré-compilés, voir ci-dessous) :

- **[data.grandlyon.com](https://data.grandlyon.com)** (Métropole de Lyon, Ville de Lyon, SYTRAL) —
  flux WFS GeoJSON : transports TCL, parcs, marchés, équipements, écoles…
- **Vélo'v / JCDecaux** — disponibilité des vélos en temps réel.
- **[data.gouv.fr](https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/)** —
  Demandes de valeurs foncières (DVF) géolocalisées, DGFiP/Etalab.
- **[OpenStreetMap](https://www.openstreetmap.org)** via l'API Overpass —
  commissariats, casernes de pompiers, pharmacies.
- **Fond de carte** : tuiles CARTO Positron, données © contributeurs OpenStreetMap.

## Mise à jour annuelle des prix immobiliers

Le serveur `files.data.gouv.fr` n'autorise pas les requêtes navigateur (CORS) :
les ventes sont donc pré-filtrées dans `data/dvf-2024.js` (chargé par une
balise `<script>`, ce qui fonctionne aussi sans serveur local) par :

```bash
python3 scripts/build_dvf.py
```

Le script télécharge les ventes des 9 arrondissements, ne conserve que les
ventes d'appartements aux valeurs plausibles, et écrit un fichier JS compact
définissant `window.DVF_DATA`. À relancer à chaque nouveau millésime DVF
(publication annuelle), puis adapter le nom du fichier dans `index.html`.

## Architecture

```
index.html        Structure de la page (panneau thèmes + carte)
css/style.css     Habillage
js/config.js      Déclaration des thèmes et des couches (URLs, couleurs, infobulles)
js/app.js         Carte Leaflet, chargement des couches, légende, popups
scripts/build_dvf.py   Préparation annuelle des données DVF
data/dvf-2024.js       Ventes immobilières pré-filtrées (window.DVF_DATA)
```

Ajouter une couche = ajouter un objet dans `THEMES` (`js/config.js`) : aucune
autre modification n'est nécessaire pour les flux WFS du Grand Lyon ou les
requêtes Overpass.

Bibliothèques : [Leaflet](https://leafletjs.com) + Leaflet.markercluster (via CDN).
