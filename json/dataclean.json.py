{
  "centre": "ITB",
  "configuracio_calculadora": {
    "descripcio": "Dades base per a 8 càlculs de sostenibilitat",
    "unitats": { "energia": "kWh", "aigua": "litres", "oficina": "unitats", "neteja": "unitats" }
  },
  "dades_base": {
    "electricitat": {
      "font": "Plant Report_ITB_01-2025.xlsx",
      "consum_mitja_diari_kWh": 261.54,
      "produccio_mitja_diaria_kWh": 46.41,
      "factors_estacionals": {
        "curs_escolar_set_juny": 1.1,
        "estiu_juliol_agost": 0.4,
        "anual_global": 1.0
      }
    },
    "aigua": {
      "font": "Gràfics Aigua febrer 2024",
      "consum_mitja_diari_litres": 850,
      "factors_estacionals": {
        "curs_escolar_set_juny": 1.0,
        "estiu_juliol_agost": 0.2,
        "anual_global": 0.9
      }
    },
    "consumibles_oficina": {
      "font": "Factures Lyreco F035/F036",
      "mitjana_mensual": {
        "paper_A4_paquets": 22.5,
        "marcadors_pissarra_unitats": 61.6
      },
      "factors_estacionals": {
        "curs_escolar_set_juny": 1.2,
        "vacances": 0.1
      }
    },
    "productes_neteja": {
      "font": "Factures Neteges F055/F056",
      "mitjana_mensual": {
        "paper_higienic_rotllos": 108,
        "gel_mans_litres": 10,
        "bobina_secamans": 6
      },
      "factors_estacionals": {
        "mesos_freds_set_marc": 1.3,
        "mesos_calids_abril_juny": 1.0,
        "estiu": 0.1
      }
    }
  },
  "objectius_millora": {
    "reduccio_3_anys_percentatge": 30,
    "benestar_social": {
      "limita_mobils_percentatge": 10
    }
  }
}