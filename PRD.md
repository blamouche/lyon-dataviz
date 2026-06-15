# PRD — Lyon Data

| | |
|---|---|
| **Produit** | Lyon Data — plateforme d'exploration des données ouvertes de la ville de Lyon |
| **Version du document** | 1.1 |
| **Date** | 12 juin 2026 |
| **Statut** | V1.1 livrée (refonte UI « plateforme analytique ») |

---

## 1. Vision et problème

Les données ouvertes sur Lyon sont abondantes (Métropole de Lyon, Ville de Lyon,
État, OpenStreetMap) mais **dispersées sur plusieurs portails et présentées dans
des formats techniques** (WFS, GeoJSON, CSV) inaccessibles au grand public.

**Lyon Data** rassemble ces données sur une carte unique et les rend
explorables par **des personnes sans aucune compétence technique** : on choisit
un thème de la vie quotidienne, la carte affiche les informations
correspondantes, accompagnées d'une synthèse chiffrée (indicateurs, graphique).

Le produit assume une **esthétique professionnelle de plateforme analytique**
(type outil de BI / data science) : il doit inspirer la même confiance qu'un
tableau de bord d'entreprise, tout en restant utilisable par le grand public.

> *« Où sont les écoles et les parcs autour de chez moi ? Combien coûte un
> appartement dans cet arrondissement ? Y a-t-il un Vélo'v disponible ? »*

## 2. Utilisateurs cibles

| Persona | Besoin principal |
|---|---|
| **Habitant·e / futur·e habitant·e** | Évaluer un quartier : prix, écoles, transports, espaces verts |
| **Parent** | Localiser écoles, crèches, piscines, parcs |
| **Citoyen·ne curieux·se** | Explorer sa ville à travers les données publiques |
| **Journaliste / association locale** | Illustrer un sujet (logement, mobilité) avec des données sourcées |
| **Agent public / élu·e local·e** | Visualiser rapidement l'offre d'équipements d'un secteur |

**Anti-persona** : le géomaticien expert — il dispose déjà des portails
data.grandlyon.com et data.gouv.fr. L'outil ne cherche pas à remplacer un SIG.

## 3. Principes produit

1. **Zéro jargon** : libellés en français courant (« Prix médian au m² », pas « DVF agrégé »).
2. **Préselection intelligente** : chaque thème active d'office les couches les plus parlantes ; les couches plus pointues restent disponibles en option.
3. **Toujours sourcé** : chaque infobulle et la fenêtre « Sources » citent l'origine de la donnée.
4. **Données vivantes** : les couches sont chargées en direct depuis les services ouverts (sauf exception documentée), jamais de copie qui périme silencieusement.
5. **Simplicité technique** : site statique, sans compte, sans backend, sans build — hébergeable n'importe où, maintenable par une seule personne.
6. **Crédibilité visuelle** : design sobre et analytique (thème sombre, chiffres en police monospace, indicateurs synthétiques) — l'outil doit ressembler à un produit data professionnel, pas à une page de démonstration.

## 4. Périmètre fonctionnel — V1 (livrée)

### 4.1 Carte
- Fond de carte sombre (CARTO Dark Matter) adapté à la superposition de données, fond clair (Positron) disponible en un clic.
- Centrage initial sur Lyon, zoom libre, légende dynamique, infobulles au clic.
- Regroupement automatique des points denses (clustering).

### 4.2 Navigation par thèmes
L'utilisateur suit un parcours en trois étapes numérotées : **01 Thème
d'analyse** → **02 Couches de données** (cases à cocher, descriptions en clair,
compteur d'objets chargés) → **03 Synthèse** (générée automatiquement).

| Thème | Couches par défaut | Couches optionnelles |
|---|---|---|
| 🚇 Transports | Lignes métro/funiculaire et tramway (couleurs TCL), stations Vélo'v **temps réel** | Arrêts TCL, aménagements cyclables, autopartage, bornes de recharge |
| 🌳 Qualité de vie | Parcs et jardins, marchés, piscines | Musées, toilettes publiques |
| 🛡️ Sécurité & santé | Commissariats, casernes de pompiers, hôpitaux | Défibrillateurs, pharmacies |
| 🏠 Logement | Prix médian au m² des appartements par arrondissement (ventes DVF 2024) | Détail de chaque vente géolocalisée |
| 🎓 Éducation & famille | Écoles, collèges, lycées | Crèches |

### 4.3 Panneau « Synthèse » (V1.1)
Pour chaque thème actif, un panneau d'indicateurs est calculé côté client à
partir des données affichées :
- **Cartes KPI** : volume d'objets par couche ; indicateurs métier mis en avant
  (vélos Vélo'v disponibles et % de stations approvisionnées en temps réel,
  prix médian ville et nombre de ventes analysées pour le logement).
- **Graphique en barres** : prix médian au m² par arrondissement (CSS pur,
  pas de bibliothèque de charts).

### 4.4 Habillage cartographique (V1.1)
- Fond de carte **sombre** par défaut (CARTO Dark Matter), bascule vers un fond
  clair en un clic.
- **Barre d'état cartographique** : coordonnées du curseur, niveau de zoom,
  total d'objets affichés ; échelle métrique Leaflet.
- Légende, popups, clusters et contrôles harmonisés avec le thème sombre.
- Badge « Données en direct » dans l'en-tête.

### 4.5 Sources de données
| Source | Mode d'accès | Couches |
|---|---|---|
| data.grandlyon.com (Métropole, Ville de Lyon, SYTRAL) | Flux WFS GeoJSON, en direct | Transports, parcs, marchés, équipements, éducation… |
| Vélo'v / JCDecaux via data.grandlyon.com | API JSON temps réel | Disponibilité des stations |
| data.gouv.fr — DVF géolocalisées (DGFiP/Etalab) | **Pré-compilées** (`scripts/build_dvf.py`, le serveur n'expose pas de CORS) | Prix immobiliers |
| OpenStreetMap via API Overpass | Requêtes en direct | Commissariats, pompiers, pharmacies |

### 4.6 Hors périmètre V1
- Pas de compte utilisateur, pas de sauvegarde de configuration.
- Pas de superposition de couches issues de thèmes différents.
- Pas de statistiques de délinquance (les bases SSMSI sont à la maille communale : une seule valeur pour tout Lyon, peu parlant sur une carte).
- Pas d'export (image, CSV) ni de partage par URL.

## 5. Exigences non fonctionnelles

| Exigence | Cible |
|---|---|
| **Accessibilité d'usage** | Compréhensible sans notice par un non-technicien ; libellés français ; parcours en trois étapes numérotées |
| **Performance** | Premier affichage < 3 s sur connexion standard ; couches lourdes limitées à l'emprise de Lyon (bbox) et chargées à la demande, puis mises en cache en mémoire |
| **Responsive** | Utilisable sur mobile (panneau repliable au-dessus de la carte) |
| **Robustesse** | Échec d'une source = message clair sur la couche concernée, le reste de l'app fonctionne |
| **Déploiement** | Site 100 % statique (GitHub Pages, Netlify…) ; aucune clé d'API, aucun secret |
| **Licences** | Données sous Licence Ouverte / ODbL ; attribution affichée (fenêtre « Sources » + crédits carte) |

## 6. Design system (V1.1)

| Élément | Choix |
|---|---|
| **Ambiance** | Thème sombre « console analytique » : fond `#0d1117`, panneaux `#131a22`/`#1a232e`, bordures fines `#232e3b` |
| **Couleur d'accent** | Teal `#2dd4bf` (états actifs, KPIs mis en avant, badge temps réel) |
| **Typographies** | Inter (interface) ; **JetBrains Mono** pour toutes les valeurs chiffrées, coordonnées et micro-labels |
| **Micro-labels** | Majuscules espacées (`letter-spacing`) pour les titres de sections, légendes et KPIs |
| **Données sur carte** | Palette de marqueurs éclaircie, calibrée pour le fond sombre ; lignes TCL aux couleurs officielles ; choroplèthe DVF jaune→rouge (6 classes) |
| **Composants** | Cartes KPI, graphique en barres CSS, badge « live » pulsé, barre d'état carto, légende et popups sombres |
| **Sémantique temps réel** | Vert `#34d399` / ambre `#fbbf24` / rouge `#f8716a` pour la disponibilité Vélo'v |

## 7. Architecture (résumé)

```
index.html             Structure (panneau thèmes + carte)
css/style.css          Habillage
js/config.js           Déclaration des thèmes/couches — point d'extension unique
js/app.js              Carte Leaflet, chargement, légende, popups
scripts/build_dvf.py   Préparation annuelle des prix immobiliers
data/dvf-2024.js       Ventes pré-filtrées (5 914 ventes d'appartements 2024)
```

- **Stack** : HTML/CSS/JS vanilla + Leaflet + Leaflet.markercluster (CDN). Aucun build.
- **Ajouter une couche** = un objet dans `THEMES` (`js/config.js`).
- Contraintes apprises des API (documentées dans le code) : le WFS Grand Lyon
  rejette les caractères `/ ; :` encodés ; la `bbox` attend l'ordre
  longitude/latitude ; Overpass doit être appelé en GET ; DVF sans CORS.

## 8. Critères de succès

**V1 (qualitatif)** : un utilisateur non technique trouve une information de
son quartier en moins d'une minute, sans aide.

**Une fois publié (mesurable)** :
- ≥ 60 % des sessions activent au moins 2 thèmes (l'exploration fonctionne).
- < 5 % de sessions rencontrant une erreur de chargement de couche.
- Temps médian jusqu'à la première infobulle ouverte < 30 s.

## 9. Risques et dépendances

| Risque | Impact | Mitigation |
|---|---|---|
| Changement/suppression d'un flux Grand Lyon | Couche en erreur | Message d'erreur isolé par couche ; noms de flux centralisés dans `config.js` |
| Indisponibilité ou rate-limit Overpass | 3 couches OSM en erreur | Volumes faibles ; possible bascule vers un miroir ou des extraits pré-compilés |
| Nouveau millésime DVF non intégré | Prix obsolètes | Relance annuelle documentée de `build_dvf.py` (README) ; année affichée dans la légende |
| Médianes DVF mal interprétées (ventes atypiques) | Confiance entamée | Filtres de plausibilité documentés ; nombre de ventes affiché dans l'infobulle |

## 10. Pistes pour les versions suivantes

Par ordre de valeur estimée pour l'utilisateur cible :

1. **Recherche d'adresse** (API Adresse data.gouv.fr) : centrer la carte sur « chez moi ».
2. **Partage par URL** : encoder thème + couches + position dans l'URL.
3. **Comparateur d'arrondissements** : tableau de bord chiffré (prix, équipements, espaces verts par habitant).
4. **Couches supplémentaires** : qualité de l'air (ATMO AURA), bruit (Acoucité), arbres d'alignement, événements culturels.
5. **Mode « autour de moi »** : géolocalisation + rayon de marche (isochrones).
6. **Superposition multi-thèmes** pour utilisateurs avancés.
7. **Évolution DVF pluriannuelle** : tendance des prix 2019 → 2024 par arrondissement.
