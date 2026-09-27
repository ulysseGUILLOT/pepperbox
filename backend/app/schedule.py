"""Programme d'allumage automatique.

Le reglage vit en base ; c'est l'ordonnanceur interne de la prise qui
l'execute, de sorte que la lampe garde son cycle meme serveur eteint.
"""
import re

from .shelly import ShellyError

KEY = "schedule"
IDS_KEY = "shelly_schedule_ids"

DEFAULT = {"enabled": True, "on_time": "11:00", "off_time": "23:00"}

_HHMM = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


class InvalidSchedule(ValueError):
    pass


def parse(payload):
    """Valide une charge utile entrante et renvoie un programme normalise."""
    if not isinstance(payload, dict):
        raise InvalidSchedule("Le corps doit etre un objet.")

    enabled = payload.get("enabled", True)
    if not isinstance(enabled, bool):
        raise InvalidSchedule("'enabled' doit etre un booleen.")

    out = {"enabled": enabled}
    for field in ("on_time", "off_time"):
        value = payload.get(field)
        if not isinstance(value, str) or not _HHMM.match(value):
            raise InvalidSchedule(
                f"'{field}' doit etre une heure au format HH:MM (00:00 a 23:59).")
        out[field] = value

    if out["on_time"] == out["off_time"]:
        raise InvalidSchedule(
            "L'heure d'allumage et celle d'extinction doivent differer.")
    return out


def load(settings):
    stored = settings.get(KEY)
    return stored if isinstance(stored, dict) else dict(DEFAULT)


def _minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def should_be_on(schedule, now):
    """La lampe doit-elle etre allumee a cet instant ? Gere une fenetre qui
    franchit minuit (par exemple 22:00 -> 06:00)."""
    start = _minutes(schedule["on_time"])
    end = _minutes(schedule["off_time"])
    current = now.hour * 60 + now.minute
    if start < end:
        return start <= current < end
    return current >= start or current < end


def apply(plug, settings, schedule):
    """Remplace les programmes poses par l'application sur la prise.

    Seuls les identifiants que nous avons enregistres sont supprimes : un
    programme cree depuis l'application Shelly n'est pas efface.
    """
    for job_id in settings.get(IDS_KEY, []) or []:
        try:
            plug.schedule_delete(job_id)
        except ShellyError:
            pass  # deja absent, ou prise remise a zero

    ids = []
    if schedule["enabled"]:
        for field, state in (("on_time", True), ("off_time", False)):
            h, m = schedule[field].split(":")
            ids.append(plug.schedule_create(f"0 {int(m)} {int(h)} * * *", state))

    settings.set(IDS_KEY, ids)
    return ids
