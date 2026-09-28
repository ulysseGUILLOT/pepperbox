"""Heure locale explicite.

Le conteneur tourne en UTC, mais les heures saisies par l'utilisateur et
celles de la prise sont locales. S'appuyer sur datetime.now() decale toutes
les decisions du serveur de l'offset courant.
"""
import os
from datetime import datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo(os.getenv("LOCAL_TZ", "Europe/Paris"))


def now_local():
    return datetime.now(TZ)
