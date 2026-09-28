"""Protocole RPC de la Shelly Plug M Gen 3, tel que le backend l'utilise."""
from flask import Blueprint, jsonify, request

from .world import truthy


def make_blueprint(world):
    bp = Blueprint("rpc", __name__)

    def dispatch(method, params):
        if method == "Switch.GetStatus":
            return world.switch_status()
        if method == "Switch.Set":
            return world.switch(truthy(params.get("on")), "HTTP_in")
        if method == "Switch.Toggle":
            return world.switch(not world.on, "HTTP_in")
        if method == "Shelly.GetStatus":
            return {"switch:0": world.switch_status(), "sys": world.sys_status()}
        if method == "Schedule.Create":
            return world.schedule_create(params)
        if method == "Schedule.Delete":
            try:
                return world.schedule_delete(int(params.get("id")))
            except (TypeError, ValueError):
                return None
        if method == "Schedule.List":
            return world.schedule_list()
        return None

    @bp.before_request
    def unplugged():
        # Prise hors reseau : le backend doit tomber sur une erreur, comme
        # avec la vraie quand le WiFi decroche.
        if world.offline:
            return jsonify({"error": "prise simulee hors reseau"}), 503

    @bp.get("/rpc/<method>")
    def rpc_get(method):
        result = dispatch(method, request.args.to_dict())
        if result is None:
            return jsonify({"code": 404, "message": f"No handler for {method}"}), 404
        return jsonify(result)

    @bp.post("/rpc")
    def rpc_post():
        body = request.get_json(force=True, silent=True) or {}
        result = dispatch(body.get("method"), body.get("params") or {})
        if result is None:
            return jsonify({"id": body.get("id"), "src": "pepperbox-simulator",
                            "error": {"code": 404, "message": "not found"}})
        return jsonify({"id": body.get("id"), "src": "pepperbox-simulator",
                        "result": result})

    @bp.get("/shelly")
    def identity():
        return jsonify({"id": "pepperbox-simulator", "model": "SIMULATED",
                        "gen": 3, "app": "PlugMG3", "auth_en": False})

    return bp
