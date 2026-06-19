#!/usr/bin/env python3
"""Prépare les statistiques de délinquance (SSMSI) pour l'application.

Source : « Base statistique communale de la délinquance enregistrée par la
police et la gendarmerie nationales » (SSMSI, ministère de l'Intérieur),
diffusée sur data.gouv.fr. Le fichier national (~38 Mo compressé) est filtré
sur les 9 arrondissements de Lyon et sur toutes les années disponibles,
puis écrit en JS compact (data/delinquance.js) chargé via une balise <script>.

Usage :
    python3 scripts/build_delinquance.py [chemin/vers/fichier.csv.gz]

Sans argument, le fichier est téléchargé depuis data.gouv.fr (long).
À relancer chaque année à la publication du nouveau millésime.
"""
import csv
import gzip
import io
import json
import sys
import urllib.request
from pathlib import Path

DATASET_API = ("https://www.data.gouv.fr/api/1/datasets/"
               "bases-statistiques-communale-departementale-et-regionale-de-la-"
               "delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales/")
ARRONDISSEMENTS = {f"6938{i}" for i in range(1, 10)}
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def resolve_csv_url() -> str:
    with urllib.request.urlopen(DATASET_API, timeout=60) as resp:
        dataset = json.load(resp)
    for r in dataset["resources"]:
        if r.get("format") == "csv.gz" and r["title"].startswith("COM -"):
            return r["url"]
    raise SystemExit("Ressource CSV communale introuvable dans le jeu de données")


def open_source():
    if len(sys.argv) > 1:
        print(f"Lecture du fichier local {sys.argv[1]}")
        return gzip.open(sys.argv[1], "rt", encoding="utf-8")
    url = resolve_csv_url()
    print(f"Téléchargement de {url} …")
    raw = urllib.request.urlopen(url, timeout=600).read()
    return io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(raw)), encoding="utf-8")


def parse_float(v):
    if not v or v == "NA":
        return None
    return float(v.replace(",", "."))


def main():
    rows = []
    with open_source() as f:
        for row in csv.DictReader(f, delimiter=";"):
            code = row.get("CODGEO_2025") or row.get("CODGEO_2024") or ""
            if code in ARRONDISSEMENTS:
                rows.append((code, row))
    if not rows:
        raise SystemExit("Aucune ligne trouvée pour les arrondissements de Lyon")

    years = sorted({int(r["annee"]) for _, r in rows})
    latest = years[-1]
    print(f"{len(rows)} lignes Lyon · années : {years[0]}–{latest}")

    indicateurs = []
    arrond = {}
    for code, r in rows:
        year = int(r["annee"])
        ind = r["indicateur"]
        if ind not in indicateurs:
            indicateurs.append(ind)
        a = arrond.setdefault(code, {"pop": int(r["insee_pop"] or 0), "years": {}})
        year_data = a["years"].setdefault(year, {})
        nombre = parse_float(r["nombre"])
        taux = parse_float(r["taux_pour_mille"])
        # Indicateurs non diffusés (secret statistique) : valeurs interpolées
        # fournies dans les colonnes complement_info_*.
        if taux is None:
            nombre = parse_float(r["complement_info_nombre"])
            taux = parse_float(r["complement_info_taux"])
        year_data[ind] = [
            round(nombre) if nombre is not None else None,
            round(taux, 2) if taux is not None else None,
        ]

    out = DATA_DIR / "delinquance.js"
    data = {
        "meta": {
            "year": latest,
            "years": years,
            "source": "SSMSI (ministère de l'Intérieur) / data.gouv.fr",
            "note": "Faits enregistrés par la police et la gendarmerie ; taux pour 1 000 habitants",
        },
        "indicateurs": indicateurs,
        "arrondissements": arrond,
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    out.write_text(
        f"// Généré par scripts/build_delinquance.py — ne pas éditer à la main\n"
        f"window.DELINQUANCE_DATA = {payload};\n",
        encoding="utf-8",
    )
    print(f"OK — {len(arrond)} arrondissements × {len(indicateurs)} indicateurs × {len(years)} années → {out}")


if __name__ == "__main__":
    main()
