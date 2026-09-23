import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from "react";
import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { IconButton } from "./actions";
import { TimelineRange, formatMediaTime, type TimelineRangeProps } from "./timeline-range";
import styles from "./video-player.module.css";

export type VideoClipRange = Pick<TimelineRangeProps, "start" | "end" | "onChange" | "disabled">;
export interface VideoPlayerProps {
  label: string;
  src?: string;
  title?: string;
  poster?: string;
  durationHint?: number;
  videoRef?: Ref<HTMLVideoElement>;
  clipRange?: VideoClipRange;
  actions?: ReactNode;
  onError?: (event: SyntheticEvent<HTMLVideoElement>) => void;
  /** Supply a server-trimmed source. This limit controls UX, not media authorization. */
  preview?: { seconds: number; overlay: ReactNode };
}
function clock(seconds: number) {
  return formatMediaTime(seconds).split(".")[0];
}

/** One timeline for playback and optional trimming; media remains native HTML video. */
export function VideoPlayer({
  label,
  src,
  title,
  poster,
  durationHint = 0,
  videoRef,
  clipRange,
  actions,
  onError,
  preview,
}: VideoPlayerProps) {
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(durationHint);
  const [time, setTime] = useState(0);
  const [paused, setPaused] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const lockPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (locked) lockPanel.current?.focus({ preventScroll: true });
  }, [locked]);
  const attach = useCallback(
    (element: HTMLVideoElement | null) => {
      video.current = element;
      if (typeof videoRef === "function") videoRef(element);
      else if (videoRef) videoRef.current = element;
    },
    [videoRef],
  );
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === root.current);
    setFullscreenAvailable(Boolean(document.fullscreenEnabled && root.current?.requestFullscreen));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const sync = () => {
    const element = video.current;
    if (!element) return;
    if (preview && (locked || element.currentTime >= preview.seconds || element.ended)) {
      if (!element.paused) element.pause();
      if (element.currentTime > preview.seconds) element.currentTime = preview.seconds;
      setLocked(true);
    }
    setDuration(
      Number.isFinite(element.duration) && element.duration > 0 ? element.duration : durationHint,
    );
    setTime(element.currentTime);
    setPaused(element.paused);
    setVolume(element.volume);
    setMuted(element.muted);
  };
  const usable = Number.isFinite(duration) && duration > 0;
  const totalDuration = preview ? Math.max(durationHint, duration) : duration;
  const toggle = async () => {
    const element = video.current;
    if (!element || locked) return;
    setError("");
    if (!element.paused) element.pause();
    else {
      try {
        await element.play();
      } catch {
        setError("The video could not be played. Try again.");
      }
    }
  };
  const seek = (
    <input
      className={styles.seek}
      type="range"
      aria-label="Playback position"
      aria-valuetext={`${clock(time)} of ${clock(usable ? totalDuration : 0)}`}
      min={0}
      max={usable ? totalDuration : 0}
      step={0.1}
      value={Math.min(time, usable ? duration : 0)}
      disabled={!usable || locked}
      onChange={(event) => {
        const next = Math.min(Number(event.target.value), preview?.seconds ?? totalDuration);
        if (video.current) video.current.currentTime = next;
        setTime(next);
        sync();
      }}
    />
  );
  return (
    <div className={styles.root} ref={root} role="group" aria-label={`${label} player`}>
      <div className={styles.picture} data-locked={locked || undefined}>
        <video
          ref={attach}
          className={styles.video}
          aria-label={label}
          title={title}
          src={src}
          poster={poster}
          playsInline
          preload="metadata"
          onLoadedMetadata={sync}
          onDurationChange={sync}
          onTimeUpdate={sync}
          onSeeking={sync}
          onPlay={sync}
          onPause={sync}
          onEnded={sync}
          onVolumeChange={sync}
          onEmptied={sync}
          onError={onError}
        >
          Your browser does not support embedded video playback.
        </video>
        {!locked && (
          <button
            className={styles.pictureButton}
            type="button"
            aria-label={paused ? "Play video" : "Pause video"}
            onClick={() => void toggle()}
          >
            {paused && (
              <span className={styles.playBadge}>
                <Play aria-hidden="true" />
              </span>
            )}
          </button>
        )}
        {locked && (
          <div
            className={styles.previewLock}
            ref={lockPanel}
            tabIndex={-1}
            role="region"
            aria-label="Recording preview ended"
          >
            {preview?.overlay}
          </div>
        )}
      </div>
      <div className={styles.controls}>
        {clipRange ? (
          <TimelineRange
            label="Clip range"
            duration={Math.floor(duration * 10) / 10}
            {...clipRange}
            presentation="player"
          >
            {seek}
          </TimelineRange>
        ) : (
          <div className={styles.timeline}>{seek}</div>
        )}
        <div className={styles.toolbar}>
          <IconButton
            className={styles.control}
            variant="quiet"
            label={paused ? "Play" : "Pause"}
            disabled={locked}
            onClick={() => void toggle()}
          >
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          </IconButton>
          <span className={styles.time}>
            {clock(time)} / {clock(usable ? totalDuration : 0)}
          </span>
          <div className={styles.volume}>
            <IconButton
              className={styles.control}
              variant="quiet"
              label={muted || volume === 0 ? "Unmute" : "Mute"}
              onClick={() => {
                const element = video.current;
                if (!element) return;
                if (element.volume === 0) element.volume = 1;
                element.muted = !(muted || volume === 0);
              }}
            >
              {muted || volume === 0 ? (
                <VolumeX aria-hidden="true" />
              ) : (
                <Volume2 aria-hidden="true" />
              )}
            </IconButton>
            <input
              className={styles.volumeSlider}
              type="range"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => {
                if (!video.current) return;
                video.current.volume = Number(event.target.value);
                video.current.muted = false;
              }}
            />
          </div>
          <div className={styles.spacer} />
          {actions && <div className={styles.actions}>{actions}</div>}
          {fullscreenAvailable && (
            <IconButton
              className={styles.control}
              variant="quiet"
              label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={async () => {
                try {
                  if (document.fullscreenElement === root.current) await document.exitFullscreen();
                  else await root.current?.requestFullscreen();
                } catch {
                  setError("Fullscreen is unavailable in this browser.");
                }
              }}
            >
              {fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
            </IconButton>
          )}
        </div>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
