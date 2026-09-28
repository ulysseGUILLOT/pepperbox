"""Le monde simule : une prise, sa lampe, et l'ordonnanceur interne de la prise.

Trois comportements du vrai materiel, constates sur la Shelly Plug M Gen 3 et
reproduits ici parce que le backend en depend :

1. un declenchement de programme rapporte l'origine "loopback" ;
2. il la reecrit meme si la lampe etait deja allumee a la main ;
3. la prise programme dans son heure locale, pas en UTC.

Toute nouvelle surprise du vrai materiel doit etre reportee ici, sinon le
simulateur rassure a tort.
"""
import os
import threading
import time
from collections import deque
from datetime import datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo(os.getenv("LOCAL_TZ", "Europe/Paris"))
LAMP_WATTS = 130.0
MAINS_VOLTS = 230.0

SOURCE_LABELS = {
    "loopback": "programme de la prise",
    "button": "bouton de la prise",
    "HTTP_in": "serveur Pepperbox",
    "init": "mise sous tension",
}


class Clock:
    """Horloge du monde. Reelle pour l'instant ; c'est ici que se branchera
    le temps accelere."""

    def now(self):
        return datetime.now(TZ)

    def epoch(self):
        return time.time()


class World:
    def __init__(self, clock=None):
        self.clock = clock or Clock()
        self._lock = threading.RLock()

        self.on = False
        self.source = "init"
        self.energy_wh = 0.0
        self.offline = False

        self.jobs = {}
        self._next_job_id = 1
        self._rev = 0

        self.events = deque(maxlen=200)
        self._energy_mark = self.clock.epoch()
        self._tick_mark = int(self.clock.epoch())
        self.started = self.clock.epoch()
        self.log("systeme", "Simulateur démarré")

    # ---- journal ----

    def log(self, kind, text):
        with self._lock:
            self.events.appendleft({
                "at": self.clock.now().strftime("%H:%M:%S"),
                "kind": kind,
                "text": text,
            })

    # ---- relais ----

    def _advance_energy(self):
        now = self.clock.epoch()
        if self.on:
            self.energy_wh += LAMP_WATTS * (now - self._energy_mark) / 3600
        self._energy_mark = now

    def switch(self, on, source):
        with self._lock:
            self._advance_energy()
            was_on = self.on
            self.on = bool(on)
            self.source = source
            origin = SOURCE_LABELS.get(source, source)
            if was_on != self.on:
                self.log("lampe", f"{'Allumée' if self.on else 'Éteinte'} par : {origin}")
            elif source == "loopback":
                self.log("lampe", "Programme déclenché sur une lampe déjà "
                                  f"{'allumée' if self.on else 'éteinte'} : "
                                  "l'origine est réécrite en loopback")
            return {"was_on": was_on}

    def switch_status(self):
        with self._lock:
            self._advance_energy()
            return {
                "id": 0,
                "source": self.source,
                "output": self.on,
                "apower": LAMP_WATTS if self.on else 0.0,
                "voltage": MAINS_VOLTS,
                "current": round(LAMP_WATTS / MAINS_VOLTS, 3) if self.on else 0.0,
                "freq": 50.0,
                "aenergy": {"total": round(self.energy_wh, 3)},
                "temperature": {"tC": 38.0, "tF": 100.4},
            }

    def sys_status(self):
        now = self.clock.now()
        return {
            "time": now.strftime("%H:%M"),
            "unixtime": int(self.clock.epoch()),
            "utc_offset": int(now.utcoffset().total_seconds()),
            "uptime": int(self.clock.epoch() - self.started),
        }

    # ---- programmes ----

    def schedule_create(self, params):
        with self._lock:
            job_id = self._next_job_id
            self._next_job_id += 1
            self._rev += 1
            self.jobs[job_id] = {
                "id": job_id,
                "enable": bool(params.get("enable", True)),
                "timespec": str(params.get("timespec", "")),
                "calls": params.get("calls") or [],
            }
            self.log("programme", f"Programme {job_id} posé : {describe(self.jobs[job_id])}")
            return {"id": job_id, "rev": self._rev}

    def schedule_delete(self, job_id):
        with self._lock:
            if job_id not in self.jobs:
                return None
            del self.jobs[job_id]
            self._rev += 1
            self.log("programme", f"Programme {job_id} retiré")
            return {"rev": self._rev}

    def schedule_list(self):
        with self._lock:
            return {"jobs": list(self.jobs.values()), "rev": self._rev}

    def tick(self):
        """Execute les programmes arrives a echeance depuis le dernier passage."""
        now = int(self.clock.epoch())
        with self._lock:
            start = max(self._tick_mark + 1, now - 120)   # rattrapage borne
            self._tick_mark = now
            for second in range(start, now + 1):
                moment = datetime.fromtimestamp(second, TZ)
                for job in list(self.jobs.values()):
                    if job["enable"] and matches(job["timespec"], moment):
                        self._run(job)

    def _run(self, job):
        for call in job["calls"]:
            if call.get("method") == "Switch.Set":
                self.switch(truthy((call.get("params") or {}).get("on")), "loopback")

    # ---- vue d'ensemble pour l'interface ----

    def snapshot(self):
        with self._lock:
            status = self.switch_status()
            return {
                "time": self.clock.now().strftime("%H:%M:%S"),
                "lamp": {
                    "on": self.on,
                    "source": self.source,
                    "source_label": SOURCE_LABELS.get(self.source, self.source),
                    "power_w": status["apower"],
                    "energy_wh": status["aenergy"]["total"],
                },
                "offline": self.offline,
                "jobs": [{"id": j["id"], "enabled": j["enable"],
                          "text": describe(j)} for j in self.jobs.values()],
                "events": list(self.events)[:40],
            }


def truthy(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("true", "1", "on")


def matches(timespec, moment):
    """Cron a six champs de la prise : seconde minute heure jour mois jour-semaine.
    Seuls les trois premiers sont interpretes ; le backend n'emet que des
    declenchements quotidiens."""
    fields = timespec.split()
    if len(fields) != 6:
        return False
    for field, value in zip(fields[:3], (moment.second, moment.minute, moment.hour)):
        if field != "*" and (not field.isdigit() or int(field) != value):
            return False
    return True


def describe(job):
    fields = job["timespec"].split()
    try:
        at = f"{int(fields[2]):02d}:{int(fields[1]):02d}"
        if int(fields[0]):
            at += f":{int(fields[0]):02d}"
    except (IndexError, ValueError):
        at = job["timespec"]
    actions = []
    for call in job["calls"]:
        if call.get("method") == "Switch.Set":
            on = truthy((call.get("params") or {}).get("on"))
            actions.append("allumer" if on else "éteindre")
        else:
            actions.append(call.get("method", "?"))
    return f"{at} → {', '.join(actions) or 'rien'}"
