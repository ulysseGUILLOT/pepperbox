# Pepperbox

Potager connecté de piments. Première étape : commander la lampe de
croissance branchée sur une prise Shelly Plug M Gen 3.

## Architecture

    navigateur → nginx (web) ─┬─ statique : dashboard React
                              └─ /api/*  → Flask (api) → RPC Shelly 192.168.1.102

Deux conteneurs. `web` est le seul publié ; `api` n'est joignable que depuis le
réseau interne de la stack. La prise n'est accessible que depuis cette VM, qui
est la seule machine sur le LAN 192.168.1.0/24.

## Démarrer

    cp .env.example .env
    docker compose up -d --build

Tableau de bord : https://pepperbox.ulysseguillot.fr (ou http://localhost:8080 sur la VM).

Pour restreindre l'accès à la VM seule, mettre `BIND_ADDR=127.0.0.1` dans `.env`.

## API

| Méthode | Route              | Effet                                  |
|---------|--------------------|----------------------------------------|
| GET     | `/api/health`      | Vivacité du backend                    |
| GET     | `/api/lamp`        | État + mesures électriques             |
| POST    | `/api/lamp`        | `{"on": true}` / `{"on": false}`       |
| POST    | `/api/lamp/toggle` | Bascule                                |
| GET     | `/api/schedule`    | Programme d'allumage automatique       |
| PUT     | `/api/schedule`    | `{"enabled":true,"on_time":"11:00","off_time":"23:00"}` |

Réponse de `/api/lamp` :

    {"on": false, "power_w": 0.0, "voltage_v": 242.1, "current_a": 0.0,
     "temperature_c": 39.2, "energy_wh": 3.731, "for_seconds": 128.4,
     "host": "192.168.1.102"}

Si la prise ne répond pas : `502` avec `{"error": "prise_injoignable"}`.

## Développement

Le backend tourne dans son conteneur, le front en local avec rechargement :

    docker compose up -d api
    cd frontend && npm install && npm run dev

Vite proxifie `/api` vers `http://localhost:8000`, donc exposer le port de `api`
dans un override compose si besoin.

## Programme automatique

Le reglage est stocke en SQLite (`/data/pepperbox.db`, volume `state`), dans une
table cle/valeur JSON prevue pour accueillir les reglages suivants sans
migration. Par defaut : allumage 11:00, extinction 23:00.

C'est **l'ordonnanceur interne de la prise** qui execute le cycle, pas le
serveur : la lampe garde sa photoperiode meme si la VM est eteinte. Le backend
se contente de traduire le reglage en `Schedule.Create` sur la prise, et
realigne la prise au demarrage. Une fenetre franchissant minuit (22:00 ->
06:00) est acceptee.

Enregistrer un programme actif applique immediatement l'etat qu'il impose,
sans attendre la prochaine borne.

## Notes

- `api` tourne avec un seul worker gunicorn : la durée « allumée depuis » est
  gardée en mémoire du processus et repart à zéro au redémarrage.
- Les polices IBM Plex viennent de Google Fonts ; hors ligne, le navigateur
  retombe sur la pile système.
