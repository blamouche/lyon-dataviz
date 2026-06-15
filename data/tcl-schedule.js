/* ============================================================
   Horaires théoriques TCL — métro, funiculaire, tramway
   Source : fréquences publiées par SYTRAL / TCL
   Les clés nom_trace doivent matcher exactement les features WFS
   (tcl_sytral.tcllignemf_2_0_0 et tcl_sytral.tcllignetram_2_0_0).
   Convention horaire : minutes depuis minuit.
   Service après minuit : valeurs > 1440 (ex. 0h30 = 1470).
   ============================================================ */
window.TCL_SCHEDULE_DATA = {
  meta: {
    source: "Horaires théoriques TCL / SYTRAL",
    note: "Positions calculées à partir des fréquences théoriques, pas de suivi GPS",
    updated: "2026-06"
  },
  lines: {
    "A": {
      family: "MET",
      directions: [
        {
          nom_trace: "Perrache - Vaulx-en-Velin La Soie",
          journeyDuration: 28,
          periods: [
            { start: 300,  end: 390,  headway: 5 },    // 5h00–6h30
            { start: 390,  end: 570,  headway: 2.5 },  // 6h30–9h30 pointe
            { start: 570,  end: 960,  headway: 5 },    // 9h30–16h00
            { start: 960,  end: 1140, headway: 3 },    // 16h00–19h00 pointe
            { start: 1140, end: 1290, headway: 6 },    // 19h00–21h30
            { start: 1290, end: 1470, headway: 9 }     // 21h30–0h30
          ]
        },
        {
          nom_trace: "Vaulx-en-Velin La Soie - Perrache",
          journeyDuration: 28,
          periods: [
            { start: 300,  end: 390,  headway: 5 },
            { start: 390,  end: 570,  headway: 2.5 },
            { start: 570,  end: 960,  headway: 5 },
            { start: 960,  end: 1140, headway: 3 },
            { start: 1140, end: 1290, headway: 6 },
            { start: 1290, end: 1470, headway: 9 }
          ]
        }
      ]
    },
    "B": {
      family: "MET",
      directions: [
        {
          nom_trace: "Charpennes Charles Hernu . - ST-GENIS-LAVAL Hop. Sud",
          journeyDuration: 25,
          periods: [
            { start: 300,  end: 390,  headway: 6 },
            { start: 390,  end: 570,  headway: 3 },
            { start: 570,  end: 960,  headway: 5 },
            { start: 960,  end: 1140, headway: 3.5 },
            { start: 1140, end: 1290, headway: 7 },
            { start: 1290, end: 1470, headway: 8 }
          ]
        },
        {
          nom_trace: "ST-GENIS-LAVAL Hop. Sud. - Charpennes Charles Hernu .",
          journeyDuration: 25,
          periods: [
            { start: 300,  end: 390,  headway: 6 },
            { start: 390,  end: 570,  headway: 3 },
            { start: 570,  end: 960,  headway: 5 },
            { start: 960,  end: 1140, headway: 3.5 },
            { start: 1140, end: 1290, headway: 7 },
            { start: 1290, end: 1470, headway: 8 }
          ]
        }
      ]
    },
    "C": {
      family: "MET",
      directions: [
        {
          nom_trace: "Cuire - Hôtel de Ville  Louis Pradel",
          journeyDuration: 7,
          periods: [
            { start: 310,  end: 390,  headway: 9 },
            { start: 390,  end: 570,  headway: 6 },
            { start: 570,  end: 960,  headway: 9 },
            { start: 960,  end: 1140, headway: 7 },
            { start: 1140, end: 1290, headway: 10 },
            { start: 1290, end: 1470, headway: 12 }
          ]
        },
        {
          nom_trace: "Hôtel de Ville  Louis Pradel - Cuire",
          journeyDuration: 7,
          periods: [
            { start: 310,  end: 390,  headway: 9 },
            { start: 390,  end: 570,  headway: 6 },
            { start: 570,  end: 960,  headway: 9 },
            { start: 960,  end: 1140, headway: 7 },
            { start: 1140, end: 1290, headway: 10 },
            { start: 1290, end: 1470, headway: 12 }
          ]
        }
      ]
    },
    "D": {
      family: "MET",
      directions: [
        {
          nom_trace: "Gare de Vénissieux - Gare de Vaise",
          journeyDuration: 30,
          periods: [
            { start: 300,  end: 390,  headway: 5 },
            { start: 390,  end: 570,  headway: 2.5 },
            { start: 570,  end: 960,  headway: 5 },
            { start: 960,  end: 1140, headway: 3 },
            { start: 1140, end: 1290, headway: 6 },
            { start: 1290, end: 1470, headway: 9 }
          ]
        },
        {
          nom_trace: "Gare de Vaise - Gare de Vénissieux",
          journeyDuration: 30,
          periods: [
            { start: 300,  end: 390,  headway: 5 },
            { start: 390,  end: 570,  headway: 2.5 },
            { start: 570,  end: 960,  headway: 5 },
            { start: 960,  end: 1140, headway: 3 },
            { start: 1140, end: 1290, headway: 6 },
            { start: 1290, end: 1470, headway: 9 }
          ]
        }
      ]
    },
    "F1": {
      family: "FUN",
      directions: [
        {
          nom_trace: "Saint-Just - Vieux Lyon",
          journeyDuration: 3,
          periods: [
            { start: 345,  end: 570,  headway: 10 },
            { start: 570,  end: 1140, headway: 12 },
            { start: 1140, end: 1470, headway: 15 }
          ]
        },
        {
          nom_trace: "Vieux Lyon - Saint-Just",
          journeyDuration: 3,
          periods: [
            { start: 345,  end: 570,  headway: 10 },
            { start: 570,  end: 1140, headway: 12 },
            { start: 1140, end: 1470, headway: 15 }
          ]
        }
      ]
    },
    "F2": {
      family: "FUN",
      directions: [
        {
          nom_trace: "Vieux Lyon - Fourviere",
          journeyDuration: 3,
          periods: [
            { start: 345,  end: 570,  headway: 10 },
            { start: 570,  end: 1140, headway: 12 },
            { start: 1140, end: 1470, headway: 15 }
          ]
        },
        {
          nom_trace: "Fourviere - Vieux Lyon",
          journeyDuration: 3,
          periods: [
            { start: 345,  end: 570,  headway: 10 },
            { start: 570,  end: 1140, headway: 12 },
            { start: 1140, end: 1470, headway: 15 }
          ]
        }
      ]
    },
    "T1": {
      family: "TRA",
      directions: [
        {
          nom_trace: "IUT Feyssine - Debourg",
          journeyDuration: 45,
          periods: [
            { start: 300,  end: 390,  headway: 8 },
            { start: 390,  end: 570,  headway: 5 },
            { start: 570,  end: 960,  headway: 7 },
            { start: 960,  end: 1140, headway: 6 },
            { start: 1140, end: 1290, headway: 8 },
            { start: 1290, end: 1470, headway: 10 }
          ]
        },
        {
          nom_trace: "Debourg - IUT Feyssine",
          journeyDuration: 45,
          periods: [
            { start: 300,  end: 390,  headway: 8 },
            { start: 390,  end: 570,  headway: 5 },
            { start: 570,  end: 960,  headway: 7 },
            { start: 960,  end: 1140, headway: 6 },
            { start: 1140, end: 1290, headway: 8 },
            { start: 1290, end: 1470, headway: 10 }
          ]
        },
        {
          nom_trace: "INSA - Einstein - Debourg",
          journeyDuration: 35,
          periods: [
            { start: 390,  end: 570,  headway: 10 },
            { start: 570,  end: 1140, headway: 14 },
            { start: 1140, end: 1290, headway: 16 },
            { start: 1290, end: 1470, headway: 20 }
          ]
        },
        {
          nom_trace: "Debourg - INSA - Einstein",
          journeyDuration: 35,
          periods: [
            { start: 390,  end: 570,  headway: 10 },
            { start: 570,  end: 1140, headway: 14 },
            { start: 1140, end: 1290, headway: 16 },
            { start: 1290, end: 1470, headway: 20 }
          ]
        }
      ]
    },
    "T2": {
      family: "TRA",
      directions: [
        {
          nom_trace: "H. Region Montrochet - Saint-Priest Bel Air",
          journeyDuration: 50,
          periods: [
            { start: 300,  end: 390,  headway: 9 },
            { start: 390,  end: 570,  headway: 6 },
            { start: 570,  end: 960,  headway: 8 },
            { start: 960,  end: 1140, headway: 7 },
            { start: 1140, end: 1290, headway: 10 },
            { start: 1290, end: 1470, headway: 12 }
          ]
        },
        {
          nom_trace: "Saint-Priest Bel Air - H. Region Montrochet",
          journeyDuration: 50,
          periods: [
            { start: 300,  end: 390,  headway: 9 },
            { start: 390,  end: 570,  headway: 6 },
            { start: 570,  end: 960,  headway: 8 },
            { start: 960,  end: 1140, headway: 7 },
            { start: 1140, end: 1290, headway: 10 },
            { start: 1290, end: 1470, headway: 12 }
          ]
        }
      ]
    },
    "T3": {
      family: "TRA",
      directions: [
        {
          nom_trace: "Gare Part  Dieu Villette - Meyzieu ZI / Meyzieu les Panettes",
          journeyDuration: 35,
          periods: [
            { start: 300,  end: 570,  headway: 15 },
            { start: 570,  end: 1140, headway: 15 },
            { start: 1140, end: 1470, headway: 20 }
          ]
        },
        {
          nom_trace: "Meyzieu ZI / Meyzieu les Panettes - Gare Part Dieu Villette",
          journeyDuration: 35,
          periods: [
            { start: 300,  end: 570,  headway: 15 },
            { start: 570,  end: 1140, headway: 15 },
            { start: 1140, end: 1470, headway: 20 }
          ]
        }
      ]
    },
    "T4": {
      family: "TRA",
      directions: [
        {
          nom_trace: "La Doua - G. Berger - Hôpital Feyzin Vénissieux",
          journeyDuration: 40,
          periods: [
            { start: 300,  end: 390,  headway: 12 },
            { start: 390,  end: 570,  headway: 10 },
            { start: 570,  end: 960,  headway: 12 },
            { start: 960,  end: 1140, headway: 10 },
            { start: 1140, end: 1290, headway: 14 },
            { start: 1290, end: 1470, headway: 15 }
          ]
        },
        {
          nom_trace: "Hôpital Feyzin Vénissieux - La Doua - G. Berger",
          journeyDuration: 40,
          periods: [
            { start: 300,  end: 390,  headway: 12 },
            { start: 390,  end: 570,  headway: 10 },
            { start: 570,  end: 960,  headway: 12 },
            { start: 960,  end: 1140, headway: 10 },
            { start: 1140, end: 1290, headway: 14 },
            { start: 1290, end: 1470, headway: 15 }
          ]
        },
        {
          nom_trace: "Thiers - Lafayette - La Borelle",
          journeyDuration: 15,
          periods: [
            { start: 390,  end: 570,  headway: 12 },
            { start: 570,  end: 1140, headway: 15 },
            { start: 1140, end: 1290, headway: 18 },
            { start: 1290, end: 1470, headway: 20 }
          ]
        },
        {
          nom_trace: "La Borelle - Thiers - Lafayette",
          journeyDuration: 15,
          periods: [
            { start: 390,  end: 570,  headway: 12 },
            { start: 570,  end: 1140, headway: 15 },
            { start: 1140, end: 1290, headway: 18 },
            { start: 1290, end: 1470, headway: 20 }
          ]
        }
      ]
    },
    "T5": {
      family: "TRA",
      directions: [
        {
          nom_trace: "Grange Blanche - Parc du Chêne / Eurexpo",
          journeyDuration: 35,
          periods: [
            { start: 300,  end: 570,  headway: 15 },
            { start: 570,  end: 1140, headway: 20 },
            { start: 1140, end: 1470, headway: 25 }
          ]
        },
        {
          nom_trace: "Eurexpo / Parc du Chêne - Grange Blanche",
          journeyDuration: 35,
          periods: [
            { start: 300,  end: 570,  headway: 15 },
            { start: 570,  end: 1140, headway: 20 },
            { start: 1140, end: 1470, headway: 25 }
          ]
        }
      ]
    },
    "T6": {
      family: "TRA",
      directions: [
        {
          nom_trace: "La Doua - G.Berger - Debourg",
          journeyDuration: 15,
          periods: [
            { start: 300,  end: 390,  headway: 12 },
            { start: 390,  end: 570,  headway: 10 },
            { start: 570,  end: 960,  headway: 12 },
            { start: 960,  end: 1140, headway: 10 },
            { start: 1140, end: 1290, headway: 14 },
            { start: 1290, end: 1470, headway: 15 }
          ]
        },
        {
          nom_trace: "Debourg - La Doua - G.Berger",
          journeyDuration: 15,
          periods: [
            { start: 300,  end: 390,  headway: 12 },
            { start: 390,  end: 570,  headway: 10 },
            { start: 570,  end: 960,  headway: 12 },
            { start: 960,  end: 1140, headway: 10 },
            { start: 1140, end: 1290, headway: 14 },
            { start: 1290, end: 1470, headway: 15 }
          ]
        }
      ]
    },
    "T7": {
      family: "TRA",
      directions: [
        {
          nom_trace: "Decines - OL Vallee - Vaulx La Soie.",
          journeyDuration: 15,
          periods: [
            { start: 300,  end: 390,  headway: 12 },
            { start: 390,  end: 570,  headway: 10 },
            { start: 570,  end: 960,  headway: 12 },
            { start: 960,  end: 1140, headway: 10 },
            { start: 1140, end: 1290, headway: 14 },
            { start: 1290, end: 1470, headway: 15 }
          ]
        },
        {
          nom_trace: "Vaulx La Soie - Decines - OL Vallee",
          journeyDuration: 15,
          periods: [
            { start: 300,  end: 390,  headway: 12 },
            { start: 390,  end: 570,  headway: 10 },
            { start: 570,  end: 960,  headway: 12 },
            { start: 960,  end: 1140, headway: 10 },
            { start: 1140, end: 1290, headway: 14 },
            { start: 1290, end: 1470, headway: 15 }
          ]
        }
      ]
    }
  }
};