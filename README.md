# Pepperbox

Potager connecté de piments. Pilote la lampe de croissance, branchée sur une
prise Shelly Plug M Gen 3 : commande manuelle, programme horaire, et priorité à
la présence pour ne pas éclairer l'appartement le soir quand on y est.

## Architecture

    navigateur → Apache (TLS, filtrage LAN) → nginx (web) ─┬─ statique : React
                                                           └─ /api/* → Flask (api) → RPC Shelly

| Dossier | Contenu |
|---|---|
| `backend/` | API Flask, superviseur de présence, réglages SQLite |
| `frontend/` | Tableau de bord React (Vite), servi par nginx |
| `simulator/` | Box virtuelle : fausse prise, lampe, téléphone simulé |
| `scripts/` | Vérification des scénarios contre le simulateur |
| `deploy/` | Script de déploiement et vhosts Apache de la production |

Trois choix structurants :

- **Le programme horaire est exécuté par la prise**, pas par le serveur
  (`Schedule.Create`). La photopériode survit à un arrêt de la VM.
- **Les réglages vivent en SQLite** (`/data/pepperbox.db`, volume `state`),
  dans une table clé/valeur JSON qui accueille un nouveau réglage sans
  migration.
- **Les horaires sont en heure locale** (`LOCAL_TZ`). Le conteneur tourne en
  UTC ; toutes les décisions passent par `app/clock.py`.

## Développement

    cp .env.example .env
    docker compose up -d --build

| Adresse | Rôle |
|---|---|
| http://localhost:8080 | Tableau de bord Pepperbox |
| http://localhost:8090 | Simulateur : la box virtuelle et ses commandes |
| http://localhost:8001 | API seule, pour `npm run dev` |

`docker-compose.override.yml` est chargé automatiquement : le backend parle au
**simulateur**, jamais à la vraie prise. C'est voulu — la vraie est joignable
depuis un poste de dev, et une instance locale se battrait avec la production
pour la lampe en posant ses propres programmes sur la prise.

Front avec rechargement à chaud, le backend restant dans son conteneur :

    cd frontend && npm ci && npm run dev

### Simulateur

Il simule **au niveau du protocole de l'appareil** : le backend tourne tel
qu'en production, sans savoir qu'il parle à un faux. Depuis sa page on peut :

- voir la lampe s'allumer dans la box ;
- appuyer sur le bouton physique de la prise ;
- couper la prise du réseau ;
- déclarer « j'arrive » ou « je pars », comme le ferait le raccourci iOS ;
- lire les programmes posés sur la prise et le journal des événements.

Les programmes sont réellement exécutés, à l'heure locale. Trois comportements
du vrai matériel y sont reproduits parce que le backend en dépend (voir
`simulator/app/world.py`). Toute nouvelle surprise de la vraie prise doit y
être reportée, sinon le simulateur rassure à tort.

Vérification des scénarios, environ six minutes en temps réel :

    python3 scripts/check_simulator.py

## Déploiement

Chaque push sur `main` déclenche `.github/workflows/deploy.yml` :

1. **build** — les deux images sont construites pour `linux/arm64` et poussées
   sur `ghcr.io/ulysseguillot/pepperbox-{api,web}`. Rien n'est compilé sur la
   VM : deux vCPU ARM partagés avec le routeur et son VPN.
2. **deploy** — connexion SSH à la VM, qui tire les images et redémarre.

La clé SSH du CI est **bridée côté serveur** : `authorized_keys` lui impose
`deploy/deploy.sh` comme seule commande. Une fuite de cette clé permet de
redéployer, pas d'obtenir un shell.

    command="/home/freebox/pepperbox/deploy/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA… pepperbox-ci

Secret requis dans le dépôt : `DEPLOY_SSH_KEY` (clé privée correspondante).

Déploiement manuel, depuis la VM :

    cd ~/pepperbox && git pull --ff-only
    docker compose -p pepperbox -f docker-compose.yml -f docker-compose.prod.yml pull
    docker compose -p pepperbox -f docker-compose.yml -f docker-compose.prod.yml up -d

Revenir à une version antérieure : chaque image est aussi étiquetée par le SHA
du commit qui l'a produite.

## Exposition réseau

Les vhosts sont dans `deploy/apache/`. Tout est réservé au réseau local
(`Require ip 192.168.1.0/24`), à une exception près :

| Route | Accès | Rôle |
|---|---|---|
| `/api/presence/event` | Internet, jeton porteur | Le téléphone déclare arrivée et départ |
| tout le reste | réseau local | Tableau de bord et API |

Le retour de boucle NAT de la Freebox présente tous les appareils du LAN sous
l'adresse `192.168.1.254`.

## API

| Méthode | Route | Effet |
|---|---|---|
| GET | `/api/health` | Vivacité |
| GET | `/api/lamp` | État, mesures, coût estimé, présence |
| POST | `/api/lamp` | `{"on": true}` — geste manuel |
| POST | `/api/lamp/toggle` | Bascule — geste manuel |
| GET / PUT | `/api/schedule` | `{"enabled", "on_time", "off_time"}` |
| GET / PUT | `/api/presence` | `{"enabled", "quiet_start", "quiet_end"}` |
| GET / PUT | `/api/settings` | `{"price_per_kwh"}` — mise à jour partielle |
| POST | `/api/presence/token` | Crée le jeton, affiché une seule fois |
| POST | `/api/presence/event` | `{"state": "home"\|"away", "at": ISO 8601}` |

## Paramètres

La page `/parametres` regroupe ce qui se règle rarement : le tarif du kWh et le
jeton du raccourci iOS. Les valeurs vivent en base ; les variables
d'environnement n'en fournissent que la valeur initiale.

Ajouter un paramètre : une entrée dans `FIELDS` (`backend/app/preferences.py`)
suffit côté serveur — validation, valeur par défaut, stockage et API en
découlent — puis un champ dans `frontend/src/views/Settings.jsx`.

## Priorité à la présence

Pendant la plage de silence (20:00 → 11:00 par défaut), si le téléphone s'est
déclaré présent :

- un allumage **automatique** est supprimé, puis repris en fin de plage si le
  programme le demande encore ;
- un allumage **manuel** tient jusqu'à la prochaine extinction. Il est
  mémorisé côté serveur : le champ `source` de la prise ne suffit pas, son
  programme interne le réécrit en `loopback` à chaque borne.

### Raccourci iOS

Deux automatisations personnelles, *Arriver* et *Partir*, avec « Exécuter
immédiatement ». Chacune enchaîne :

1. **Date** (date actuelle) ;
2. **Formater la date**, format **ISO 8601**, avec l'option « Inclure
   l'heure ISO 8601 ». Le résultat porte le décalage horaire
   (`2026-09-29T11:36:00+02:00`). Ne pas utiliser de format personnalisé
   terminé par `'Z'` : l'action n'a pas de réglage de fuseau, l'heure locale
   serait étiquetée UTC et le serveur la refuserait ;
3. **Obtenir le contenu de l'URL** :

       URL      https://pepperbox.ulysseguillot.fr/api/presence/event
       Méthode  POST
       En-tête  Authorization: Bearer <jeton>
       Corps    JSON  { "state": "home", "at": <date formatée> }

   `"away"` pour l'automatisation *Partir*.

Le jeton se crée depuis la page Paramètres. Le serveur n'en conserve
qu'une empreinte SHA-256 ; l'horodatage est vérifié à ± 5 minutes contre le
rejeu, et la route est limitée à 10 requêtes par minute et par adresse.
