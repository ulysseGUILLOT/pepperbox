# Script PlatformIO lance avant la compilation : inscrit la version git dans
# include/version.h, que la carte envoie avec son battement. Le tableau de
# bord confirme ainsi qu'une mise a jour a distance a pris.
#
# Un en-tete plutot qu'un -D : une macro de compilation qui change a chaque
# commit ferait recompiler tout le framework ; l'en-tete, seulement main.cpp.
# Il n'est reecrit que si la version change.
import subprocess
from pathlib import Path

Import("env")  # noqa: F821 -- fourni par PlatformIO

project = Path(env.subst("$PROJECT_DIR"))  # noqa: F821
try:
    version = subprocess.run(
        ["git", "describe", "--always", "--dirty"],
        cwd=project, capture_output=True, text=True, check=True,
    ).stdout.strip()
except (OSError, subprocess.CalledProcessError):
    version = "inconnue"

header = project / "include" / "version.h"
content = (
    "// Genere par version.py a chaque compilation : ne pas modifier.\n"
    "#pragma once\n"
    f'#define FIRMWARE_VERSION "{version}"\n'
)
if not header.exists() or header.read_text() != content:
    header.write_text(content)
