"""Stockage en SQLite : les reglages, et l'historique du climat de la box.

Reglages : table unique cle/valeur JSON, chaque reglage a venir (arrosage,
seuils de temperature, calendrier de germination) s'ajoute sans migration de
schema. Climat : une ligne par battement de la carte, soit une par minute.
"""
import json
import sqlite3
import threading
from datetime import datetime, timezone

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


class Settings:
    def __init__(self, path):
        self._path = path
        self._lock = threading.Lock()
        with self._connect() as c:
            c.executescript(SCHEMA)

    def _connect(self):
        c = sqlite3.connect(self._path, timeout=5.0)
        c.row_factory = sqlite3.Row
        # Le mode WAL evite que le fil de fond et une requete HTTP se bloquent.
        c.execute("PRAGMA journal_mode=WAL")
        return c

    def get(self, key, default=None):
        with self._connect() as c:
            row = c.execute("SELECT value FROM settings WHERE key = ?",
                            (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def set(self, key, value):
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with self._lock, self._connect() as c:
            c.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, "
                "updated_at = excluded.updated_at",
                (key, json.dumps(value), now))
        return value

    def all(self):
        with self._connect() as c:
            rows = c.execute("SELECT key, value, updated_at FROM settings").fetchall()
        return {r["key"]: json.loads(r["value"]) for r in rows}


CLIMATE_SCHEMA = """
CREATE TABLE IF NOT EXISTS climate (
    at            REAL NOT NULL,
    temperature_c REAL,
    humidity_pct  REAL
);
CREATE INDEX IF NOT EXISTS climate_at ON climate (at);
"""


class Climate:
    """Historique des mesures de la box. `at` en secondes epoch : les
    regroupements par tranche se font par simple division."""

    # Purge au plus une fois par heure : inutile a chaque battement.
    PRUNE_EVERY = 3600

    def __init__(self, path, retention_days):
        self._path = path
        self._retention = retention_days * 86400
        self._lock = threading.Lock()
        self._pruned_at = 0.0
        with self._connect() as c:
            c.executescript(CLIMATE_SCHEMA)

    def _connect(self):
        c = sqlite3.connect(self._path, timeout=5.0)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        return c

    def record(self, at, temperature_c, humidity_pct):
        with self._lock, self._connect() as c:
            c.execute("INSERT INTO climate (at, temperature_c, humidity_pct) "
                      "VALUES (?, ?, ?)", (at, temperature_c, humidity_pct))
            if at - self._pruned_at >= self.PRUNE_EVERY:
                c.execute("DELETE FROM climate WHERE at < ?", (at - self._retention,))
                self._pruned_at = at

    def series(self, since, bucket):
        """Moyennes par tranche de `bucket` secondes depuis `since`. AVG
        ignore les NULL : une mesure manquante ne tire pas la moyenne a zero."""
        with self._connect() as c:
            rows = c.execute(
                "SELECT CAST(at / ? AS INTEGER) * ? AS t, "
                "AVG(temperature_c) AS temperature_c, AVG(humidity_pct) AS humidity_pct "
                "FROM climate WHERE at >= ? GROUP BY CAST(at / ? AS INTEGER) ORDER BY t",
                (bucket, bucket, since, bucket)).fetchall()
        return [{
            "t": int(r["t"]),
            "temperature_c": None if r["temperature_c"] is None else round(r["temperature_c"], 2),
            "humidity_pct": None if r["humidity_pct"] is None else round(r["humidity_pct"], 1),
        } for r in rows]
