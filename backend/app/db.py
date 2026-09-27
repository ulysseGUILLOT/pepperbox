"""Stockage des reglages en SQLite.

Table unique cle/valeur JSON : chaque reglage a venir (arrosage, seuils de
temperature, calendrier de germination) s'ajoute sans migration de schema.
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
