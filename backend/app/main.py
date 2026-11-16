import logging
import math
import time

from flask import Flask, jsonify, request

from . import box as box_
from . import preferences as prefs
from . import presence as pres
from . import schedule as sched
from .clock import now_local
from .config import Config
from .db import Climate, Settings
from .ratelimit import RateLimiter, client_ip
from .shelly import ShellyError, ShellyPlug
from .supervisor import Supervisor


def create_app():
    # Sans cela, les decisions du superviseur (niveau INFO) n'apparaissent
    # nulle part : une automatisation qui agit seule doit etre tracable.
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    app = Flask(__name__)
    app.config.from_object(Config)

    lamp = ShellyPlug(
        host=app.config["SHELLY_HOST"],
        switch_id=app.config["SHELLY_SWITCH_ID"],
        timeout=app.config["SHELLY_TIMEOUT"],
    )
    settings = Settings(app.config["DB_PATH"])
    supervisor = Supervisor(lamp, settings,
                            interval=app.config["PRESENCE_INTERVAL"])
    limiter = RateLimiter(max_hits=app.config["PRESENCE_RATE_LIMIT"], window=60.0)
    box = box_.Box(timeout=app.config["BOX_TIMEOUT"])
    climate = Climate(app.config["DB_PATH"],
                      retention_days=app.config["CLIMATE_RETENTION_DAYS"])

    current = sched.load(settings)
    settings.set(sched.KEY, current)   # materialise le defaut au premier lancement
    try:
        sched.apply(lamp, settings, current)
    except ShellyError as exc:
        app.logger.warning("programme non applique au demarrage: %s", exc)

    settings.set(pres.KEY, pres.load(settings))
    supervisor.start()

    def enrich(status):
        price = prefs.load(settings, app.config)["price_per_kwh"]
        return {
            **status,
            "price_per_kwh": price,
            "cost_eur": status["energy_wh"] / 1000 * price,
            "presence": supervisor.snapshot(),
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

    @app.errorhandler(prefs.InvalidPreference)
    def _invalid_preference(exc):
        return jsonify({"error": "parametre_invalide", "message": str(exc)}), 400

    @app.errorhandler(pres.InvalidPresence)
    def _invalid_presence(exc):
        return jsonify({"error": "presence_invalide", "message": str(exc)}), 400

    @app.errorhandler(box_.InvalidHeartbeat)
    def _invalid_heartbeat(exc):
        return jsonify({"error": "battement_invalide", "message": str(exc)}), 400

    # ---- lampe ----

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
        status = lamp.set(payload["on"])
        supervisor.mark_manual(status["on"])
        return jsonify(enrich(status))

    @app.post("/api/lamp/toggle")
    def toggle_lamp():
        status = lamp.toggle()
        supervisor.mark_manual(status["on"])
        return jsonify(enrich(status))

    # ---- programme ----

    @app.get("/api/schedule")
    def get_schedule():
        return jsonify(sched.load(settings))

    @app.put("/api/schedule")
    def put_schedule():
        new = sched.parse(request.get_json(silent=True))
        sched.apply(lamp, settings, new)
        settings.set(sched.KEY, new)
        if new["enabled"]:
            # La priorite a la presence prime sur l'application immediate :
            # enregistrer un horaire ne doit pas rallumer la lampe alors
            # qu'on est chez soi en plage de silence.
            desired = sched.should_be_on(new, now_local())
            if desired and supervisor.is_overriding():
                desired = False
            lamp.set(desired)
            supervisor.mark_auto(desired)
        supervisor.nudge()
        return jsonify(new)

    # ---- parametres ----

    @app.get("/api/settings")
    def get_settings():
        return jsonify(prefs.load(settings, app.config))

    @app.put("/api/settings")
    def put_settings():
        changes = prefs.parse(request.get_json(silent=True))
        return jsonify(prefs.save(settings, app.config, changes))

    # ---- carte ESP32 de la box (reseau local uniquement) ----

    @app.get("/api/box")
    def get_box():
        return jsonify(box.snapshot())

    @app.post("/api/box/heartbeat")
    def box_heartbeat():
        beat = box_.parse(request.get_json(silent=True))
        box.record(beat)
        # Sans capteur, la carte bat quand meme : rien a historiser.
        if beat["temperature_c"] is not None or beat["humidity_pct"] is not None:
            climate.record(time.time(), beat["temperature_c"], beat["humidity_pct"])
        return jsonify(box.snapshot())

    # Un an au plus : c'est la duree de conservation (CLIMATE_RETENTION_DAYS),
    # au-dela la requete ne trouverait rien de plus.
    CLIMATE_MAX_HOURS = 24 * 366
    # Points vises, quelle que soit la duree : assez pour une courbe nette.
    CLIMATE_POINTS = 288
    # Tranches qui divisent la journee. Une tranche de 30 h, celle qu'aurait
    # un an en 288 points, melangerait jour et nuit dans des proportions
    # changeantes d'un point a l'autre : la courbe zigzaguerait sans raison.
    CLIMATE_BUCKETS = (60, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400)

    # Finesse demandee par le client : un apercu, ou la fenetre zoomee d'un
    # graphique, qui en veut assez pour descendre a la mesure brute.
    CLIMATE_MAX_POINTS = 3000

    @app.get("/api/climate")
    def get_climate():
        """Une fenetre de l'historique, a la resolution de sa duree.

        ?hours=24 pour les dernieres heures, ou ?from=&to= (secondes epoch)
        pour la fenetre qu'affiche un graphique apres un zoom. ?points= regle
        la finesse ; une fenetre assez courte rend la mesure a la minute.
        """
        now = time.time()
        try:
            points = int(request.args.get("points", CLIMATE_POINTS))
            if "from" in request.args:
                start = float(request.args["from"])
                end = float(request.args.get("to", now))
            else:
                hours = int(request.args.get("hours", "24"))
                start, end = now - hours * 3600, now
        except ValueError:
            start = end = points = None
        if (start is None or not math.isfinite(start) or not math.isfinite(end)
                or not 60 <= end - start <= CLIMATE_MAX_HOURS * 3600
                or not 10 <= points <= CLIMATE_MAX_POINTS):
            return jsonify({
                "error": "requete_invalide",
                "message": "Fenetre de 1 minute a un an ('hours', ou 'from' et 'to' "
                           f"en secondes epoch), 'points' entre 10 et {CLIMATE_MAX_POINTS}.",
            }), 400
        # La tranche la plus proche de celle qui donnerait `points` points :
        # 5 min sur 24 h a 288 points, la minute en zoomant. Jamais moins
        # d'une minute, le rythme des battements.
        target = (end - start) / points
        bucket = min(CLIMATE_BUCKETS, key=lambda b: abs(math.log(b / target)))
        return jsonify({
            "from": start,
            "to": end,
            "bucket_s": bucket,
            "cold_c": app.config["CLIMATE_COLD_C"],
            "hot_c": app.config["CLIMATE_HOT_C"],
            "points": climate.series(start, bucket, end),
        })

    # ---- presence (reseau local uniquement) ----

    @app.get("/api/presence")
    def get_presence():
        return jsonify(supervisor.snapshot())

    @app.put("/api/presence")
    def put_presence():
        new = pres.parse(request.get_json(silent=True))
        settings.set(pres.KEY, new)
        supervisor.nudge()
        return jsonify(supervisor.snapshot())

    @app.post("/api/presence/token")
    def new_presence_token():
        """Renvoie le jeton en clair une seule fois ; seule son empreinte
        est conservee."""
        return jsonify({"token": pres.issue_token(settings)})

    # ---- presence : unique route exposee sur Internet ----

    @app.post("/api/presence/event")
    def presence_event():
        if not limiter.allow(client_ip(request)):
            return jsonify({"error": "trop_de_requetes"}), 429

        token = pres.bearer_from(request.headers.get("Authorization"))
        if not pres.token_matches(settings, token):
            # Aucune precision : ne pas indiquer si c'est le jeton ou le corps.
            return jsonify({"error": "non_autorise"}), 401

        event = pres.parse_event(request.get_json(silent=True))
        supervisor.record(event["home"], event["at"])
        state = supervisor.snapshot()
        return jsonify({"home": state["home"], "overriding": state["overriding"]})

    return app


app = create_app()
