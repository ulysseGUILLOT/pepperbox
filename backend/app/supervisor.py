"""Applique la priorite a la presence par-dessus le programme de la prise.

Une boucle de fond est indispensable : la borne de 20:00 arrive sans qu'aucun
evenement du telephone ne la signale.

Present en plage de silence, le serveur fait deux choses : il eteint une lampe
allumee par le programme, et il suspend sur la prise le programme d'allumage,
pour que celui-ci ne la rallume pas entre-temps -- la prise execute ses
programmes seule, et le serveur ne pourrait que la rattraper apres coup.
"""
import logging
import threading
import time

from . import presence
from .clock import now_local
from . import schedule as sched
from .shelly import ShellyError

log = logging.getLogger(__name__)


class Supervisor:
    def __init__(self, plug, settings, interval=30.0):
        self._plug = plug
        self._settings = settings
        self._interval = interval
        self._lock = threading.Lock()
        self._wake = threading.Event()

    def start(self):
        threading.Thread(target=self._loop, daemon=True, name="presence").start()

    def nudge(self):
        """Reveille la boucle : un evenement vient d'arriver."""
        self._wake.set()

    def is_overriding(self):
        config = presence.load(self._settings)
        state = presence.load_state(self._settings)
        return bool(config.get("enabled") and state.get("home")
                    and presence.in_quiet_window(config, now_local()))

    def mark_manual(self, on):
        """Geste humain depuis le tableau de bord. Un allumage manuel tient
        jusqu'a la prochaine extinction, quoi que fasse le programme."""
        with self._lock:
            state = presence.load_state(self._settings)
            state["manual_on"] = bool(on)
            state["auto_on"] = False
            state["forced_off"] = False
            self._settings.set(presence.STATE_KEY, state)

    def mark_auto(self, on):
        """Ecriture decidee par le serveur lui-meme."""
        with self._lock:
            state = presence.load_state(self._settings)
            state["auto_on"] = bool(on)
            state["manual_on"] = False
            self._settings.set(presence.STATE_KEY, state)

    def snapshot(self):
        config = presence.load(self._settings)
        state = presence.load_state(self._settings)
        quiet = presence.in_quiet_window(config, now_local())
        return {
            **config,
            "home": bool(state.get("home")),
            "since": state.get("since"),
            "quiet_now": quiet,
            "overriding": bool(config["enabled"] and state.get("home") and quiet),
            "manual_on": bool(state.get("manual_on")),
            "program_held": state.get("held_job") is not None,
            "token_set": bool(self._settings.get(presence.TOKEN_KEY)),
        }

    def record(self, home, at):
        with self._lock:
            state = presence.load_state(self._settings)
            if state.get("home") != home:
                state["since"] = at
            state["home"] = home
            self._settings.set(presence.STATE_KEY, state)
        self.nudge()

    # ---- boucle ----

    def _loop(self):
        while True:
            try:
                self.tick()
            except Exception:                      # noqa: BLE001
                log.exception("cycle de presence interrompu")
            self._wake.wait(self._interval)
            self._wake.clear()

    def tick(self):
        config = presence.load(self._settings)
        if not config.get("enabled"):
            # Priorite desactivee : plus rien a faire, sauf rendre ce qu'on
            # tenait encore (lampe eteinte, programme suspendu).
            state = presence.load_state(self._settings)
            if not state.get("forced_off") and state.get("held_job") is None:
                return

        try:
            status = self._plug.status()
        except ShellyError as exc:
            log.warning("etat de la prise indisponible: %s", exc)
            return

        with self._lock:
            state = presence.load_state(self._settings)
            self._track_manual(state, status)

            overriding = (bool(config.get("enabled")) and bool(state.get("home"))
                          and presence.in_quiet_window(config, now_local()))
            if overriding:
                self._suppress(state, status)
                self._hold_program(state)
            elif state.get("forced_off") or state.get("held_job") is not None:
                self._restore(state)

    def _track_manual(self, state, status):
        """Memorise un allumage humain. Le champ source de la prise ne suffit
        pas : le programme interne le reecrit en "loopback" a chaque borne,
        meme sur une lampe deja allumee a la main."""
        if not status["on"]:
            if state.get("manual_on") or state.get("auto_on"):
                state["manual_on"] = False
                state["auto_on"] = False
                self._settings.set(presence.STATE_KEY, state)
            return
        # Allumage au bouton physique ou depuis l'application Shelly.
        if (status.get("source") in presence.MANUAL_SOURCES
                and not state.get("auto_on") and not state.get("manual_on")):
            state["manual_on"] = True
            self._settings.set(presence.STATE_KEY, state)

    def _suppress(self, state, status):
        if not status["on"] or state.get("manual_on"):
            return
        try:
            self._plug.set(False)
        except ShellyError as exc:
            log.warning("extinction impossible: %s", exc)
            return
        state["forced_off"] = True
        state["auto_on"] = False
        self._settings.set(presence.STATE_KEY, state)
        log.info("presence en plage de silence : lampe eteinte")

    def _hold_program(self, state):
        """Suspend le programme d'allumage sur la prise. L'identifiant retenu
        permet de reconnaitre un programme reenregistre entre-temps : il
        faut alors suspendre le nouveau."""
        job = sched.on_job_id(self._settings)
        if job is None or state.get("held_job") == job:
            return
        try:
            self._plug.schedule_enable(job, False)
        except ShellyError as exc:
            log.warning("suspension du programme impossible: %s", exc)
            return
        state["held_job"] = job
        self._settings.set(presence.STATE_KEY, state)
        log.info("presence en plage de silence : programme d'allumage suspendu")

    def _restore(self, state):
        """Rend a la prise son programme d'allumage, puis ne rallume que ce
        que l'on a soi-meme empeche, et seulement si le programme le demande
        a cet instant."""
        held = state.get("held_job")
        if held is not None:
            if held != sched.on_job_id(self._settings):
                # Programme reenregistre entre-temps : il a ete recree actif.
                state["held_job"] = None
            else:
                try:
                    self._plug.schedule_enable(held, True)
                    state["held_job"] = None
                    log.info("fin de priorite : programme d'allumage reactive")
                except ShellyError as exc:
                    # On garde la marque pour reessayer au prochain cycle,
                    # sans retarder la reprise de la lampe.
                    log.warning("reactivation du programme impossible: %s", exc)
        state["forced_off"] = False
        self._settings.set(presence.STATE_KEY, state)

        program = sched.load(self._settings)
        if not program.get("enabled"):
            return
        if not sched.should_be_on(program, now_local()):
            return
        try:
            if not self._plug.status()["on"]:
                self._plug.set(True)
                # Vu de la prise, cet allumage a la meme origine ("HTTP_in")
                # qu'un geste depuis l'application Shelly. Sans cette marque,
                # le cycle suivant le prenait pour un allumage manuel et la
                # lampe restait allumee a 20:00 (incident du 30/09).
                state["auto_on"] = True
                state["manual_on"] = False
                self._settings.set(presence.STATE_KEY, state)
                log.info("fin de priorite : programme repris, lampe rallumee")
        except ShellyError as exc:
            log.warning("reprise du programme impossible: %s", exc)
