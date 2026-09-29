"""Parametres reglables depuis la page Parametres.

Ajouter un parametre = ajouter une entree a FIELDS. La validation, la valeur
par defaut, le stockage et l'API en decoulent ; rien d'autre a ecrire cote
serveur.
"""

KEY = "preferences"


class InvalidPreference(ValueError):
    pass


# nom -> type, bornes, et cle de Config qui fournit la valeur par defaut.
FIELDS = {
    "price_per_kwh": {
        "type": float,
        "min": 0.0,
        "max": 5.0,
        "default_from": "PRICE_PER_KWH",
    },
}


def defaults(config):
    return {name: spec["type"](config[spec["default_from"]])
            for name, spec in FIELDS.items()}


def load(settings, config):
    """Valeurs courantes : celles de la base, completees par les defauts.
    Un parametre ajoute plus tard apparait donc sans migration."""
    stored = settings.get(KEY)
    values = defaults(config)
    if isinstance(stored, dict):
        values.update({k: v for k, v in stored.items() if k in FIELDS})
    return values


def parse(payload):
    """Valide une mise a jour partielle."""
    if not isinstance(payload, dict) or not payload:
        raise InvalidPreference("Le corps doit etre un objet non vide.")

    out = {}
    for name, value in payload.items():
        spec = FIELDS.get(name)
        if spec is None:
            raise InvalidPreference(f"Parametre inconnu : '{name}'.")
        # bool est un sous-type de int : True passerait pour le nombre 1.
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise InvalidPreference(f"'{name}' doit etre un nombre.")
        value = spec["type"](value)
        if not spec["min"] <= value <= spec["max"]:
            raise InvalidPreference(
                f"'{name}' doit etre compris entre {spec['min']} et {spec['max']}.")
        out[name] = value
    return out


def save(settings, config, changes):
    values = load(settings, config)
    values.update(changes)
    settings.set(KEY, values)
    return values
