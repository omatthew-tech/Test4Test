import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Scissors } from "lucide-react";
import {
  Alert,
  Button,
  Dialog,
  Link,
  Stack,
  TextField,
  TimelineRange,
  formatMediaTime,
  type VideoClipRange,
} from "@test4test/design-system";
import {
  clipShareUrl,
  deleteRecordingClip,
  getRecordingClipStatus,
  newClipRequest,
  retryRecordingClip,
  saveRecordingClip,
  type ClipRequest,
  type ClipStatus,
} from "../lib/recordingClips";
import styles from "./RecordingClipEditor.module.css";

interface Props {
  video: HTMLVideoElement | null;
  responseId: string;
  versionId?: string;
  durationHint: number;
  renderPlayer?: (range: VideoClipRange | undefined, action: ReactNode) => ReactNode;
}
export function RecordingClipEditor({
  video,
  responseId,
  versionId,
  durationHint,
  renderPlayer,
}: Props) {
  const [duration, setDuration] = useState(durationHint);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ input: ClipRequest; status: ClipStatus } | null>(null);
  const [error, setError] = useState("");
  const [copy, setCopy] = useState<"idle" | "copied" | "error">("idle");
  const [pollRetry, setPollRetry] = useState(0);
  const attempt = useRef<ClipRequest | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const update = () => {
      const seconds =
        video && Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : durationHint;
      const nextDuration = Math.floor(Math.min(seconds, 86400) * 10) / 10;
      setDuration(nextDuration);
      setRange((current) => {
        if (!current || !Number.isFinite(nextDuration) || nextDuration < 0.1) return current;
        const end = Math.min(current[1], nextDuration);
        const start = Number(Math.max(0, Math.min(current[0], end - 0.1)).toFixed(1));
        if (start === current[0] && end === current[1]) return current;
        attempt.current = null;
        return [start, end];
      });
    };
    update();
    video?.addEventListener("loadedmetadata", update);
    video?.addEventListener("durationchange", update);
    return () => {
      video?.removeEventListener("loadedmetadata", update);
      video?.removeEventListener("durationchange", update);
    };
  }, [video, durationHint]);
  useEffect(() => {
    if (!previewing || !video || !range) return;
    let frame = 0;
    const tick = () => {
      if (video.currentTime >= range[1] || video.ended) {
        video.pause();
        video.currentTime = range[1];
        setPreviewing(false);
        return;
      }
      if (video.paused) {
        setPreviewing(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      video.pause();
    };
  }, [previewing, video, range]);
  const clipId = saved?.input.id;
  const clipStatus = saved?.status;
  useEffect(() => {
    if (!clipId || !clipStatus || ["ready", "failed"].includes(clipStatus)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await getRecordingClipStatus(clipId);
        if (cancelled) return;
        setSaved((current) =>
          current?.input.id === clipId ? { ...current, status: next } : current,
        );
        if (next === "pending" || next === "processing")
          timer = setTimeout(() => void poll(), 2500);
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : "Could not check the clip. Try again.",
          );
      }
    };
    timer = setTimeout(() => void poll(), 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clipId, clipStatus, pollRetry]);
  const startClip = () => {
    video?.pause();
    setPreviewing(false);
    const start = Math.max(
      0,
      Math.min(Math.floor((video?.currentTime ?? 0) * 10) / 10, duration - 0.1),
    );
    setRange([start, Math.min(duration, start + 30)]);
    attempt.current = null;
    setSaved(null);
    setError("");
    setCopy("idle");
  };
  const save = async () => {
    if (!range || busy.current) return;
    busy.current = true;
    setSaving(true);
    setOpen(true);
    setError("");
    setCopy("idle");
    video?.pause();
    setPreviewing(false);
    const input = attempt.current ?? newClipRequest(responseId, versionId, range[0], range[1]);
    attempt.current = input;
    try {
      const status = await saveRecordingClip(input);
      if (alive.current) setSaved({ input, status });
    } catch (reason) {
      if (alive.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "The clip could not be saved. Please try again.",
        );
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  };
  const url = saved ? clipShareUrl(saved.input.token) : "";
  const valid = !!range && range[0] >= 0 && range[1] <= duration && range[1] - range[0] >= 0.099;
  const clipRange: VideoClipRange | undefined = range
    ? {
        start: range[0],
        end: range[1],
        disabled: saving || !!saved,
        onChange: (start, end, handle) => {
          video?.pause();
          setPreviewing(false);
          setRange([start, end]);
          attempt.current = null;
          if (video) video.currentTime = handle === "start" ? start : end;
        },
      }
    : undefined;
  const clipAction = !range && (
    <Button
      className={styles.clipAction}
      aria-label="Clip"
      title="Clip"
      variant="secondary"
      onClick={startClip}
      disabled={!video || !Number.isFinite(duration) || duration < 0.1}
    >
      <Scissors aria-hidden="true" />
      <span>Clip</span>
    </Button>
  );
  return (
    <>
      {renderPlayer?.(clipRange, clipAction)}
      <div className={range || !renderPlayer ? styles.root : undefined}>
        {!range ? (
          !renderPlayer && clipAction
        ) : (
          <Stack gap="md">
            <strong>Create a clip</strong>
            {renderPlayer ? (
              <p className={styles.rangeSummary}>
                Start {formatMediaTime(range[0])} · End {formatMediaTime(range[1])}
              </p>
            ) : (
              clipRange && <TimelineRange label="Clip range" duration={duration} {...clipRange} />
            )}
            <div className={styles.actions}>
              {saved ? (
                <>
                  <Button onClick={() => setOpen(true)}>Share clip</Button>
                  <Button variant="secondary" onClick={startClip}>
                    New clip
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => void save()}
                    disabled={!valid}
                    loading={saving}
                    loadingLabel="Saving clip…"
                  >
                    Save clip
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!video || !valid || saving}
                    onClick={async () => {
                      if (!video) return;
                      if (previewing) {
                        video.pause();
                        setPreviewing(false);
                        return;
                      }
                      setError("");
                      video.currentTime = range[0];
                      try {
                        await video.play();
                        if (alive.current) setPreviewing(true);
                      } catch {
                        if (alive.current)
                          setError(
                            "The clip could not be previewed. Try playing the recording again.",
                          );
                      }
                    }}
                  >
                    {previewing ? "Pause preview" : "Preview clip"}
                  </Button>
                </>
              )}
              <Button
                variant="quiet"
                disabled={saving}
                onClick={() => {
                  video?.pause();
                  setPreviewing(false);
                  setRange(null);
                  setError("");
                }}
              >
                Cancel
              </Button>
            </div>
            {error && !open && <Alert tone="danger">{error}</Alert>}
          </Stack>
        )}
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="Share clip"
          description="Anyone with this link can watch your clip. No account needed."
        >
          <Stack gap="md">
            {saving && <p role="status">Saving your clip…</p>}
            {saved && (
              <>
                {saved.status !== "ready" && (
                  <p role="status">
                    {saved.status === "failed"
                      ? "The video could not be created. Try exporting it again."
                      : "Your video is being created. You can copy the link now; it will play here when ready."}
                  </p>
                )}
                <TextField
                  label="Clip link"
                  value={url}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                  onClick={(event) => event.currentTarget.select()}
                />
                <div className={styles.actions}>
                  <Button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(url);
                        setCopy("copied");
                      } catch {
                        setCopy("error");
                      }
                    }}
                  >
                    {copy === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {copy === "copied" ? "Copied" : "Copy link"}
                  </Button>
                  <Link to={url} external target="_blank" rel="noopener noreferrer">
                    Open clip
                  </Link>
                </div>
                {saved.status === "failed" && (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      setError("");
                      try {
                        const status = await retryRecordingClip(saved.input.id);
                        if (alive.current) setSaved({ ...saved, status });
                      } catch (reason) {
                        if (alive.current)
                          setError(reason instanceof Error ? reason.message : "Try again later.");
                      }
                    }}
                  >
                    Retry export
                  </Button>
                )}
                <p role="status" className={copy === "error" ? undefined : "ds-sr-only"}>
                  {copy === "copied"
                    ? "Clip link copied."
                    : copy === "error"
                      ? "We couldn’t copy the link. Select the clip link and copy it manually."
                      : ""}
                </p>
              </>
            )}
            {error && (
              <Alert tone="danger">
                <Stack>
                  <p>{error}</p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!saved) void save();
                      else {
                        setError("");
                        setPollRetry((value) => value + 1);
                      }
                    }}
                  >
                    Try again
                  </Button>
                </Stack>
              </Alert>
            )}
            {saved && (
              <Button
                variant="quiet"
                onClick={async () => {
                  try {
                    await deleteRecordingClip(saved.input.id);
                    if (alive.current) {
                      setSaved(null);
                      setRange(null);
                      setOpen(false);
                      attempt.current = null;
                    }
                  } catch (reason) {
                    if (alive.current)
                      setError(
                        reason instanceof Error ? reason.message : "The clip could not be deleted.",
                      );
                  }
                }}
              >
                Delete clip
              </Button>
            )}
          </Stack>
        </Dialog>
      </div>
    </>
  );
}
