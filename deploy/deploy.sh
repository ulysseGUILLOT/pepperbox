#!/usr/bin/env bash
# Deploiement sur la VM. Lance par GitHub Actions a travers une cle SSH dont
# c'est la SEULE commande autorisee (command= dans authorized_keys) : une
# fuite de la cle du CI permet de redeployer, pas d'ouvrir un shell.
#
# Entree standard, une ligne : "<utilisateur ghcr> <jeton ghcr>".
# Le jeton ne passe ni par les arguments ni par l'environnement, qui
# apparaitraient dans la liste des processus.

set -euo pipefail

# Tout le script est lu avant execution : `git pull` peut le remplacer
# pendant qu'il tourne sans que bash ne lise un fichier a moitie change.
main() {
    cd /home/freebox/pepperbox

    local ghcr_user="" ghcr_token=""
    read -r ghcr_user ghcr_token || true

    git pull --ff-only

    local compose=(docker compose -p pepperbox
                   -f docker-compose.yml -f docker-compose.prod.yml)

    if [ -n "$ghcr_token" ]; then
        echo "$ghcr_token" | docker login ghcr.io -u "$ghcr_user" --password-stdin
        trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
    fi

    "${compose[@]}" pull
    "${compose[@]}" up -d --remove-orphans

    # Sans -a : seules les images devenues orphelines partent, pas les
    # couches de base qu'il faudrait retelecharger au deploiement suivant.
    docker image prune -f

    "${compose[@]}" ps
}

main "$@"
