import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, VideoOff } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  EmptyState,
  IconButton,
  Link,
  Skeleton,
  Stack,
  Surface,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDateTime } from "../lib/format";
import { requestResponseRecordingUrl } from "../lib/recordings";
import { getAvailableRecordingsForCurrentUser } from "../lib/selectors";
import styles from "./RecordingViewPage.module.css";

type PlaybackState =
  | { status: "loading"; url: ""; fileName: ""; error: "" }
  | { status: "ready"; url: string; fileName: string; error: "" }
  | { status: "error"; url: ""; fileName: ""; error: string };

const initialPlaybackState: PlaybackState = {
  status: "loading",
  url: "",
  fileName: "",
  error: "",
};

export function RecordingViewPage() {
  const { state } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const [playbackState, setPlaybackState] = useState<PlaybackState>(initialPlaybackState);
  const [retryKey, setRetryKey] = useState(0);
  const availableRecordings = useMemo(() => getAvailableRecordingsForCurrentUser(state), [state]);
  const requestedResponseId = searchParams.get("response")?.trim() ?? "";
  const requestedRecordingIndex = requestedResponseId
    ? availableRecordings.findIndex(({ response }) => response.id === requestedResponseId)
    : 0;
  const selectedRecordingIndex = requestedRecordingIndex >= 0 ? requestedRecordingIndex : 0;
  const selectedRecording = availableRecordings[selectedRecordingIndex] ?? null;
  const useDesignSystemFixture = import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1";
  const usePlaybackErrorFixture =
    useDesignSystemFixture && searchParams.get("ds-recording-error") === "1";

  useEffect(() => {
    if (!requestedResponseId || requestedRecordingIndex >= 0) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("response");
    setSearchParams(nextSearchParams, { replace: true });
  }, [requestedRecordingIndex, requestedResponseId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedRecording) {
      setPlaybackState(initialPlaybackState);
      return;
    }

    let cancelled = false;
    setPlaybackState(initialPlaybackState);

    if (useDesignSystemFixture) {
      setPlaybackState(
        usePlaybackErrorFixture
          ? {
              status: "error",
              url: "",
              fileName: "",
              error: "The recording could not be loaded right now.",
            }
          : {
              status: "ready",
              url: "",
              fileName: selectedRecording.recording.fileName,
              error: "",
            },
      );
      return;
    }

    void requestResponseRecordingUrl(selectedRecording.response.id)
      .then((recordingUrl) => {
        if (cancelled) {
          return;
        }

        setPlaybackState({
          status: "ready",
          url: recordingUrl.url,
          fileName: recordingUrl.fileName,
          error: "",
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setPlaybackState({
          status: "error",
          url: "",
          fileName: "",
          error:
            error instanceof Error ? error.message : "The recording could not be loaded right now.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [retryKey, selectedRecording, useDesignSystemFixture, usePlaybackErrorFixture]);

  const selectRecording = useCallback(
    (nextIndex: number) => {
      const nextRecording = availableRecordings[nextIndex];

      if (!nextRecording) {
        return;
      }

      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.set("response", nextRecording.response.id);
      setSearchParams(nextSearchParams);
    },
    [availableRecordings, searchParams, setSearchParams],
  );

  const positionLabel = useMemo(() => {
    if (!selectedRecording) {
      return "";
    }

    return `Recording ${selectedRecordingIndex + 1} of ${availableRecordings.length}`;
  }, [availableRecordings.length, selectedRecording, selectedRecordingIndex]);

  const handlePlaybackError = () => {
    setPlaybackState({
      status: "error",
      url: "",
      fileName: "",
      error: "The recording video could not be played. Reload the video to try again.",
    });
  };

  return (
    <AppShell title={selectedRecording ? undefined : "Recordings"} eyebrowLabel={null}>
      {selectedRecording ? (
        <Stack className={styles.content} gap="xl">
          <header className={styles.recordingHeader} aria-live="polite">
            <p className={styles.position}>{positionLabel}</p>
            <h1>{selectedRecording.submission.productName}</h1>
            <p className={styles.submittedAt}>
              Submitted {formatDateTime(selectedRecording.response.submittedAt)}
            </p>
          </header>

          <div className={styles.playerNavigation}>
            <IconButton
              className={styles.previousButton}
              disabled={selectedRecordingIndex === 0}
              label="Previous recording"
              onClick={() => selectRecording(selectedRecordingIndex - 1)}
              size="large"
              type="button"
              variant="secondary"
            >
              <ChevronLeft aria-hidden="true" size={24} />
            </IconButton>

            <Surface className={styles.playerSurface} padding="none" tone="raised">
              {playbackState.status === "loading" ? (
                <div
                  className={styles.playerStatus}
                  aria-busy="true"
                  aria-live="polite"
                  role="status"
                >
                  <span className="ds-sr-only">Loading recording</span>
                  <Skeleton className={styles.playerSkeleton} />
                </div>
              ) : playbackState.status === "error" ? (
                <div className={styles.playerStatus}>
                  <Alert tone="danger" title="Recording unavailable">
                    <Stack gap="md">
                      <p>{playbackState.error}</p>
                      <div>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setRetryKey((key) => key + 1)}
                        >
                          Reload video
                        </Button>
                      </div>
                    </Stack>
                  </Alert>
                </div>
              ) : (
                <video
                  aria-label={`${positionLabel}: ${selectedRecording.submission.productName}`}
                  className={styles.video}
                  controls
                  key={`${selectedRecording.response.id}-${playbackState.url}`}
                  playsInline
                  preload="metadata"
                  src={playbackState.url || undefined}
                  title={playbackState.fileName || selectedRecording.recording.fileName}
                  onError={handlePlaybackError}
                >
                  Your browser does not support embedded video playback.
                </video>
              )}
            </Surface>

            <IconButton
              className={styles.nextButton}
              disabled={selectedRecordingIndex === availableRecordings.length - 1}
              label="Next recording"
              onClick={() => selectRecording(selectedRecordingIndex + 1)}
              size="large"
              type="button"
              variant="secondary"
            >
              <ChevronRight aria-hidden="true" size={24} />
            </IconButton>
          </div>

          <Surface
            as="section"
            aria-labelledby="recording-transcript-heading"
            className={styles.transcript}
            tone="subtle"
          >
            <Stack gap="sm">
              <h2 id="recording-transcript-heading">Transcript</h2>
              <p className={styles.transcriptState}>Transcript unavailable</p>
              <p>
                A transcript has not been added for this recording. Video playback is still
                available above.
              </p>
            </Stack>
          </Surface>
        </Stack>
      ) : (
        <EmptyState
          icon={<VideoOff aria-hidden="true" size={24} />}
          title="No recordings available"
          description="New recordings will appear here after testers submit them."
          action={<Link to="/analytics">Back to analytics</Link>}
        />
      )}
    </AppShell>
  );
}
