"""Fausse prise Shelly Gen 3, pour developper sans toucher a la vraie lampe.

Ne reproduit que ce que le backend utilise : l'etat du relais, et
l'enregistrement des programmes (qui ne sont pas executes).
"""
import time

from flask import Flask, jsonify, request

app = Flask(__name__)

STARTED = time.time()
state = {"on": False, "source": "init", "energy_wh": 0.0, "last": time.time()}
jobs = {}
next_job_id = 1


def _advance():
    """Fait tourner le compteur d'energie : 130 W quand la lampe est allumee."""
    now = time.time()
    if state["on"]:
        state["energy_wh"] += 130.0 * (now - state["last"]) / 3600
    state["last"] = now


def _switch_status():
    _advance()
    on = state["on"]
    return {
        "id": 0, "source": state["source"], "output": on,
        "apower": 130.0 if on else 0.0, "voltage": 230.0,
        "current": 0.565 if on else 0.0, "freq": 50.0,
        "aenergy": {"total": round(state["energy_wh"], 3)},
        "temperature": {"tC": 38.0, "tF": 100.4},
    }


def _set(on, source):
    _advance()
    was_on = state["on"]
    state.update(on=on, source=source)
    return {"was_on": was_on}


def _dispatch(method, params, source):
    global next_job_id
    if method == "Switch.GetStatus":
        return _switch_status()
    if method == "Switch.Set":
        return _set(str(params.get("on")).lower() == "true", source)
    if method == "Switch.Toggle":
        return _set(not state["on"], source)
    if method == "Shelly.GetStatus":
        local = time.localtime()
        return {"switch:0": _switch_status(),
                "sys": {"time": time.strftime("%H:%M", local),
                        "unixtime": int(time.time()),
                        "utc_offset": local.tm_gmtoff,
                        "uptime": int(time.time() - STARTED)}}
    if method == "Schedule.Create":
        job_id, next_job_id = next_job_id, next_job_id + 1
        jobs[job_id] = {"id": job_id, **params}
        return {"id": job_id, "rev": job_id}
    if method == "Schedule.Delete":
        if int(params.get("id", -1)) not in jobs:
            return None
        del jobs[int(params["id"])]
        return {"rev": len(jobs)}
    if method == "Schedule.List":
        return {"jobs": list(jobs.values()), "rev": len(jobs)}
    return None


@app.get("/rpc/<method>")
def rpc_get(method):
    result = _dispatch(method, request.args.to_dict(), "HTTP_in")
    if result is None:
        return jsonify({"code": 404, "message": f"No handler for {method}"}), 404
    return jsonify(result)


@app.post("/rpc")
def rpc_post():
    body = request.get_json(force=True)
    result = _dispatch(body.get("method"), body.get("params") or {}, "HTTP_in")
    if result is None:
        return jsonify({"id": body.get("id"),
                        "error": {"code": 404, "message": "not found"}})
    return jsonify({"id": body.get("id"), "src": "shelly-mock", "result": result})


@app.get("/shelly")
def shelly():
    return jsonify({"id": "shelly-mock", "model": "MOCK", "gen": 3,
                    "app": "PlugMG3", "auth_en": False})
