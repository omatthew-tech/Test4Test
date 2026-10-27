import { ArrowRight, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { buildFixtureRecordingPreviews, requestRecordingPreviews } from "../lib/recordingPreviews";
import { getAvailableRecordingsForCurrentUser } from "../lib/selectors";
import type { RecordingPreviewSummary } from "../types";
import { AnalyticsTranscriptReport } from "./AnalyticsTranscriptReport";
import styles from "./AnalyticsPage.module.css";

function RecordingPreviewCard({
  preview,
  index,
  onPlay,
}: {
  preview: RecordingPreviewSummary;
  index: number;
  onPlay: (preview: RecordingPreviewSummary) => void;
}) {
  return (
    <Card as="li" className={styles.recordingCard}>
      <div className={styles.previewFrame}>
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
  const hasNoRecordings = !previewLoading && !previewError && previews.length === 0;
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

  function handlePlay(preview: RecordingPreviewSummary) {
    navigate(buildRecordingHref(preview.responseId));
  }

  return (
    <AppShell>
      {hasNoRecordings ? <h1 className="ds-sr-only">Analyze</h1> : null}
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

            {hasNoRecordings ? (
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
                        preview={preview}
                      />
                    ))}
                  </Grid>
                </Stack>
              ))
            ) : null}
          </Stack>
        </section>

        {!hasNoRecordings ? (
          <AnalyticsTranscriptReport key={state.currentUserId ?? "guest"} />
        ) : null}
      </Stack>
    </AppShell>
  );
}
