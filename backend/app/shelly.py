"""Client de l'API RPC locale d'une prise Shelly Gen 3."""
import threading
import time

import requests


class ShellyError(RuntimeError):
    """La prise est injoignable ou repond quelque chose d'inattendu."""


class ShellyPlug:
    def __init__(self, host, switch_id=0, timeout=4.0):
        self.host = host
        self.switch_id = switch_id
        self.timeout = timeout
        self._base = f"http://{host}/rpc"
        # Suivi en memoire de la derniere bascule observee : la prise ne
        # rapporte pas depuis combien de temps elle est dans son etat.
        self._lock = threading.Lock()
        self._last_state = None
        self._changed_at = None

    def _rpc(self, method, params=None):
        """Appel JSON-RPC en POST : Schedule.* prend des parametres imbriques
        qu'une requete GET ne peut pas transporter."""
        try:
            r = requests.post(f"http://{self.host}/rpc",
                              json={"id": 1, "method": method,
                                    "params": params or {}},
                              timeout=self.timeout)
            r.raise_for_status()
            body = r.json()
        except requests.RequestException as exc:
            raise ShellyError(str(exc)) from exc
        except ValueError as exc:
            raise ShellyError(f"reponse illisible: {exc}") from exc
        if "error" in body:
            raise ShellyError(str(body["error"]))
        return body.get("result", {})

    def schedule_create(self, timespec, on):
        res = self._rpc("Schedule.Create", {
            "enable": True,
            "timespec": timespec,
            "calls": [{"method": "Switch.Set",
                       "params": {"id": self.switch_id, "on": on}}],
        })
        return res["id"]

    def schedule_delete(self, job_id):
        self._rpc("Schedule.Delete", {"id": job_id})

    def schedule_enable(self, job_id, enable):
        """Suspend ou reactive un programme sans le recreer : il garde son
        identifiant, et donc sa place dans nos reglages."""
        self._rpc("Schedule.Update", {"id": job_id, "enable": bool(enable)})

    def schedule_list(self):
        return self._rpc("Schedule.List").get("jobs", [])

    def _call(self, method, params=None):
        try:
            r = requests.get(f"{self._base}/{method}", params=params,
                             timeout=self.timeout)
            r.raise_for_status()
            return r.json()
        except requests.RequestException as exc:
            raise ShellyError(str(exc)) from exc

    def _note_state(self, is_on):
        with self._lock:
            if self._last_state is None or self._last_state != is_on:
                self._last_state = is_on
                self._changed_at = time.time()
            return self._changed_at

    def status(self):
        s = self._call("Switch.GetStatus", {"id": self.switch_id})
        try:
            is_on = bool(s["output"])
            changed_at = self._note_state(is_on)
            return {
                "on": is_on,
                "power_w": round(float(s["apower"]), 1),
                "voltage_v": round(float(s["voltage"]), 1),
                "current_a": round(float(s["current"]), 3),
                "temperature_c": round(float(s["temperature"]["tC"]), 1),
                "energy_wh": round(float(s["aenergy"]["total"]), 3),
                "for_seconds": max(0.0, time.time() - changed_at),
                # Origine du dernier changement : distingue un allumage
                # humain d'un declenchement du programme interne.
                "source": s.get("source"),
                "host": self.host,
            }
        except (KeyError, TypeError, ValueError) as exc:
            raise ShellyError(f"reponse inattendue de la prise: {exc}") from exc

    def set(self, on):
        self._call("Switch.Set",
                   {"id": self.switch_id, "on": "true" if on else "false"})
        return self.status()

    def toggle(self):
        self._call("Switch.Toggle", {"id": self.switch_id})
        return self.status()
