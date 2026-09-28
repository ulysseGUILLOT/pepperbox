"""Le telephone simule : il declare arrivee et depart au backend, par la meme
route et avec la meme authentification que le raccourci iOS."""
import threading
from datetime import datetime, timezone

import requests


class Phone:
    def __init__(self, api_base, timeout=5.0):
        self._api = api_base.rstrip("/")
        self._timeout = timeout
        self._token = None
        self._lock = threading.Lock()
        self.last = None

    def _issue_token(self):
        r = requests.post(f"{self._api}/api/presence/token", timeout=self._timeout)
        r.raise_for_status()
        self._token = r.json()["token"]

    def _send(self, state):
        return requests.post(
            f"{self._api}/api/presence/event",
            headers={"Authorization": f"Bearer {self._token}"},
            json={"state": state,
                  "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")},
            timeout=self._timeout)

    def declare(self, state):
        with self._lock:
            try:
                if self._token is None:
                    self._issue_token()
                r = self._send(state)
                if r.status_code == 401:
                    # Le jeton a ete remplace depuis le tableau de bord.
                    self._issue_token()
                    r = self._send(state)
                ok, detail = r.ok, r.json()
            except (requests.RequestException, ValueError, KeyError) as exc:
                ok, detail = False, {"error": str(exc)}
            self.last = {"state": state, "ok": ok, "detail": detail}
            return self.last
