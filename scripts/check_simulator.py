#!/usr/bin/env python3
"""Rejoue contre le simulateur les scenarios qui ont deja casse en production.

    docker compose up -d --build
    python3 scripts/check_simulator.py

Dure environ six minutes : le temps est reel, et un programme ne se declenche
qu'a la minute pleine. Le temps accelere (phase 2) ramenera cela a quelques
secondes et permettra de le lancer dans le CI.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta

API = "http://127.0.0.1:8080/api"
SIM = "http://127.0.0.1:8090/sim"
results = []


def http(method, url, body=None):
    req = urllib.request.Request(
        url, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def lamp():
    return http("GET", f"{API}/lamp")[1]


def check(label, ok, detail=""):
    results.append(ok)
    print(f"  [{'OK' if ok else 'ECHEC'}] {label}" + (f" — {detail}" if detail else ""))


def hhmm(moment):
    return moment.strftime("%H:%M")


def next_minute(margin=8):
    """Prochaine minute pleine, assez loin pour que le reglage soit pose avant."""
    now = datetime.now()
    target = now.replace(second=0, microsecond=0) + timedelta(minutes=1)
    if (target - now).total_seconds() < margin:
        target += timedelta(minutes=1)
    return target


def wait_until(moment, extra=0):
    delay = (moment - datetime.now()).total_seconds() + extra
    if delay > 0:
        time.sleep(delay)


def watch(seconds, step=2):
    """Releve les etats successifs de la lampe pendant une duree."""
    seen, end = [], time.time() + seconds
    while time.time() < end:
        s = lamp()
        cur = (s["on"], s["source"])
        if not seen or seen[-1] != cur:
            seen.append(cur)
        time.sleep(step)
    return seen


def quiet_window_around_now():
    now = datetime.now()
    start = (now - timedelta(hours=1)).replace(minute=0)
    end = (now + timedelta(hours=2)).replace(minute=0)
    return hhmm(start), hhmm(end)


def main():
    code, first = http("GET", f"{API}/lamp")
    if code != 200 or "simulator" not in first.get("host", ""):
        sys.exit(f"refus : le backend ne parle pas au simulateur (host={first.get('host')})")

    print("1. Prise hors réseau")
    http("POST", f"{SIM}/offline", {"offline": True})
    code, body = http("GET", f"{API}/lamp")
    check("le tableau de bord signale la prise injoignable",
          code == 502 and body.get("error") == "prise_injoignable", f"HTTP {code}")
    http("POST", f"{SIM}/offline", {"offline": False})
    check("retour à la normale", http("GET", f"{API}/lamp")[0] == 200)

    print("2. Bouton physique de la prise")
    if lamp()["on"]:
        http("POST", f"{SIM}/button")
    http("POST", f"{SIM}/button")
    s = lamp()
    check("la lampe s'allume, origine « button »", s["on"] and s["source"] == "button",
          f"on={s['on']} source={s['source']}")
    http("POST", f"{SIM}/button")
    check("second appui : elle s'éteint", not lamp()["on"])

    print("3. Programme exécuté par la prise, absent")
    code, sent = http("POST", f"{SIM}/presence", {"state": "away"})
    check("« je pars » accepté par le serveur", sent.get("ok") is True, str(sent.get("detail")))
    t_on = next_minute()
    t_off = t_on + timedelta(minutes=1)
    http("PUT", f"{API}/schedule", {"enabled": True, "on_time": hhmm(t_on), "off_time": hhmm(t_off)})
    wait_until(t_on, extra=3)
    s = lamp()
    check(f"allumage à {hhmm(t_on)}, origine « loopback »",
          s["on"] and s["source"] == "loopback", f"on={s['on']} source={s['source']}")
    wait_until(t_off, extra=3)
    check(f"extinction à {hhmm(t_off)}", not lamp()["on"])

    print("4. Présent en plage de silence : allumage automatique supprimé")
    q_start, q_end = quiet_window_around_now()
    http("PUT", f"{API}/presence", {"enabled": True, "quiet_start": q_start, "quiet_end": q_end})
    http("POST", f"{SIM}/presence", {"state": "home"})
    t_on = next_minute()
    http("PUT", f"{API}/schedule", {"enabled": True, "on_time": hhmm(t_on),
                                    "off_time": hhmm(t_on + timedelta(minutes=20))})
    check("l'enregistrement ne rallume pas la lampe", not lamp()["on"])
    wait_until(t_on, extra=-1)
    seen = watch(45, step=1)
    check("allumée par le programme puis éteinte par la priorité",
          (True, "loopback") in seen and seen[-1][0] is False, f"états : {seen}")

    print("5. Allumage manuel conservé quand le programme déclenche (incident du 28/09)")
    t_on = next_minute(margin=50)      # laisse le temps au superviseur de voir le geste
    http("PUT", f"{API}/schedule", {"enabled": True, "on_time": hhmm(t_on),
                                    "off_time": hhmm(t_on + timedelta(minutes=20))})
    http("POST", f"{API}/lamp", {"on": True})
    check("allumage manuel depuis le tableau de bord", lamp()["on"])
    wait_until(t_on, extra=-1)
    seen = watch(45, step=1)
    check("l'origine passe en « loopback » et la lampe reste allumée",
          (True, "loopback") in seen and all(on for on, _ in seen), f"états : {seen}")

    # Retour aux reglages par defaut.
    http("POST", f"{API}/lamp", {"on": False})
    http("PUT", f"{API}/presence", {"enabled": True, "quiet_start": "20:00", "quiet_end": "11:00"})
    http("PUT", f"{API}/schedule", {"enabled": True, "on_time": "11:00", "off_time": "23:00"})
    http("POST", f"{SIM}/presence", {"state": "away"})

    print(f"\n{sum(results)} / {len(results)} vérifications réussies")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
