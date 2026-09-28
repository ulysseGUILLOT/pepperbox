"""Priorite a la presence sur le programme automatique.

L'iPhone declare lui-meme son etat via un raccourci Apple ; rien n'est
observe sur le reseau. Le seul point d'entree ouvert sur Internet est
l'evenement de presence, et il ne peut que deplacer un booleen.
"""
import hashlib
import re
import secrets
import time
from datetime import datetime, timezone

KEY = "presence"
TOKEN_KEY = "presence_token_sha256"
STATE_KEY = "presence_state"

DEFAULT = {
    "enabled": True,
    "quiet_start": "20:00",
    "quiet_end": "11:00",
}

# Origines d'un allumage decide par un humain : la priorite ne les contredit
# pas. Tout le reste est considere automatique -- liste blanche deliberee :
# l'ordonnanceur interne de la prise rapporte "loopback" (constate le
# 2026-09-27), valeur qu'on n'aurait pas devinee. Enumerer le manuel plutot
# que l'automatique evite de dependre de cette chaine.
MANUAL_SOURCES = {"HTTP_in", "WS_in", "button", "SHC", "MQTT", "cloud"}

# Tolerance sur l'horodatage envoye par le raccourci, contre le rejeu.
MAX_SKEW_SECONDS = 300

_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


class InvalidPresence(ValueError):
    pass


# ---- reglages ----

def parse(payload):
    if not isinstance(payload, dict):
        raise InvalidPresence("Le corps doit etre un objet.")

    enabled = payload.get("enabled", True)
    if not isinstance(enabled, bool):
        raise InvalidPresence("'enabled' doit etre un booleen.")

    out = {"enabled": enabled}
    for field in ("quiet_start", "quiet_end"):
        value = payload.get(field)
        if not isinstance(value, str) or not _HHMM.match(value):
            raise InvalidPresence(f"'{field}' doit etre une heure HH:MM.")
        out[field] = value

    if out["quiet_start"] == out["quiet_end"]:
        raise InvalidPresence("Le debut et la fin de plage doivent differer.")
    return out


def load(settings):
    stored = settings.get(KEY)
    return stored if isinstance(stored, dict) else dict(DEFAULT)


def _minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def in_quiet_window(config, now):
    start = _minutes(config["quiet_start"])
    end = _minutes(config["quiet_end"])
    current = now.hour * 60 + now.minute
    if start < end:
        return start <= current < end
    return current >= start or current < end   # la plage franchit minuit


# ---- jeton ----

def _digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def issue_token(settings):
    """Genere un jeton et n'en conserve que l'empreinte : une lecture de la
    base ne suffit pas a fabriquer une requete valide."""
    token = secrets.token_urlsafe(32)
    settings.set(TOKEN_KEY, _digest(token))
    return token


def token_matches(settings, presented):
    stored = settings.get(TOKEN_KEY)
    if not stored or not presented:
        return False
    return secrets.compare_digest(stored, _digest(presented))


def bearer_from(header):
    if not header or not header.startswith("Bearer "):
        return None
    return header[7:].strip() or None


# ---- evenement ----

def parse_event(payload):
    """Valide un evenement envoye par le raccourci."""
    if not isinstance(payload, dict):
        raise InvalidPresence("Le corps doit etre un objet.")

    state = payload.get("state")
    if state not in ("home", "away"):
        raise InvalidPresence("'state' doit valoir 'home' ou 'away'.")

    at = payload.get("at")
    if not isinstance(at, str):
        raise InvalidPresence("'at' doit etre un horodatage ISO 8601.")
    try:
        moment = datetime.fromisoformat(at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise InvalidPresence(f"horodatage illisible: {exc}") from exc
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)

    # Sans cette verification, un evenement capte une fois pourrait etre
    # rejoue indefiniment pour neutraliser la plage de silence.
    if abs(time.time() - moment.timestamp()) > MAX_SKEW_SECONDS:
        raise InvalidPresence("Horodatage trop ancien ou trop avance.")

    return {"home": state == "home", "at": moment.timestamp()}


def load_state(settings):
    stored = settings.get(STATE_KEY)
    if not isinstance(stored, dict):
        return {"home": False, "since": None, "forced_off": False}
    return stored
