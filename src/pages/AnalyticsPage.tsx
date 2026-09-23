import { ArrowRight, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Grid,
  IconButton,
  Link,
  Skeleton,
  Stack,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import {
  buildFixtureRecordingPreviews,
  mergeRecordingPreviews,
  requestRecordingPreviews,
} from "../lib/recordingPreviews";
import { getAvailableRecordingsForCurrentUser } from "../lib/selectors";
import type { RecordingPreviewSummary } from "../types";
import { AnalyticsTranscriptReport } from "./AnalyticsTranscriptReport";
import styles from "./AnalyticsPage.module.css";

function RecordingPreviewCard({
  preview,
  index,
  onPlay,
  onRetryThumbnail,
}: {
  preview: RecordingPreviewSummary;
  index: number;
  onPlay: (preview: RecordingPreviewSummary) => void;
  onRetryThumbnail: (responseId: string) => void;
}) {
  return (
    <Card as="li" className={styles.recordingCard}>
      <div className={styles.previewFrame}>
        {preview.thumbnail?.url ? (
          <img
            alt={`${preview.productName} recording preview`}
            className={styles.thumbnail}
            decoding="async"
            height={preview.thumbnail.height ?? 540}
            loading="lazy"
            src={preview.thumbnail.url}
            width={preview.thumbnail.width ?? 960}
          />
        ) : preview.feedbackAccess === "locked" ? null : (
          <Skeleton
            className={styles.previewSkeleton}
            label={
              preview.thumbnailStatus === "failed"
                ? "Recording preview unavailable"
                : "Generating recording preview"
            }
          />
        )}

        <IconButton
          className={styles.playButton}
          label={`Play Recording ${index + 1}: ${preview.productName}`}
          onClick={() => onPlay(preview)}
          type="button"
          variant="secondary"
        >
          <Play aria-hidden="true" fill="currentColor" size={20} />
        </IconButton>
      </div>

      {preview.thumbnailStatus === "failed" ? (
        <Stack className={styles.recordingAlerts} gap="xs">
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
        </Stack>
      ) : null}
    </Card>
  );
}

export function AnalyticsPage() {
  const { state } = useAppState();
  const navigate = useNavigate();
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
  const recordingGroups = useMemo(() => {
    const groups = new Map<
      string,
      { productName: string; recordings: (RecordingPreviewSummary & { index: number })[] }
    >();
    previews.forEach((preview, index) => {
      const group = groups.get(preview.submissionId) ?? {
        productName: preview.productName,
        recordings: [],
      };
      group.recordings.push({ ...preview, index });
      groups.set(preview.submissionId, group);
    });
    return [...groups];
  }, [previews]);
  const [previewLoading, setPreviewLoading] = useState(!fixtureMode);
  const [previewError, setPreviewError] = useState<string | null>(null);
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
        const updates = await requestRecordingPreviews({
          force: true,
          responseIds: pendingResponseIds.split(","),
        });
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

  function handlePlay(preview: RecordingPreviewSummary) {
    navigate(buildRecordingHref(preview.responseId));
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

  return (
    <AppShell>
      <Stack className={styles.content} gap="xl">
        <section aria-label="Recordings">
          <Stack gap="md">
            {recordingGroups.length === 0 ? (
              <h2 className={styles.sectionHeading}>
                <Link className={styles.sectionHeadingLink} to={recordingsHref}>
                  <span>View recordings</span>
                  <ArrowRight aria-hidden="true" size={20} />
                </Link>
              </h2>
            ) : null}

            {!previewLoading && !previewError && previews.length === 0 ? (
              <p className={styles.emptyRecordings}>
                You have no recordings. <Link to="/share">Share your test</Link> or{" "}
                <Link to="/earn">earn credits</Link>
              </p>
            ) : null}

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
              recordingGroups.map(([submissionId, group]) => (
                <Stack gap="md" key={submissionId}>
                  <h2 className={styles.sectionHeading}>
                    <Link
                      className={styles.sectionHeadingLink}
                      to={
                        recordingGroups.length === 1
                          ? recordingsHref
                          : buildRecordingHref(group.recordings[0].responseId)
                      }
                    >
                      <span>View recordings</span>
                      <ArrowRight aria-hidden="true" size={20} />
                    </Link>
                  </h2>
                  <Grid as="ul" className={styles.recordingGrid} gap="md">
                    {group.recordings.map((preview) => (
                      <RecordingPreviewCard
                        index={preview.index}
                        key={preview.responseId}
                        onPlay={handlePlay}
                        onRetryThumbnail={handleRetryThumbnail}
                        preview={preview}
                      />
                    ))}
                  </Grid>
                </Stack>
              ))
            ) : null}
          </Stack>
        </section>

        <AnalyticsTranscriptReport key={state.currentUserId ?? "guest"} />
      </Stack>
    </AppShell>
  );
}
