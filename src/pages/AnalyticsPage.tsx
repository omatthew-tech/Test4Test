import { ArrowRight, ArrowUp, Play, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Cluster,
  Grid,
  IconButton,
  Link,
  Skeleton,
  Stack,
  Textarea,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import {
  buildFixtureRecordingPreviews,
  mergeRecordingPreviews,
  requestRecordingPreviews,
} from "../lib/recordingPreviews";
import { invalidateResponseRecordingUrl, requestResponseRecordingUrl } from "../lib/recordings";
import { getAvailableRecordingsForCurrentUser } from "../lib/selectors";
import type { RecordingPreviewSummary } from "../types";
import styles from "./AnalyticsPage.module.css";

function availableRecordingDescription(recordingCount: number) {
  return `You have ${recordingCount} ${recordingCount === 1 ? "recording" : "recordings"} available`;
}

function formatOffset(timestampMs: number | null) {
  if (timestampMs === null) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.round(timestampMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

interface PlaybackState {
  responseId: string;
  status: "loading" | "ready" | "error";
  url: string | null;
  error: string | null;
}

function RecordingPreviewCard({
  preview,
  index,
  recordingHref,
  playback,
  videoRef,
  onPlay,
  onPlaybackError,
  onRetryThumbnail,
}: {
  preview: RecordingPreviewSummary;
  index: number;
  recordingHref: string;
  playback: PlaybackState | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  onPlay: (preview: RecordingPreviewSummary, force?: boolean) => void;
  onPlaybackError: (message: string) => void;
  onRetryThumbnail: (responseId: string) => void;
}) {
  const isActive = playback?.responseId === preview.responseId;
  const thumbnailOffset = formatOffset(preview.thumbnail?.timestampMs ?? null);

  return (
    <Card as="li" className={styles.recordingCard}>
      <div className={styles.previewFrame}>
        {isActive && playback?.url ? (
          <video
            aria-label={`Recording ${index + 1}: ${preview.productName}`}
            autoPlay
            className={styles.video}
            controls
            onError={() =>
              onPlaybackError("This recording could not be played. Try loading it again.")
            }
            onLoadedMetadata={(event) => {
              event.currentTarget.muted = false;
              event.currentTarget.volume = 1;
              void event.currentTarget.play().catch(() => undefined);
            }}
            playsInline
            poster={preview.thumbnail?.url ?? undefined}
            preload="metadata"
            ref={videoRef}
            src={playback.url}
          />
        ) : preview.thumbnail?.url ? (
          <img
            alt={`${preview.productName} recording preview`}
            className={styles.thumbnail}
            decoding="async"
            height={preview.thumbnail.height ?? 540}
            loading="lazy"
            src={preview.thumbnail.url}
            width={preview.thumbnail.width ?? 960}
          />
        ) : (
          <Skeleton
            className={styles.previewSkeleton}
            label={
              preview.thumbnailStatus === "failed"
                ? "Recording preview unavailable"
                : "Generating recording preview"
            }
          />
        )}

        {isActive && playback?.status === "loading" ? (
          <Skeleton className={styles.previewSkeleton} label="Loading recording" />
        ) : null}

        {!isActive || playback?.status === "error" ? (
          <IconButton
            className={styles.playButton}
            label={`${playback?.status === "error" ? "Retry" : "Play"} Recording ${index + 1}: ${preview.productName}`}
            onClick={() => onPlay(preview, playback?.status === "error")}
            type="button"
            variant="secondary"
          >
            {playback?.status === "error" ? (
              <RefreshCw aria-hidden="true" size={20} />
            ) : (
              <Play aria-hidden="true" fill="currentColor" size={20} />
            )}
          </IconButton>
        ) : null}
      </div>

      <Stack className={styles.recordingDetails} gap="xs">
        <Link className={styles.recordingLink} to={recordingHref}>
          Recording {index + 1}
        </Link>
        <span className={styles.recordingName}>{preview.productName}</span>
        {thumbnailOffset ? (
          <span className={styles.previewTime}>Preview from {thumbnailOffset}</span>
        ) : null}

        {preview.thumbnailStatus === "failed" ? (
          <Alert className={styles.cardAlert} title="Preview unavailable" tone="warning">
            <Stack gap="xs">
              <span>{preview.thumbnailError ?? "The recording can still be played."}</span>
              <Button
                onClick={() => onRetryThumbnail(preview.responseId)}
                size="compact"
                type="button"
                variant="quiet"
              >
                Retry preview
              </Button>
            </Stack>
          </Alert>
        ) : null}

        {isActive && playback?.error ? (
          <Alert className={styles.cardAlert} title="Playback unavailable" tone="danger">
            {playback.error}
          </Alert>
        ) : null}
      </Stack>
    </Card>
  );
}

export function AnalyticsPage() {
  const { state } = useAppState();
  const [searchParams] = useSearchParams();
  const availableRecordings = getAvailableRecordingsForCurrentUser(state);
  const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1";
  const fixtureKey = availableRecordings.map(({ response }) => response.id).join(",");
  const fixturePreviews = useMemo(
    () => (fixtureMode ? buildFixtureRecordingPreviews(availableRecordings) : []),
    // The stable id key keeps fixture previews deterministic without rerunning for selector object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fixtureMode, fixtureKey],
  );
  const [previews, setPreviews] = useState<RecordingPreviewSummary[]>(fixturePreviews);
  const [previewLoading, setPreviewLoading] = useState(!fixtureMode);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playbackRequestRef = useRef(0);
  const pollingAttemptsRef = useRef(0);
  const recordingsSearch = searchParams.toString();
  const recordingsHref = `/recordings${recordingsSearch ? `?${recordingsSearch}` : ""}`;
  const buildRecordingHref = (responseId: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("response", responseId);
    return `/recordings?${nextSearchParams.toString()}`;
  };

  useEffect(() => {
    if (fixtureMode) {
      setPreviews(fixturePreviews);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    requestRecordingPreviews()
      .then((recordings) => {
        if (!cancelled) {
          setPreviews(recordings);
          setPreviewError(null);
          pollingAttemptsRef.current = 0;
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewError(
            error instanceof Error ? error.message : "Recording previews could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fixtureMode, fixturePreviews, state.currentUserId]);

  const pendingResponseIds = previews
    .filter((preview) => preview.thumbnailStatus === "pending")
    .map((preview) => preview.responseId)
    .join(",");

  useEffect(() => {
    if (fixtureMode || !pendingResponseIds || pollingAttemptsRef.current >= 12) {
      return;
    }

    let cancelled = false;
    let timer = window.setTimeout(async function poll() {
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(poll, 5000);
        return;
      }

      pollingAttemptsRef.current += 1;
      try {
        const updates = await requestRecordingPreviews({ force: true });
        if (!cancelled) {
          setPreviews((current) => mergeRecordingPreviews(current, updates));
        }
      } catch {
        // Keep the current geometry and let the visible manual retry remain available.
      }

      if (!cancelled && pollingAttemptsRef.current < 12) {
        timer = window.setTimeout(poll, Math.min(20000, 5000 * pollingAttemptsRef.current));
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fixtureMode, pendingResponseIds]);

  function handlePlay(preview: RecordingPreviewSummary, force = false) {
    videoRef.current?.pause();
    if (force) {
      invalidateResponseRecordingUrl(preview.responseId);
    }

    const requestId = ++playbackRequestRef.current;
    setPlayback({ responseId: preview.responseId, status: "loading", url: null, error: null });
    requestResponseRecordingUrl(preview.responseId)
      .then(({ url }) => {
        if (requestId === playbackRequestRef.current) {
          setPlayback({ responseId: preview.responseId, status: "ready", url, error: null });
        }
      })
      .catch((error) => {
        if (requestId === playbackRequestRef.current) {
          setPlayback({
            responseId: preview.responseId,
            status: "error",
            url: null,
            error: error instanceof Error ? error.message : "Recording playback failed.",
          });
        }
      });
  }

  function handleRetryThumbnail(responseId: string) {
    setPreviews((current) =>
      current.map((preview) =>
        preview.responseId === responseId
          ? { ...preview, thumbnailStatus: "pending", thumbnailError: null }
          : preview,
      ),
    );
    requestRecordingPreviews({ force: true, responseIds: [responseId] })
      .then((updates) => setPreviews((current) => mergeRecordingPreviews(current, updates)))
      .catch((error) => {
        setPreviews((current) =>
          current.map((preview) =>
            preview.responseId === responseId
              ? {
                  ...preview,
                  thumbnailStatus: "failed",
                  thumbnailError: error instanceof Error ? error.message : "Preview retry failed.",
                }
              : preview,
          ),
        );
      });
  }

  const recordingCount = fixtureMode ? availableRecordings.length : previews.length;

  return (
    <AppShell
      title="Analytics"
      description={availableRecordingDescription(recordingCount)}
      eyebrowLabel={null}
      headerAlignment="center"
    >
      <Stack className={styles.content} gap="xl">
        <div className={styles.prompt}>
          <Textarea className={styles.promptTextarea} disabled label="Ask about your recordings" />
          <IconButton
            className={styles.promptAction}
            disabled
            label="Submit analytics prompt"
            variant="secondary"
          >
            <ArrowUp aria-hidden="true" size={20} />
          </IconButton>
        </div>

        <Cluster className={styles.actions} gap="md">
          <Button disabled type="button" variant="secondary">
            Get more recordings
          </Button>
          <Button disabled type="button" variant="secondary">
            Share
          </Button>
          <Button disabled type="button" variant="secondary">
            Purchase
          </Button>
        </Cluster>

        <section aria-labelledby="analytics-recordings-heading">
          <Stack gap="md">
            <h2 className={styles.sectionHeading} id="analytics-recordings-heading">
              <Link className={styles.sectionHeadingLink} to={recordingsHref}>
                View recordings
                <ArrowRight aria-hidden="true" size={20} />
              </Link>
            </h2>

            {previewError ? (
              <Alert title="Recordings could not be loaded" tone="danger">
                <Stack gap="sm">
                  <span>{previewError}</span>
                  <Button
                    onClick={() => {
                      setPreviewError(null);
                      setPreviewLoading(true);
                      requestRecordingPreviews({ force: true })
                        .then(setPreviews)
                        .catch((error) =>
                          setPreviewError(
                            error instanceof Error
                              ? error.message
                              : "Recording previews could not be loaded.",
                          ),
                        )
                        .finally(() => setPreviewLoading(false));
                    }}
                    size="compact"
                    type="button"
                    variant="secondary"
                  >
                    Retry
                  </Button>
                </Stack>
              </Alert>
            ) : null}

            {previewLoading && previews.length === 0 ? (
              <Grid as="ul" className={styles.recordingGrid} gap="md">
                {[0, 1].map((index) => (
                  <Card as="li" className={styles.recordingCard} key={index}>
                    <div className={styles.previewFrame}>
                      <Skeleton
                        className={styles.previewSkeleton}
                        label="Loading recording preview"
                      />
                    </div>
                  </Card>
                ))}
              </Grid>
            ) : previews.length > 0 ? (
              <Grid as="ul" className={styles.recordingGrid} gap="md">
                {previews.map((preview, index) => (
                  <RecordingPreviewCard
                    index={index}
                    key={preview.responseId}
                    onPlay={handlePlay}
                    onPlaybackError={(message) => {
                      setPlayback((current) =>
                        current && current.responseId === preview.responseId
                          ? { ...current, status: "error", error: message }
                          : current,
                      );
                    }}
                    onRetryThumbnail={handleRetryThumbnail}
                    playback={playback?.responseId === preview.responseId ? playback : null}
                    preview={preview}
                    recordingHref={buildRecordingHref(preview.responseId)}
                    videoRef={videoRef}
                  />
                ))}
              </Grid>
            ) : null}
          </Stack>
        </section>
      </Stack>
    </AppShell>
  );
}
