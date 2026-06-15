#!/usr/bin/env python3
"""Prépare les données DVF (prix immobiliers) pour l'application.

Le serveur files.data.gouv.fr n'autorise pas les requêtes navigateur
(pas d'en-têtes CORS) : ce script télécharge donc les ventes 2024 des
9 arrondissements de Lyon, filtre les ventes d'appartements « propres »
et produit un fichier JS compact (data/dvf-2024.js) chargé par l'app
via une balise <script> — ce qui fonctionne aussi en ouvrant
index.html directement (file://), sans serveur local.

À relancer une fois par an quand le millésime DVF est publié :
    python3 scripts/build_dvf.py
"""
import csv
import io
import json
import urllib.request
from pathlib import Path

YEAR = 2024
BASE = f"https://files.data.gouv.fr/geo-dvf/latest/csv/{YEAR}/communes/69"
ARRONDISSEMENTS = [f"6938{i}" for i in range(1, 10)]
OUT = Path(__file__).resolve().parent.parent / "data" / f"dvf-{YEAR}.js"


def fetch_sales(insee: str) -> list:
    url = f"{BASE}/{insee}.csv"
    print(f"  {url}")
    with urllib.request.urlopen(url, timeout=60) as resp:
        text = resp.read().decode("utf-8")

    # Une vente (mutation) peut occuper plusieurs lignes : une par lot/local.
    mutations = {}
    for row in csv.DictReader(io.StringIO(text)):
        if row["nature_mutation"] != "Vente":
            continue
        m = mutations.setdefault(row["id_mutation"], {
            "price": float(row["valeur_fonciere"] or 0),
            "surface": 0.0,
            "types": set(),
            "lat": row["latitude"],
            "lon": row["longitude"],
            "date": row["date_mutation"],
            "rooms": 0,
        })
        if row["type_local"]:
            m["types"].add(row["type_local"])
        if row["type_local"] == "Appartement":
            m["surface"] += float(row["surface_reelle_bati"] or 0)
            m["rooms"] = max(m["rooms"], int(float(row["nombre_pieces_principales"] or 0)))

    sales = []
    for m in mutations.values():
        # Ne garde que les ventes portant uniquement sur un appartement
        # (+ éventuelles dépendances), avec des valeurs plausibles.
        significant = {t for t in m["types"] if t != "Dépendance"}
        if significant != {"Appartement"}:
            continue
        if not (9 <= m["surface"] <= 300):
            continue
        if not (15_000 <= m["price"] <= 5_000_000):
            continue
        ppm2 = m["price"] / m["surface"]
        if not (800 <= ppm2 <= 25_000):
            continue
        sales.append([
            round(float(m["lat"]), 6) if m["lat"] else None,
            round(float(m["lon"]), 6) if m["lon"] else None,
            round(m["price"]),
            round(m["surface"]),
            round(ppm2),
            m["rooms"],
            m["date"],
        ])
    return sales


def main():
    print(f"Téléchargement des ventes DVF {YEAR} pour Lyon…")
    data = {
        "meta": {
            "year": YEAR,
            "source": "DVF géolocalisées (DGFiP / Etalab), data.gouv.fr",
            "fields": ["lat", "lon", "prix", "surface_m2", "prix_m2", "pieces", "date"],
            "filtre": "Ventes d'appartements uniquement, valeurs plausibles",
        },
        "arrondissements": {},
    }
    total = 0
    for insee in ARRONDISSEMENTS:
        sales = fetch_sales(insee)
        data["arrondissements"][insee] = sales
        total += len(sales)
        print(f"    {insee} : {len(sales)} ventes retenues")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    OUT.write_text(f"// Généré par scripts/build_dvf.py — ne pas éditer à la main\nwindow.DVF_DATA = {payload};\n", encoding="utf-8")
    print(f"OK — {total} ventes écrites dans {OUT}")


if __name__ == "__main__":
    main()
