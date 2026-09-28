"""Etranglement en memoire, par adresse IP."""
import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, max_hits=10, window=60.0):
        self._max = max_hits
        self._window = window
        self._hits = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key):
        now = time.time()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self._window:
                hits.popleft()
            if len(hits) >= self._max:
                return False
            hits.append(now)
            # Evite que la table enfle avec des IP vues une seule fois.
            if len(self._hits) > 1000:
                for k in [k for k, v in self._hits.items() if not v]:
                    del self._hits[k]
            return True


def client_ip(request):
    """Apache est le seul a parler au backend : la derniere entree de
    X-Forwarded-For est l'adresse qu'il a constatee."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.remote_addr or "?"
