from datetime import datetime

from flask import Flask, jsonify, request

from . import schedule as sched
from .config import Config
from .db import Settings
from .shelly import ShellyError, ShellyPlug


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    lamp = ShellyPlug(
        host=app.config["SHELLY_HOST"],
        switch_id=app.config["SHELLY_SWITCH_ID"],
        timeout=app.config["SHELLY_TIMEOUT"],
    )
    settings = Settings(app.config["DB_PATH"])

    # Au demarrage, on realigne la prise sur le reglage enregistre : elle a pu
    # etre remise a zero, ou le programme modifie depuis l'application Shelly.
    current = sched.load(settings)
    settings.set(sched.KEY, current)   # materialise le defaut au premier lancement
    try:
        sched.apply(lamp, settings, current)
    except ShellyError as exc:
        app.logger.warning("programme non applique au demarrage: %s", exc)

    def enrich(status):
        price = app.config["PRICE_PER_KWH"]
        return {
            **status,
            "price_per_kwh": price,
            "cost_eur": status["energy_wh"] / 1000 * price,
        }

    @app.errorhandler(ShellyError)
    def _unreachable(exc):
        return jsonify({
            "error": "prise_injoignable",
            "message": "La prise ne repond pas.",
            "detail": str(exc),
        }), 502

    @app.errorhandler(sched.InvalidSchedule)
    def _invalid_schedule(exc):
        return jsonify({"error": "programme_invalide", "message": str(exc)}), 400

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.get("/api/lamp")
    def get_lamp():
        return jsonify(enrich(lamp.status()))

    @app.post("/api/lamp")
    def set_lamp():
        payload = request.get_json(silent=True) or {}
        if "on" not in payload or not isinstance(payload["on"], bool):
            return jsonify({
                "error": "requete_invalide",
                "message": "Le corps doit contenir un booleen 'on'.",
            }), 400
        return jsonify(enrich(lamp.set(payload["on"])))

    @app.post("/api/lamp/toggle")
    def toggle_lamp():
        return jsonify(enrich(lamp.toggle()))

    @app.get("/api/schedule")
    def get_schedule():
        return jsonify(sched.load(settings))

    @app.put("/api/schedule")
    def put_schedule():
        new = sched.parse(request.get_json(silent=True))
        sched.apply(lamp, settings, new)
        settings.set(sched.KEY, new)

        # Le programme ne se declenche qu'aux bornes : on met la lampe tout de
        # suite dans l'etat qu'il impose, sinon il faut attendre le prochain
        # basculement pour que l'enregistrement produise un effet visible.
        if new["enabled"]:
            lamp.set(sched.should_be_on(new, datetime.now()))

        return jsonify(new)

    return app


app = create_app()
