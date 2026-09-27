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
