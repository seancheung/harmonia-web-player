import {
  useFloating,
  useMergeRefs,
  useTransitionStyles,
} from "@floating-ui/react";
import {
  Airplay,
  Clock3,
  Heart,
  ListMusic,
  Mic2,
  MonitorSpeaker,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Type,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Cover, FavoriteButton, IconButton, Modal } from "./components";
import { useApp } from "./context";
import { DialogPresence } from "./dialog-presence";
import type { TextKey } from "./i18n";
import { api, duration, lyricsLines } from "./model";
import { player } from "./player";
import { QueueList } from "./queue-list";
import { SeekControl } from "./seek-control";
import { VolumeControl } from "./volume-control";

export function PlayerBar() {
  const s = useSyncExternalStore(player.subscribe, player.snapshot);
  const { t, run } = useApp();
  const [panel, setPanel] = useState<
    "queue" | "lyrics" | "output" | "sleep" | null
  >(null);
  const [lyrics, setLyrics] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [finish, setFinish] = useState(false);
  const [devices, setDevices] = useState<
    {
      id: string;
      name: string;
      selected: boolean;
      requires_auth?: boolean;
      needs_auth_key?: boolean;
    }[]
  >([]);
  const [deviceError, setDeviceError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pin, setPin] = useState("");
  const [pairID, setPairID] = useState("");
  const track = s.queue[s.index];
  const favoriteButton = (
    <FavoriteButton
      label={t("favorite")}
      active={track?.favorite}
      disabled={!track}
      onClick={() =>
        track &&
        void run(() =>
          api(`/tracks/${track.id}/favorite`, "PUT", {
            favorite: !track.favorite,
          }),
        )
      }
    >
      <Heart size={18} fill={track?.favorite ? "currentColor" : "none"} />
    </FavoriteButton>
  );
  const currentLine = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelOpen = panel === "queue" || panel === "lyrics";
  const retainedPanel = useRef<"queue" | "lyrics">("queue");
  if (panelOpen) retainedPanel.current = panel;
  const panelKind = retainedPanel.current;
  const { context: panelContext, refs: panelRefs } = useFloating({
    open: panelOpen,
  });
  const setPanelRef = useMergeRefs([panelRef, panelRefs.setFloating]);
  const { isMounted: panelMounted, styles: panelStyles } = useTransitionStyles(
    panelContext,
    {
      duration: { open: 200, close: 150 },
      initial: { opacity: 0, transform: "translateX(32px)" },
      open: { opacity: 1, transform: "translateX(0)" },
    },
  );
  useEffect(() => {
    if (panel !== "queue" && panel !== "lyrics") return;
    const previous = document.activeElement;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) setPanel(null);
    };
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [panel, panelMounted]);
  const lines = lyricsLines(lyrics);
  const activeLine = lines.reduce(
    (last, l, i) => (l.time !== null && l.time <= s.position ? i : last),
    -1,
  );
  useEffect(() => {
    let cancelled = false;
    setLyrics("");
    if (track)
      void api<{ lyrics: string }>(`/tracks/${track.id}/lyrics`)
        .then((r) => {
          if (!cancelled) setLyrics(r.lyrics);
        })
        .catch(() => {
          if (!cancelled) setLyrics("");
        });
    return () => {
      cancelled = true;
    };
  }, [track?.id, track?.revision]);
  useEffect(() => {
    if (panel === "lyrics")
      currentLine.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
  }, [activeLine, panel]);
  useEffect(() => {
    if (panel === "output")
      void api<{ outputs: typeof devices; error?: string }>("/outputs")
        .then((r) => {
          setDevices(r.outputs || []);
          setDeviceError(r.error || "");
          setSelected(
            player.snapshot().remote
              ? (r.outputs || []).filter((d) => d.selected).map((d) => d.id)
              : [],
          );
        })
        .catch((e) => setDeviceError(e.message));
  }, [panel]);
  return (
    <>
      <footer className="player-bar">
        <div className="now-playing">
          <Cover track={track} />
          <div>
            <strong>
              {track?.title || track?.filename || t("nothingPlaying")}
            </strong>
            <p>{track?.artist || t("playerHint")}</p>
          </div>
          {track && favoriteButton}
        </div>
        <div className="playback-controls">
          <div className="transport">
            <IconButton
              label={t("shuffle")}
              active={s.shuffle}
              onClick={() => player.shuffle()}
            >
              <Shuffle size={17} />
            </IconButton>
            <IconButton
              label={t("previous")}
              disabled={!track}
              onClick={() => player.previous()}
            >
              <SkipBack size={21} fill="currentColor" />
            </IconButton>
            <button
              type="button"
              className="play-button"
              aria-label={t(s.playing ? "pause" : "play")}
              disabled={!track || s.loading}
              onClick={() => player.toggle()}
            >
              {s.loading ? (
                <span className="spinner" />
              ) : s.playing ? (
                <Pause size={21} fill="currentColor" />
              ) : (
                <Play size={21} fill="currentColor" />
              )}
            </button>
            <IconButton
              label={t("next")}
              disabled={!track}
              onClick={() => player.next()}
            >
              <SkipForward size={21} fill="currentColor" />
            </IconButton>
            <IconButton
              label={t(
                s.repeat === "single"
                  ? "repeatOne"
                  : s.repeat === "all"
                    ? "repeat"
                    : "repeatOff",
              )}
              active={s.repeat !== "off"}
              onClick={() => player.repeat()}
            >
              {s.repeat === "single" ? (
                <Repeat1 size={18} />
              ) : (
                <Repeat size={18} />
              )}
            </IconButton>
          </div>
          <div className="progress-control">
            <span>{duration(s.position)}</span>
            <SeekControl track={track} position={s.position} />
            <span>{duration(track?.duration || 0)}</span>
          </div>
        </div>
        <div className="player-extras">
          <div className="mobile-favorite">{favoriteButton}</div>
          <div className="player-sleep">
            <IconButton
              label={t("sleep")}
              active={!!s.deadline || s.waiting}
              onClick={() => setPanel("sleep")}
            >
              <Clock3 size={17} />
            </IconButton>
          </div>
          <div className="mobile-transport">
            <IconButton
              label={t("shuffle")}
              active={s.shuffle}
              onClick={() => player.shuffle()}
            >
              <Shuffle size={17} />
            </IconButton>
            <IconButton
              label={t(
                s.repeat === "single"
                  ? "repeatOne"
                  : s.repeat === "all"
                    ? "repeat"
                    : "repeatOff",
              )}
              active={s.repeat !== "off"}
              onClick={() => player.repeat()}
            >
              {s.repeat === "single" ? (
                <Repeat1 size={18} />
              ) : (
                <Repeat size={18} />
              )}
            </IconButton>
          </div>
          <VolumeControl volume={s.volume} />

          <IconButton
            label={t("lyrics")}
            active={panel === "lyrics"}
            onClick={() => setPanel(panel === "lyrics" ? null : "lyrics")}
          >
            <Type size={18} />
          </IconButton>
          <IconButton
            label={`${t("output")}: ${t(s.remote ? "output" : "local")}`}
            active={s.remote}
            onClick={() => setPanel("output")}
          >
            <Airplay size={18} />
          </IconButton>
          <IconButton
            label={t("queue")}
            active={panel === "queue"}
            onClick={() => setPanel(panel === "queue" ? null : "queue")}
          >
            <ListMusic size={20} />
          </IconButton>
        </div>
      </footer>
      {s.error && (
        <div className="player-error" role="alert">
          <div className="player-error-message">
            {t(s.error as TextKey) || s.error}
            {s.mediaDiagnostics && (
              <div>
                {t("mediaDiagnosticLabel")}:{" "}
                {t(s.mediaDiagnostics as TextKey) || s.mediaDiagnostics}
              </div>
            )}
          </div>
          <IconButton
            label={t("dismissError")}
            onClick={() => player.dismissError()}
          >
            <X size={16} />
          </IconButton>
        </div>
      )}
      {(s.deadline > 0 || s.waiting) && (
        <button
          type="button"
          className="timer-badge"
          onClick={() => setPanel("sleep")}
        >
          <Clock3 size={12} />
          {s.waiting
            ? t("waitingEnd")
            : duration(Math.max(0, (s.deadline - Date.now()) / 1000))}
        </button>
      )}
      {panelMounted && (
        <aside
          className="player-panel"
          ref={setPanelRef}
          aria-label={t(panelKind)}
          aria-hidden={!panelOpen}
          style={{
            ...panelStyles,
            pointerEvents: panelOpen ? undefined : "none",
          }}
        >
          <header>
            <h2>{t(panelKind)}</h2>
            <IconButton label={t("cancel")} onClick={() => setPanel(null)}>
              <X size={20} />
            </IconButton>
          </header>
          {panelKind === "queue" ? (
            <>
              <div className="panel-toolbar">
                <span>
                  {s.queue.length} {t("songs")}
                </span>
                <button type="button" onClick={() => player.clear()}>
                  {t("clear")}
                </button>
              </div>
              <QueueList
                queue={s.queue}
                index={s.index}
                open={panel === "queue"}
              />
            </>
          ) : (
            <div className="lyrics-scroll">
              {lines.length ? (
                lines.map((line, i) =>
                  line.time !== null ? (
                    <button
                      type="button"
                      ref={i === activeLine ? currentLine : undefined}
                      className={i === activeLine ? "active-line" : ""}
                      key={`${line.time}-${i}`}
                      onClick={() => {
                        if (line.time !== null) player.seek(line.time);
                      }}
                    >
                      {line.text || "♪"}
                    </button>
                  ) : (
                    <p key={`${line.text}-${i}`}>{line.text}</p>
                  ),
                )
              ) : (
                <div className="panel-empty">
                  <Mic2 size={36} />
                  <h3>{t("noLyrics")}</h3>
                  <p>{t("noLyricsHint")}</p>
                </div>
              )}
            </div>
          )}
        </aside>
      )}
      <DialogPresence>
        {panel === "sleep" && (
          <Modal title={t("sleep")} close={() => setPanel(null)}>
            <div className="timer-presets">
              {[15, 30, 45, 60].map((n) => (
                <button
                  type="button"
                  className={minutes === n ? "active" : ""}
                  key={n}
                  onClick={() => setMinutes(n)}
                >
                  {n}
                  <small>{t("minutes")}</small>
                </button>
              ))}
            </div>
            <label>
              {t("custom")}
              <input
                type="number"
                min="1"
                max="1440"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={finish}
                onChange={(e) => setFinish(e.target.checked)}
              />
              {t("finishTrack")}
            </label>
            <button
              type="button"
              className="secondary full-width"
              disabled={!track}
              onClick={() => {
                player.timer(0, true, true);
                setPanel(null);
              }}
            >
              {t("endTrack")}
            </button>
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  player.timer(0, false);
                  setPanel(null);
                }}
              >
                {t("clear")}
              </button>
              <button
                type="button"
                className="primary"
                disabled={
                  !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440
                }
                onClick={() => {
                  player.timer(minutes, finish);
                  setPanel(null);
                }}
              >
                {t("save")}
              </button>
            </footer>
          </Modal>
        )}
      </DialogPresence>
      <DialogPresence>
        {panel === "output" && (
          <Modal title={t("output")} close={() => setPanel(null)}>
            <p className="help">{t("airplayHint")}</p>
            <button
              type="button"
              className={`output-option ${!selected.length ? "active" : ""}`}
              aria-pressed={!selected.length}
              onClick={() => setSelected([])}
            >
              <MonitorSpeaker size={24} />
              <span>{t("local")}</span>
              {!selected.length && <span>✓</span>}
            </button>
            {devices.map((device) => (
              <div className="device-row" key={device.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.includes(device.id)}
                    onChange={(e) =>
                      setSelected((s) =>
                        e.target.checked
                          ? [...s, device.id]
                          : s.filter((id) => id !== device.id),
                      )
                    }
                  />
                  <Airplay size={20} />
                  {device.name}
                </label>
                {(device.requires_auth || device.needs_auth_key) && (
                  <button type="button" onClick={() => setPairID(device.id)}>
                    {t("pair")}
                  </button>
                )}
              </div>
            ))}
            {deviceError && <p className="error-text">{deviceError}</p>}
            {!devices.length && !deviceError && <p>{t("noDevices")}</p>}
            {pairID && (
              <div className="flex gap-2">
                <input
                  placeholder={t("pin")}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() =>
                    void run(() =>
                      api("/remote", "POST", {
                        action: "pair",
                        outputId: pairID,
                        pin,
                      }),
                    )
                  }
                >
                  {t("pair")}
                </button>
              </div>
            )}
            <p className="help">{t("gapless")}</p>
            <footer>
              <button
                type="button"
                className="primary"
                disabled={s.loading}
                onClick={() => {
                  if (selected.length) void player.startRemote(selected);
                  else if (s.remote) void player.local();
                  setPanel(null);
                }}
              >
                {t("useOutputs")}
              </button>
            </footer>
          </Modal>
        )}
      </DialogPresence>
    </>
  );
}
