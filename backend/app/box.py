"""Signes de vie de la carte ESP32 de la box, et ses mesures.

La carte se manifeste d'elle-meme, une fois par minute ; le serveur ne
l'interroge jamais. Son dernier battement vit en memoire : apres un
redemarrage du serveur, la carte reapparait des le suivant. Les mesures,
elles, sont historisees en base (db.Climate).
"""
import ipaddress
import threading
import time


class InvalidHeartbeat(ValueError):
    pass


# Champs d'un battement, tels que renvoyes par snapshot().
EMPTY = {key: None for key in ("ip", "rssi_dbm", "uptime_s", "temperature_c",
                               "humidity_pct", "firmware")}


def parse(payload):
    """Valide un battement envoye par la carte."""
    if not isinstance(payload, dict):
        raise InvalidHeartbeat("Le corps doit etre un objet.")

    # L'adresse vue par le serveur ne dit rien de la carte : le retour de
    # boucle NAT de la Freebox presente tout le LAN sous 192.168.1.254.
    ip = payload.get("ip")
    try:
        # ip_address accepte aussi un entier : seule la forme texte est admise.
        if not isinstance(ip, str):
            raise ValueError(ip)
        ipaddress.ip_address(ip)
    except ValueError as exc:
        raise InvalidHeartbeat("'ip' doit etre une adresse IP.") from exc

    out = {"ip": ip}
    for field, low, high in (("rssi_dbm", -127, 0), ("uptime_s", 0, 2**32)):
        value = payload.get(field)
        # bool est un int en Python : true ne doit pas passer pour 1.
        if not isinstance(value, int) or isinstance(value, bool) or not low <= value <= high:
            raise InvalidHeartbeat(f"'{field}' doit etre un entier entre {low} et {high}.")
        out[field] = value

    # Mesures du SHT : null, ou absentes, tant que le capteur ne repond pas.
    # Bornes : la plage de mesure des SHT, au-dela c'est une lecture fausse.
    for field, low, high in (("temperature_c", -40, 125), ("humidity_pct", 0, 100)):
        value = payload.get(field)
        if value is not None and (isinstance(value, bool)
                                  or not isinstance(value, (int, float))
                                  or not low <= value <= high):
            raise InvalidHeartbeat(f"'{field}' doit etre null ou un nombre entre {low} et {high}.")
        out[field] = None if value is None else float(value)

    # Version du firmware : confirme qu'une mise a jour a distance a pris.
    firmware = payload.get("firmware")
    if firmware is not None and (not isinstance(firmware, str) or not 0 < len(firmware) <= 40
                                 or not firmware.isprintable()):
        raise InvalidHeartbeat("'firmware' doit etre une chaine de 1 a 40 caracteres.")
    out["firmware"] = firmware
    return out


class Box:
    def __init__(self, timeout):
        # Au-dela, la carte est consideree hors ligne : quelques battements
        # manques, pas un seul, pour ne pas clignoter sur une requete perdue.
        self._timeout = timeout
        self._lock = threading.Lock()
        self._last = None
        self._at = None

    def record(self, beat):
        with self._lock:
            self._last = beat
            self._at = time.monotonic()

    def snapshot(self):
        with self._lock:
            if self._last is None:
                return {"online": False, "seen_seconds_ago": None, **EMPTY}
            age = time.monotonic() - self._at
            return {
                "online": age <= self._timeout,
                "seen_seconds_ago": int(age),
                # Valeurs du dernier battement : uptime_s compris, la carte a
                # pu redemarrer depuis.
                **{key: self._last[key] for key in EMPTY},
            }
