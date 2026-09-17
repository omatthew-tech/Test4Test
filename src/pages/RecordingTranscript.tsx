import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Skeleton, Stack, Surface } from "@test4test/design-system";
import {
  paginateTranscript,
  requestRecordingTranscript,
  transcriptPageAt,
  transcriptTokens,
  type RecordingTranscriptData,
  type TranscriptPage,
} from "../lib/recordingTranscript";
import { retryRecordingTranscript, TranscriptRequestError } from "../lib/transcriptReports";
import { recordingTranscriptFixture } from "../testing/recordingTranscriptFixtures";
import styles from "./RecordingTranscript.module.css";

interface Props {
  userId: string;
  responseId: string;
  versionId?: string;
  source?: { bucket: string; path: string };
  video: HTMLVideoElement | null;
  fixtureMode: boolean;
  fixtureScenario: string | null;
}

type Snapshot =
  | { status: "loading" | "error" | "unavailable" }
  | { status: "loaded"; data: RecordingTranscriptData };

/** Route-local composition. The parent keys this by account and recording source. */
export function RecordingTranscript({
  userId,
  responseId,
  versionId,
  source,
  video,
  fixtureMode,
  fixtureScenario,
}: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const retryAbort = useRef<AbortController | null>(null);
  const retriedFixture = useRef(false);
  const bucket = source?.bucket;
  const path = source?.path;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let preparing = true;
    async function refresh() {
      if (controller.signal.aborted || inFlight || document.visibilityState === "hidden") return;
      clearTimeout(timer);
      if (!userId || !bucket || !path) {
        setSnapshot({ status: "unavailable" });
        return;
      }
      inFlight = true;
      try {
        if (fixtureMode && fixtureScenario === "error") throw new Error("Fixture error");
        const data = fixtureMode
          ? recordingTranscriptFixture(
              responseId,
              { bucket, path },
              retriedFixture.current ? "ready" : fixtureScenario,
              versionId,
            )
          : (await requestRecordingTranscript(userId, responseId, versionId, controller.signal))
              .transcript;
        if (controller.signal.aborted) return;
        if (
          data &&
          (data.responseId !== responseId ||
            (data.versionId ?? undefined) !== versionId ||
            data.source.bucket !== bucket ||
            data.source.path !== path)
        )
          throw new Error("Recording source changed");
        setSnapshot(data ? { status: "loaded", data } : { status: "unavailable" });
        preparing = data?.status === "pending" || data?.status === "processing";
        if (preparing) timer = setTimeout(refresh, 5000);
      } catch (error) {
        preparing = false;
        if (!controller.signal.aborted)
          setSnapshot({
            status:
              error instanceof TranscriptRequestError && error.status === 404
                ? "unavailable"
                : "error",
          });
      } finally {
        inFlight = false;
      }
    }
    setSnapshot({ status: "loading" });
    void refresh();
    const visibility = () => {
      if (document.visibilityState === "hidden") clearTimeout(timer);
      else if (preparing) void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [userId, responseId, versionId, bucket, path, revision, fixtureMode, fixtureScenario]);

  useEffect(() => () => retryAbort.current?.abort(), []);

  async function retry() {
    const controller = new AbortController();
    retryAbort.current = controller;
    setRetrying(true);
    setRetryError("");
    try {
      if (fixtureMode) retriedFixture.current = true;
      else await retryRecordingTranscript(userId, responseId, controller.signal, versionId);
      if (!controller.signal.aborted) setRevision((value) => value + 1);
    } catch {
      if (!controller.signal.aborted)
        setRetryError("Transcription could not be retried. Try again.");
    } finally {
      if (!controller.signal.aborted) setRetrying(false);
    }
  }

  const data = snapshot.status === "loaded" ? snapshot.data : null;
  return (
    <Surface
      as="section"
      aria-labelledby="recording-transcript-heading"
      className={styles.panel}
      tone="subtle"
    >
      <Stack gap="sm">
        <h2 id="recording-transcript-heading">Transcript</h2>
        {snapshot.status === "loading" ? (
          <Skeleton label="Loading transcript" className={styles.placeholder} />
        ) : null}
        {snapshot.status === "error" ? (
          <Alert tone="warning" title="Transcript could not be loaded">
            <Stack gap="sm">
              <p>Video playback is still available.</p>
              <div>
                <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
                  Reload transcript
                </Button>
              </div>
            </Stack>
          </Alert>
        ) : null}
        {snapshot.status === "unavailable" ? (
          <div className={styles.placeholder}>
            <p className={styles.state}>Transcript unavailable</p>
            <p>
              A transcript has not been added for this recording. Video playback is still available
              above.
            </p>
          </div>
        ) : null}
        {data && ["pending", "processing"].includes(data.status) ? (
          <p role="status" className={styles.placeholder}>
            Transcript is being prepared. You can keep watching the video.
          </p>
        ) : null}
        {data?.status === "failed" ? (
          <Stack gap="sm">
            <p role="status">
              {retrying
                ? "Retrying transcription…"
                : "Transcription failed. You can retry without interrupting the video."}
            </p>
            <div>
              <Button variant="secondary" disabled={retrying} onClick={() => void retry()}>
                Retry transcription
              </Button>
            </div>
            {retryError ? <p role="alert">{retryError}</p> : null}
          </Stack>
        ) : null}
        {data?.status === "ready" ? <TimedTranscript data={data} video={video} /> : null}
      </Stack>
    </Surface>
  );
}

function TimedTranscript({
  data,
  video,
}: {
  data: RecordingTranscriptData;
  video: HTMLVideoElement | null;
}) {
  const tokens = useMemo(() => transcriptTokens(data), [data]);
  const measurement = useRef<HTMLParagraphElement>(null);
  const [pages, setPages] = useState<TranscriptPage[]>([]);
  const [timeMs, setTimeMs] = useState(() => (video?.currentTime ?? 0) * 1000);

  useEffect(() => {
    let frame = 0;
    const boundaries = [...new Set(tokens.flatMap((token) => [token.startMs, token.endMs]))].sort(
      (a, b) => a - b,
    );
    const interval = (time: number) => {
      let low = 0,
        high = boundaries.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (boundaries[middle] <= time) low = middle + 1;
        else high = middle;
      }
      return low;
    };
    // Sample the media clock every frame, but render only at transcript boundaries.
    const sample = () => {
      const next = (video?.currentTime ?? 0) * 1000;
      setTimeMs((previous) => (interval(previous) === interval(next) ? previous : next));
    };
    const tick = () => {
      sample();
      if (video && !video.paused && !video.ended) frame = requestAnimationFrame(tick);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      sample();
      if (video && !video.paused && !video.ended) frame = requestAnimationFrame(tick);
    };
    const events = [
      "play",
      "playing",
      "pause",
      "timeupdate",
      "seeking",
      "seeked",
      "ratechange",
      "ended",
      "loadedmetadata",
      "emptied",
      "waiting",
    ];
    events.forEach((event) => video?.addEventListener(event, update));
    update();
    return () => {
      cancelAnimationFrame(frame);
      events.forEach((event) => video?.removeEventListener(event, update));
    };
  }, [video, tokens]);

  useEffect(() => {
    const element = measurement.current;
    if (!element || !tokens.length) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const bounds = Array.from(element.children).map((child) => {
        const rects = Array.from(child.getClientRects());
        const rect = child.getBoundingClientRect();
        return {
          top: rects[0]?.top ?? rect.top,
          bottom: rects[rects.length - 1]?.bottom ?? rect.bottom,
        };
      });
      const next = paginateTranscript(
        tokens,
        bounds,
        Number.parseFloat(getComputedStyle(element).lineHeight),
      );
      setPages((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void document.fonts?.ready.then(measure);
    document.fonts?.addEventListener("loadingdone", measure);
    return () => {
      cancelled = true;
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, [tokens]);

  if (!data.fullText.trim() && !tokens.length)
    return <p className={styles.placeholder}>No speech was detected in this recording.</p>;
  if (!tokens.length)
    return (
      <Stack gap="sm">
        <p className={styles.state}>Transcript timing unavailable</p>
        <p className={styles.untimed} tabIndex={0} role="region" aria-label="Transcript text">
          {data.fullText}
        </p>
      </Stack>
    );
  const page = pages[transcriptPageAt(pages, timeMs)];
  return (
    <div className={styles.body} lang={data.language ?? undefined}>
      <p className="ds-sr-only">{data.fullText || tokens.map((token) => token.text).join("")}</p>
      <p ref={measurement} className={styles.measure} aria-hidden="true">
        {tokens.map((token, index) => (
          <span key={index}>{token.text}</span>
        ))}
      </p>
      <p
        className={styles.text}
        tabIndex={0}
        role="region"
        aria-label="Synchronized transcript passage"
        data-transcript-page={page?.start ?? 0}
      >
        {page
          ? tokens.slice(page.start, page.end).map((token, index) => (
              <span
                key={page.start + index}
                aria-hidden="true"
                data-spoken={timeMs >= token.startMs}
                className={timeMs >= token.startMs ? styles.spoken : styles.upcoming}
              >
                {token.text}
              </span>
            ))
          : null}
      </p>
    </div>
  );
}
