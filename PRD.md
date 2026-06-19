# PRD — Lyon Data

| | |
|---|---|
| **Produit** | Lyon Data — plateforme d'exploration des données ouvertes de la ville de Lyon |
| **Version du document** | 1.2 |
| **Date** | 19 juin 2026 |
| **Statut** | V1.2 livrée (catalogue de données + présélections + analyse par zone) |

---

## 1. Vision et problème

Les données ouvertes sur Lyon sont abondantes (Métropole de Lyon, Ville de Lyon,
État, OpenStreetMap) mais **dispersées sur plusieurs portails et présentées dans
des formats techniques** (WFS, GeoJSON, CSV) inaccessibles au grand public.

**Lyon Data** rassemble ces données sur une carte unique et les rend
explorables par **des personnes sans aucune compétence technique**. L'utilisateur
choisit une présélection thématique ou compose son propre catalogue de couches ;
la carte affiche les informations correspondantes, accompagnées d'une synthèse
chiffrée (indicateurs, graphiques, fiche de détail du point ou de la zone
sélectionnée).

Le produit assume une **esthétique professionnelle de plateforme analytique**
(type outil de BI / data science) : il doit inspirer la même confiance qu'un
tableau de bord d'entreprise, tout en restant utilisable par le grand public.

> *« Où sont les écoles et les parcs autour de chez moi ? Combien coûte un
> appartement dans cet arrondissement ? Y a-t-il un Vélo'v disponible ? Quelle est
> la qualité de l'air aujourd'hui ? »*

## 2. Utilisateurs cibles

| Persona | Besoin principal |
|---|---|
| **Habitant·e / futur·e habitant·e** | Évaluer un quartier : prix, écoles, transports, espaces verts |
| **Parent** | Localiser écoles, crèches, piscines, parcs |
| **Citoyen·ne curieux·se** | Explorer sa ville à travers les données publiques |
| **Journaliste / association locale** | Illustrer un sujet (logement, mobilité, sécurité) avec des données sourcées |
| **Agent public / élu·e local·e** | Visualiser rapidement l'offre d'équipements ou les indicateurs d'un secteur |

**Anti-persona** : le géomaticien expert — il dispose déjà des portails
data.grandlyon.com et data.gouv.fr. L'outil ne cherche pas à remplacer un SIG.

## 3. Principes produit

1. **Zéro jargon** : libellés en français courant (« Prix médian au m² », pas « DVF agrégé »).
2. **Présélections découplées du catalogue** : les boutons thématiques activent des
couches piochées n'importe où dans le catalogue ; une même couche peut appartenir
à plusieurs présélections. Le catalogue reste l'unique source de vérité.
3. **Toujours sourcé** : chaque infobulle, fiche détaillée et la fenêtre « Sources » citent l'origine de la donnée.
4. **Données vivantes** : les couches sont chargées en direct depuis les services ouverts (sauf exception documentée), jamais de copie qui périme silencieusement.
5. **Simplicité technique** : site statique, sans compte, sans backend, sans build — hébergeable n'importe où, maintenable par une seule personne.
6. **Crédibilité visuelle** : design sobre et analytique (thème sombre/clair, chiffres en police monospace, indicateurs synthétiques) — l'outil doit ressembler à un produit data professionnel, pas à une page de démonstration.

## 4. Périmètre fonctionnel — V1.2 (livrée)

### 4.1 Carte
- Fond de carte **sombre** par défaut (CARTO Dark Matter), bascule vers un fond
  clair (Positron) en un clic. Le choix est persistant dans `localStorage`.
- Centrage initial sur Lyon, zoom libre (min. 12), légende dynamique, infobulles au clic.
- Regroupement automatique des points denses (clustering) sur les couches configurées.
- **Barre d'état cartographique** : coordonnées du curseur, niveau de zoom, total d'objets affichés ; échelle métrique Leaflet.
- Badge « Données en direct » dans l'en-tête.

### 4.2 Présélections thématiques

Barre de boutons en haut de page. Chaque présélection active un ensemble de
couches (union si plusieurs sont choisies). Une couche partagée par plusieurs
présélections reste active tant qu'au moins une la réclame.

| Présélection | Couches activées |
|---|---|
| 🌡️ Canicule | Parcs, plans d'eau, cours d'eau, fontaines, piscines, musées |
| 🎶 Fête de la musique 2026 | Programmation OpenAgenda |
| 🚇 Transports | Métro & funiculaire, stations, tramway, Vélo'v temps réel |
| 🏠 Logement | Prix médian DVF par arrondissement |
| 🎓 Éducation & famille | Écoles, collèges, lycées |
| 🛡️ Sécurité & santé | Délinquance, commissariats, pompiers, hôpitaux |
| 🌳 Qualité de vie | Parcs, marchés, piscines |
| 🌍 Qualité environnementale | Indice ATMO, eau potable |

La présélection **Canicule** est active par défaut au démarrage.

### 4.3 Catalogue de données

Panneau latéral affichant l'ensemble des couches classées par **nature des
données** (Transports, Espaces verts, Éducation, Santé, Sécurité, Immobilier,
Environnement, Culture/sport/vie locale).

Fonctionnalités :
- Recherche textuelle dans les noms de couches.
- Sous-rubriques (ex. Métro & funiculaire, Tramway, Bus) avec case maîtresse
  « tout activer / désactiver ».
- Compteur d'objets chargés affiché à côté du nom de chaque couche.
- Cases à cocher indépendantes des présélections : l'utilisateur peut ajouter
  ou retirer une couche à tout moment.

### 4.4 Analyse par zone

Option « Agréger les données par zone » dans le panneau latéral.

- **Niveaux disponibles** : arrondissements (9) ou quartiers Ville de Lyon (36).
- Comptage spatial des objets affichés (points uniquement) dans chaque zone.
- Étiquettes de comptage superposées sur la carte.
- Clic sur une zone : affichage du détail dans le panneau Synthèse (nombre
d'objets par couche active + indicateurs propres aux arrondissements : prix
médian DVF, taux de délinquance).
- Déselection possible via le bouton ✕ ou un second clic sur la zone.

### 4.5 Panneau « Synthèse »

Panneau latéral droit qui s'ouvre dès qu'au moins une couche est active ou qu'un
POI/une zone est sélectionné.

Contenus possibles :
- **Fiche du POI sélectionné** : template adapté au type de donnée (WFS générique,
  Vélo'v, évènement OpenAgenda, Overpass, véhicule TCL, vente DVF,
  choroplèthe DVF, délinquance, eau potable, ATMO).
- **Focus zone** : nom de la zone + répartition des objets par couche active +
  indicateurs DVF/délinquance si disponibles.
- **Cartes KPI** : indicateurs mis en avant selon les couches actives :
  - Vélo'v : vélos disponibles et % de stations approvisionnées.
  - DVF : prix médian ville et nombre de ventes analysées.
  - Délinquance : nombre de faits et taux ville pour 1 000 hab.
  - ATMO : qualité de l'air à Lyon + nombre de communes suivies.
  - Eau : taux de prélèvements conformes sur 6 mois.
  - Autres couches : nombre d'objets affichés.
- **Graphiques en barres CSS** : prix médian au m² par arrondissement ; taux de
délinquance par arrondissement pour l'indicateur sélectionné.

### 4.6 Sources de données

| Source | Mode d'accès | Couches |
|---|---|---|
| data.grandlyon.com (Métropole, Ville de Lyon, SYTRAL) | Flux WFS GeoJSON, en direct | Transports, parcs, marchés, équipements, éducation, communes, arrondissements, quartiers… |
| Vélo'v / JCDecaux via data.grandlyon.com | API JSON temps réel | Disponibilité des stations |
| data.gouv.fr — DVF géolocalisées (DGFiP/Etalab) | **Pré-compilées** (`scripts/build_dvf.py`) | Prix immobiliers |
| SSMSI (min. Intérieur) / data.gouv.fr | **Pré-compilées** (`scripts/build_delinquance.py`) | Délinquance par arrondissement |
| OpenStreetMap via API Overpass | Requêtes en direct | Commissariats, pompiers, pharmacies |
| Atmo France / Atmo Auvergne-Rhône-Alpes | Flux WFS national, en direct | Indice ATMO quotidien par commune |
| Hub'Eau (ARS / Min. Santé) | API JSON, en direct | Contrôle sanitaire de l'eau potable par commune |
| OpenAgenda / Ministère de la Culture via OpenDataSoft | API JSON, en direct | Fête de la musique 2026 |
| CARTO / OpenStreetMap | Tuiles | Fond de carte sombre/clair |

### 4.7 Fonctionnalités avancées livrées

- **Positions théoriques des véhicules TCL** : animation fluide (60 fps) des
  métros, funiculaires et trams à partir des fréquences théoriques TCL
  (`data/tcl-schedule.js`) et des géométries de lignes. Les arrêts aux stations
  sont pris en compte via une carte temps→position.
- **Sélecteur d'indicateur de délinquance** : dans le catalogue, la couche
  « Délinquance » offre un menu déroulant pour choisir le type de faits ou
  visualiser l'agrégat de tous les faits.
- **Thème clair/sombre persistant** : bascule du thème UI et du fond de carte
  en un clic, mémorisé dans `localStorage`.

### 4.8 Hors périmètre V1.2
- Pas de compte utilisateur, pas de sauvegarde de configuration côté serveur.
- Pas d'export (image, CSV) ni de partage par URL.
- Pas de géolocalisation utilisateur ni d'isochrones.
- Les positions des véhicules TCL sont théoriques (fréquences + horaires), pas de
  suivi GPS temps réel.

## 5. Exigences non fonctionnelles

| Exigence | Cible |
|---|---|
| **Accessibilité d'usage** | Compréhensible sans notice par un non-technicien ; libellés français ; parcours par présélections ou catalogue |
| **Performance** | Premier affichage < 3 s sur connexion standard ; couches lourdes limitées à l'emprise de Lyon (bbox) et chargées à la demande, puis mises en cache en mémoire |
| **Responsive** | Utilisable sur mobile (panneau repliable au-dessus de la carte) |
| **Robustesse** | Échec d'une source = message clair sur la couche concernée, le reste de l'app fonctionne |
| **Déploiement** | Site 100 % statique (GitHub Pages, Netlify…) ; aucune clé d'API secrète |
| **Licences** | Données sous Licence Ouverte / ODbL ; attribution affichée (fenêtre « Sources » + crédits carte) |

## 6. Design system (V1.2)

| Élément | Choix |
|---|---|
| **Ambiance** | Thème sombre « console analytique » par défaut : fond `#0d1117`, panneaux `#131a22`/`#1a232e`, bordures fines `#232e3b`. Thème clair alternatif. |
| **Couleur d'accent** | Teal `#2dd4bf` (états actifs, KPIs mis en avant, badge temps réel) |
| **Typographies** | Inter (interface) ; **JetBrains Mono** pour toutes les valeurs chiffrées, coordonnées et micro-labels |
| **Micro-labels** | Majuscules espacées (`letter-spacing`) pour les titres de sections, légendes et KPIs |
| **Données sur carte** | Pastilles colorées + pictos Font Awesome ; lignes TCL aux couleurs officielles ; choroplèthe DVF jaune→rouge (6 classes) ; choroplèthe délinquance violet (5 classes) ; eau potable vert/rouge/gris. |
| **Zones d'analyse** | Contour rouge `#EF3340`, style pointillé non sélectionné, remplissage léger, étiquettes blanches. |
| **Véhicules TCL** | SVG orientés selon le cap, couleur de ligne, animation fluide via `requestAnimationFrame`. |
| **Composants** | Cartes KPI, graphiques en barres CSS, badge « live » pulsé, barre d'état carto, légende et popups sombres, dialog modal « Sources ». |
| **Sémantique temps réel** | Vert `#34d399` / ambre `#fbbf24` / rouge `#f8716a` pour la disponibilité Vélo'v |

## 7. Architecture (résumé)

```
index.html             Structure (barre de présélections, catalogue, carte, synthèse, dialog Sources)
css/style.css          Habillage sombre/clair, KPIs, graphiques, animations véhicules
js/config.js           Catalogue CATALOG, présélections PRESELECTIONS, URLs, palettes, helpers
js/app.js              Carte Leaflet, chargement des couches, analyse par zone, synthèse, légende
js/vehicles.js         Animation des positions théoriques TCL
scripts/build_dvf.py   Préparation annuelle des prix immobiliers
data/dvf-2024.js       Ventes pré-filtrées (5 914+ ventes d'appartements 2024)
scripts/build_delinquance.py  Préparation annuelle des statistiques SSMSI
data/delinquance-2025.js      Faits par arrondissement, taux pour 1 000 hab.
data/tcl-schedule.js   Fréquences théoriques TCL pour l'animation des véhicules
```

- **Stack** : HTML/CSS/JS vanilla + Leaflet + Leaflet.markercluster (CDN). Aucun build.
- **Ajouter une couche** = un objet dans `CATALOG` (`js/config.js`) et
  éventuellement son id dans une ou plusieurs `PRESELECTIONS`.
- Contraintes apprises des API (documentées dans le code) : le WFS Grand Lyon
  rejette les caractères `/ ; :` encodés ; la `bbox` attend l'ordre
  longitude/latitude ; Overpass doit être appelé en GET ; DVF et SSMSI sans CORS
  sont pré-compilés ; Hub'Eau limite à 20 codes commune par requête.

## 8. Critères de succès

**V1.2 (qualitatif)** : un utilisateur non technique trouve une information de
son quartier en moins d'une minute, sans aide.

**Une fois publié (mesurable)** :
- ≥ 60 % des sessions activent au moins 2 présélections ou 3 couches (l'exploration fonctionne).
- < 5 % de sessions rencontrant une erreur de chargement de couche.
- Temps médian jusqu'à la première infobulle ouverte < 30 s.

## 9. Risques et dépendances

| Risque | Impact | Mitigation |
|---|---|---|
| Changement/suppression d'un flux Grand Lyon | Couche en erreur | Message d'erreur isolé par couche ; noms de flux centralisés dans `config.js` |
| Indisponibilité ou rate-limit Overpass | 3 couches OSM en erreur | Volumes faibles ; possible bascule vers un miroir ou des extraits pré-compilés |
| Nouveau millésime DVF non intégré | Prix obsolètes | Relance annuelle documentée de `build_dvf.py` (README) ; année affichée dans la légende |
| Nouveau millésime SSMSI non intégré | Données de délinquance obsolètes | Relance annuelle documentée de `build_delinquance.py` ; année affichée dans la légende et le sélecteur |
| Médianes DVF mal interprétées (ventes atypiques) | Confiance entamée | Filtres de plausibilité documentés ; nombre de ventes affiché dans l'infobulle et la synthèse |
| Indisponibilité API Hub'Eau / Atmo | 2 couches environnementales en erreur | Message isolé par couche ; données historiques non embarquées |

## 10. Pistes pour les versions suivantes

Par ordre de valeur estimée pour l'utilisateur cible :

1. **Recherche d'adresse** (API Adresse data.gouv.fr) : centrer la carte sur « chez moi ».
2. **Partage par URL** : encoder présélections, couches actives et position dans l'URL.
3. **Comparateur d'arrondissements/quartiers** : tableau de bord chiffré côte à côte (prix, équipements, espaces verts, délinquance).
4. **Couches supplémentaires** : bruit (Acoucité), arbres d'alignement (déjà disponibles dans le catalogue mais pas en présélection), événements culturels permanents.
5. **Mode « autour de moi »** : géolocalisation + rayon de marche (isochrones).
6. **Superposition multi-thèmes avancée** : garder le catalogue comme modèle par défaut, mais permettre des combinaisons complexes et les sauvegarder localement.
7. **Évolution DVF pluriannuelle** : tendance des prix 2019 → 2024 par arrondissement.
8. **Positions véhicules en temps réel** : remplacer les positions théoriques TCL par des données GTFS-RT ou API SYTRAL si disponibles.
