import os
import threading
import time

from flask import Flask, jsonify, request, send_from_directory

from .phone import Phone
from .rpc import make_blueprint
from .world import World


def create_app():
    app = Flask(__name__, static_folder="static", static_url_path="/static")
    world = World()
    phone = Phone(os.getenv("PEPPERBOX_API", "http://api:8000"))

    app.register_blueprint(make_blueprint(world))

    def loop():
        while True:
            try:
                world.tick()
            except Exception:                       # noqa: BLE001
                app.logger.exception("cycle du simulateur interrompu")
            time.sleep(0.5)

    threading.Thread(target=loop, daemon=True, name="world").start()

    # ---- interface et commandes du simulateur ----

    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/sim/state")
    def state():
        return jsonify({**world.snapshot(), "phone": phone.last})

    @app.post("/sim/button")
    def button():
        world.switch(not world.on, "button")
        return jsonify(world.snapshot())

    @app.post("/sim/offline")
    def offline():
        payload = request.get_json(silent=True) or {}
        world.offline = bool(payload.get("offline"))
        world.log("reseau", "Prise coupée du réseau" if world.offline
                  else "Prise de retour sur le réseau")
        return jsonify(world.snapshot())

    @app.post("/sim/presence")
    def presence():
        payload = request.get_json(silent=True) or {}
        state_ = payload.get("state")
        if state_ not in ("home", "away"):
            return jsonify({"error": "state doit valoir home ou away"}), 400
        result = phone.declare(state_)
        label = "J'arrive" if state_ == "home" else "Je pars"
        world.log("telephone", f"{label} : "
                  + ("reçu par le serveur" if result["ok"] else "refusé par le serveur"))
        return jsonify(result)

    return app
