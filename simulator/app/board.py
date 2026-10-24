"""La carte ESP32 simulee : elle envoie au backend le meme battement que le
firmware, par la meme route et au meme rythme."""
import random
import threading
import time
from datetime import datetime

import requests

INTERVAL_SECONDS = 60
# Adresse annoncee, comme le fait la carte : le backend ne peut pas la deduire.
BOARD_IP = "192.168.1.131"


class Board:
    def __init__(self, api_base, tz, timeout=5.0):
        self._api = api_base.rstrip("/")
        self._tz = tz
        self._timeout = timeout
        self._wake = threading.Event()
        self.plugged = True
        self.booted = time.monotonic()
        self.last = None

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
        if plugged and not self.plugged:
            self.booted = time.monotonic()
        self.plugged = plugged
        self._wake.set()

    def snapshot(self):
        return {"plugged": self.plugged, "last": self.last}
