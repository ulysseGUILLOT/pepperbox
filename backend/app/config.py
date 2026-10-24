import os


class Config:
    """Configuration lue depuis l'environnement, avec des valeurs par defaut
    correspondant a l'installation actuelle."""

    SHELLY_HOST = os.getenv("SHELLY_HOST", "192.168.1.102")
    SHELLY_SWITCH_ID = int(os.getenv("SHELLY_SWITCH_ID", "0"))
    SHELLY_TIMEOUT = float(os.getenv("SHELLY_TIMEOUT", "4.0"))

    # Tarif bleu EDF, option base. A ajuster depuis la facture :
    # le tarif reglemente est revu deux fois par an.
    PRICE_PER_KWH = float(os.getenv("PRICE_PER_KWH", "0.2016"))

    # Base des reglages, sur un volume Docker pour survivre au
    # remplacement du conteneur.
    DB_PATH = os.getenv("DB_PATH", "/data/pepperbox.db")

    # Priorite a la presence.
    PRESENCE_INTERVAL = float(os.getenv("PRESENCE_INTERVAL", "30"))
    PRESENCE_RATE_LIMIT = int(os.getenv("PRESENCE_RATE_LIMIT", "10"))

    # Carte ESP32 de la box : un battement par minute, hors ligne apres
    # trois manques.
    BOX_TIMEOUT = float(os.getenv("BOX_TIMEOUT", "180"))

    # Plage de temperature de la box, celle du guide de culture lampe
    # allumee. Les memes bornes allument la LED de la carte
    # (firmware/src/main.cpp) : a modifier ensemble.
    CLIMATE_COLD_C = float(os.getenv("CLIMATE_COLD_C", "22"))
    CLIMATE_HOT_C = float(os.getenv("CLIMATE_HOT_C", "28"))
    # Une mesure par minute : un an tient en une vingtaine de Mo.
    CLIMATE_RETENTION_DAYS = int(os.getenv("CLIMATE_RETENTION_DAYS", "365"))
