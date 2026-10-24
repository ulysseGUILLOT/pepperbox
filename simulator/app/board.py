"""La carte ESP32 simulee et son capteur SHT.

Elle envoie au backend le meme battement que le firmware, par la meme route
et au meme rythme, et allume sa LED selon les memes regles. Le capteur se
regle depuis la page du simulateur : temperature, humidite, branchement.
"""
import random
import threading
import time
from datetime import datetime

import requests

INTERVAL_SECONDS = 60
# Adresse annoncee, comme le fait la carte : le backend ne peut pas la deduire.
BOARD_IP = "192.168.1.131"

# Memes bornes que firmware/src/main.cpp : a modifier ensemble.
TEMP_COLD_C = 22.0
TEMP_HOT_C = 28.0
TEMP_HYSTERESIS_C = 0.5

TEMP_RANGE = (5.0, 45.0)
HUMIDITY_RANGE = (0.0, 100.0)


class InvalidSensor(ValueError):
    pass


def classify(celsius, previous):
    """Zone de la LED, avec l'hysteresis du firmware : pour quitter une
    zone, il faut repasser la borne d'un demi-degre."""
    if previous == "cold" and celsius < TEMP_COLD_C + TEMP_HYSTERESIS_C:
        return "cold"
    if previous == "hot" and celsius > TEMP_HOT_C - TEMP_HYSTERESIS_C:
        return "hot"
    if celsius < TEMP_COLD_C:
        return "cold"
    if celsius > TEMP_HOT_C:
        return "hot"
    return "good"


class Board:
    def __init__(self, api_base, tz, timeout=5.0):
        self._api = api_base.rstrip("/")
        self._tz = tz
        self._timeout = timeout
        self._wake = threading.Event()
        self._lock = threading.Lock()
        self.plugged = True
        self.booted = time.monotonic()
        self.last = None

        self.sensor_connected = True
        self.temperature_c = 24.0
        self.humidity_pct = 55.0
        self._climate = classify(self.temperature_c, None)

    def start(self):
        threading.Thread(target=self._loop, daemon=True, name="board").start()

    def _loop(self):
        while True:
            if self.plugged:
                self._beat()
            self._wake.wait(INTERVAL_SECONDS)
            self._wake.clear()

    def _beat(self):
        body = {
            "ip": BOARD_IP,
            "rssi_dbm": random.randint(-62, -48),
            "uptime_s": int(time.monotonic() - self.booted),
        }
        try:
            r = requests.post(f"{self._api}/api/box/heartbeat", json=body,
                              timeout=self._timeout)
            ok, detail = r.ok, f"HTTP {r.status_code}"
        except requests.RequestException as exc:
            ok, detail = False, str(exc)
        self.last = {"ok": ok, "detail": detail,
                     "at": datetime.now(self._tz).strftime("%H:%M:%S")}

    def plug(self, plugged):
        """Rebrancher la carte la redemarre : uptime a zero et battement
        immediat, comme le firmware au retour du Wi-Fi."""
        with self._lock:
            if plugged and not self.plugged:
                self.booted = time.monotonic()
                # Au demarrage, le firmware repart sans zone connue.
                self._climate = None
                self._update_climate()
            self.plugged = plugged
        self._wake.set()

    def set_sensor(self, payload):
        """Applique les reglages presents dans payload ; les autres restent."""
        if not isinstance(payload, dict):
            raise InvalidSensor("Le corps doit etre un objet.")
        changes = {}
        for field, (low, high) in (("temperature_c", TEMP_RANGE),
                                   ("humidity_pct", HUMIDITY_RANGE)):
            if field in payload:
                value = payload[field]
                if isinstance(value, bool) or not isinstance(value, (int, float)) \
                        or not low <= value <= high:
                    raise InvalidSensor(f"{field} doit etre entre {low} et {high}.")
                changes[field] = float(value)
        if "connected" in payload:
            if not isinstance(payload["connected"], bool):
                raise InvalidSensor("connected doit etre un booleen.")
            changes["sensor_connected"] = payload["connected"]

        with self._lock:
            reconnected = changes.get("sensor_connected") and not self.sensor_connected
            for key, value in changes.items():
                setattr(self, key, value)
            if reconnected:
                self._climate = None
            self._update_climate()

    def _update_climate(self):
        if self.sensor_connected:
            self._climate = classify(self.temperature_c, self._climate)
        else:
            self._climate = None

    def led(self):
        """Couleur de la LED : eteinte sans alimentation ou sans mesure."""
        if not self.plugged or self._climate is None:
            return "off"
        return self._climate

    def snapshot(self):
        with self._lock:
            return {
                "plugged": self.plugged,
                "last": self.last,
                "sensor": {
                    "connected": self.sensor_connected,
                    "temperature_c": self.temperature_c,
                    "humidity_pct": self.humidity_pct,
                },
                "led": self.led(),
                # La page en tire les zones du curseur : une seule source.
                "bounds": {"cold": TEMP_COLD_C, "hot": TEMP_HOT_C,
                           "min": TEMP_RANGE[0], "max": TEMP_RANGE[1]},
            }
