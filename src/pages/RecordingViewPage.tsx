import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LockKeyhole, VideoOff } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Cluster,
  EmptyState,
  IconButton,
  Link,
  PageHeader,
  Skeleton,
  Select,
  Stack,
  Surface,
  VideoPlayer,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDateTime } from "../lib/format";
import {
  invalidateResponseRecordingUrl,
  requestResponseRecordingUrl,
  requestResponseRecordingPreview,
} from "../lib/recordings";
import { getAvailableRecordingsForCurrentUser } from "../lib/selectors";
import type { OpenFeedbackResult } from "../lib/feedbackAccess";
import { isTestAccountEmail } from "../lib/supabase";
import {
  loadResponseVersions,
  RecordingHistoryError,
  recordingVersionLabel,
  type TestResponseVersion,
} from "../lib/responseVersions";
import styles from "./RecordingViewPage.module.css";
import { RecordingTranscript } from "./RecordingTranscript";
import { RecordingFeedback } from "./RecordingFeedback";
import { RecordingClipEditor } from "./RecordingClipEditor";

type PlaybackState = { key: string } & (
  | { status: "loading"; url: ""; fileName: ""; error: "" }
  | { status: "ready"; url: string; fileName: string; error: "" }
  | { status: "error"; url: ""; fileName: ""; error: string }
);

const initialPlaybackState: PlaybackState = {
  key: "",
  status: "loading",
  url: "",
  fileName: "",
  error: "",
};

export function RecordingViewPage() {
  const { state, currentUser, openFeedback } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const previewRequested = searchParams.get("preview") === "out-of-credits";
  const previewOutOfCredits = previewRequested && isTestAccountEmail(currentUser?.email);
  const recordings = getAvailableRecordingsForCurrentUser(state);
  const requestedId = searchParams.get("response")?.trim();
  const selectedIndex = requestedId
    ? recordings.findIndex((item) => item.response.id === requestedId)
    : 0;
  const selected = recordings[selectedIndex];
  const responseId = selected?.response.id;
  const versionId = searchParams.get("version")?.trim() || undefined;
  const accessKey = `${state.currentUserId}:${responseId}:${versionId ?? "latest"}`;
  const [attempt, setAttempt] = useState(0);
  const [access, setAccess] = useState<{
    key: string;
    result?: OpenFeedbackResult;
    error?: string;
  } | null>(null);
  const currentAccess = access?.key === accessKey ? access : null;

  useEffect(() => {
    // A test-account preview must never call the opening operation or change the ledger.
    if (!responseId || previewRequested) return;
    let cancelled = false;
    void openFeedback(responseId, versionId)
      .then((result) => {
        if (!cancelled) setAccess({ key: accessKey, result });
      })
      .catch((error) => {
        if (!cancelled)
          setAccess({
            key: accessKey,
            error:
              error instanceof Error
                ? error.message
                : "Feedback access could not be verified. Try again.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [accessKey, responseId, versionId, openFeedback, attempt, previewRequested]);

  // Returning to this tab after earning elsewhere retries only a previously blocked open.
  useEffect(() => {
    if (previewRequested || currentAccess?.result?.status !== "insufficient_credits") return;
    const retry = () => {
      if (document.visibilityState === "visible") setAttempt((value) => value + 1);
    };
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", retry);
    return () => {
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [currentAccess?.result?.status, previewRequested]);

  if (
    !previewRequested &&
    (currentAccess?.result?.status === "free" || currentAccess?.result?.status === "unlocked")
  )
    return <RecordingContent />;

  const unavailable =
    (Boolean(requestedId) && !selected) || currentAccess?.result?.status === "unavailable";
  const blocked = previewOutOfCredits || currentAccess?.result?.status === "insufficient_credits";
  if (blocked) return <RecordingPreviewContent key={accessKey} simulation={previewOutOfCredits} />;
  return (
    <AppShell eyebrowLabel={null}>
      <Stack className={styles.content} gap="xl">
        <PageHeader title="Recordings" />
        {previewRequested && !previewOutOfCredits ? (
          <EmptyState
            title="Test account required"
            description="Sign in with the test account to preview this screen. Your credits have not changed."
          />
        ) : currentAccess?.error ? (
          <Alert tone="danger" title="Feedback could not be loaded">
            <Stack gap="md">
              <p>{currentAccess.error}</p>
              <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
            </Stack>
          </Alert>
        ) : unavailable || !selected ? (
          <EmptyState
            title={unavailable ? "Recording unavailable" : "No recordings available"}
            description={
              unavailable
                ? "This recording could not be found."
                : "New recordings will appear here after testers submit them."
            }
          />
        ) : (
          <Skeleton label="Checking feedback access" />
        )}
        <Cluster>
          <Link to="/analytics">Back to analytics</Link>
          {selectedIndex > 0 ? (
            <Button
              variant="secondary"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("response", recordings[selectedIndex - 1].response.id);
                next.delete("version");
                setSearchParams(next);
              }}
            >
              Previous recording
            </Button>
          ) : null}
          {selected && selectedIndex < recordings.length - 1 ? (
            <Button
              variant="secondary"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set("response", recordings[selectedIndex + 1].response.id);
                next.delete("version");
                setSearchParams(next);
              }}
            >
              Next recording
            </Button>
          ) : null}
        </Cluster>
      </Stack>
    </AppShell>
  );
}

function RecordingPreviewContent({ simulation }: { simulation: boolean }) {
  const { state } = useAppState();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const recordings = getAvailableRecordingsForCurrentUser(state);
  const requestedId = searchParams.get("response");
  const index = requestedId ? recordings.findIndex((item) => item.response.id === requestedId) : 0;
  const selected = recordings[index];
  const responseId = selected?.response.id;
  const versionId = searchParams.get("version") || undefined;
  const fixture = import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1";
  const [retry, setRetry] = useState(0);
  const [media, setMedia] = useState<{ url?: string; seconds?: number; error?: string }>({});
  useEffect(() => {
    setMedia({});
    if (simulation || fixture) {
      setMedia({ url: "/videos/feedback-preview-demo.mp4", seconds: 15 });
      return;
    }
    if (!responseId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const load = async () => {
      try {
        const result = await requestResponseRecordingPreview(
          responseId,
          versionId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (result.status === "ready")
          setMedia({ url: result.url, seconds: result.previewSeconds });
        else if (Date.now() - started < 120000) timer = setTimeout(() => void load(), 2000);
        else
          setMedia({ error: "The recording preview is still being prepared. Try again shortly." });
      } catch (error) {
        if (!controller.signal.aborted)
          setMedia({
            error:
              error instanceof Error ? error.message : "Recording preview could not be loaded.",
          });
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [responseId, versionId, simulation, fixture, retry]);
  const select = (nextIndex: number) => {
    const next = new URLSearchParams(searchParams);
    next.set("response", recordings[nextIndex].response.id);
    next.delete("version");
    setSearchParams(next);
  };
  const position = selected
    ? `Recording ${index + 1} of ${recordings.length}`
    : "Recording preview";
  return (
    <AppShell eyebrowLabel={null}>
      <Stack className={styles.content} gap="xl">
        <header className={styles.recordingHeader}>
          <p className={styles.position}>{position}</p>
          <h1>{selected?.submission.productName ?? "Recording preview"}</h1>
          {selected && (
            <p className={styles.submittedAt}>{formatDateTime(selected.response.submittedAt)}</p>
          )}
        </header>
        <div className={styles.playerNavigation}>
          <IconButton
            className={styles.previousButton}
            disabled={index <= 0}
            label="Previous recording"
            onClick={() => select(index - 1)}
            size="large"
            variant="secondary"
          >
            <ChevronLeft aria-hidden="true" size={24} />
          </IconButton>
          <Surface className={styles.playerSurface} padding="none" tone="raised">
            {media.error ? (
              <div className={styles.playerStatus}>
                <Alert tone="danger" title="Recording preview unavailable">
                  <Stack>
                    <p>{media.error}</p>
                    <Button onClick={() => setRetry((value) => value + 1)}>Reload video</Button>
                  </Stack>
                </Alert>
              </div>
            ) : !media.url ? (
              <div className={styles.playerStatus}>
                <Skeleton label="Preparing recording preview" />
              </div>
            ) : (
              <VideoPlayer
                key={`${media.url}:${retry}`}
                label={`${position}: ${selected?.submission.productName ?? "Preview"}`}
                src={media.url}
                durationHint={selected?.response.durationSeconds ?? 222}
                onError={() =>
                  setMedia({
                    error:
                      "The recording preview could not be played. Reload the video to try again.",
                  })
                }
                preview={{
                  seconds: media.seconds ?? 15,
                  overlay: (
                    <Stack className={styles.creditLock} gap="lg">
                      <LockKeyhole className={styles.lockIcon} aria-hidden="true" />
                      <h2>You're out of credits</h2>
                      <p>Someone tested your app but you haven't tested-back their app</p>
                      <Cluster className={styles.lockActions}>
                        <Button onClick={() => navigate("/earn")}>Earn credits</Button>
                        <Button
                          className={styles.buyCredits}
                          variant="secondary"
                          onClick={() =>
                            navigate({
                              pathname: "/buy-credits",
                              search: fixture ? searchParams.toString() : "",
                            })
                          }
                        >
                          Buy credits
                        </Button>
                      </Cluster>
                    </Stack>
                  ),
                }}
              />
            )}
          </Surface>
          <IconButton
            className={styles.nextButton}
            disabled={!selected || index >= recordings.length - 1}
            label="Next recording"
            onClick={() => select(index + 1)}
            size="large"
            variant="secondary"
          >
            <ChevronRight aria-hidden="true" size={24} />
          </IconButton>
        </div>
        <Link to="/analytics">Back to analytics</Link>
      </Stack>
    </AppShell>
  );
}

function RecordingContent() {
  const { state } = useAppState();
  const [searchParams, setSearchParams] = useSearchParams();
  const [playbackState, setPlaybackState] = useState<PlaybackState>(initialPlaybackState);
  const [playbackRetryKey, setPlaybackRetryKey] = useState(0);
  const [historyRetryKey, setHistoryRetryKey] = useState(0);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const availableRecordings = useMemo(() => getAvailableRecordingsForCurrentUser(state), [state]);
  const requestedResponseId = searchParams.get("response")?.trim() ?? "";
  const requestedRecordingIndex = requestedResponseId
    ? availableRecordings.findIndex(({ response }) => response.id === requestedResponseId)
    : 0;
  const selectedRecordingIndex = requestedRecordingIndex >= 0 ? requestedRecordingIndex : 0;
  const selectedRecording = availableRecordings[selectedRecordingIndex] ?? null;
  const [history, setHistory] = useState<{
    responseId: string;
    versions: TestResponseVersion[];
  } | null>(null);
  const [historyError, setHistoryError] = useState("");
  const versions =
    history?.responseId === selectedRecording?.response.id ? (history?.versions ?? []) : [];
  const requestedVersionId = searchParams.get("version")?.trim() || undefined;
  const selectedVersion = requestedVersionId
    ? versions.find((item) => item.id === requestedVersionId)
    : versions[0];
  // Current playback uses the same response-only endpoint as Analyze. History is
  // optional metadata, and must never gate access to an existing recording.
  const playbackRecording = requestedVersionId
    ? selectedVersion?.recording
    : selectedRecording?.recording;
  const responseId = selectedRecording?.response.id;
  const playbackKey = `${responseId}:${requestedVersionId ?? "latest"}:${playbackRecording?.bucket}:${playbackRecording?.path}`;
  const currentPlayback = playbackState.key === playbackKey ? playbackState : initialPlaybackState;
  const playbackFileName = playbackRecording?.fileName;
  const canPlay = Boolean(playbackRecording && !playbackRecording.deletedAt);
  useEffect(() => {
    if (!selectedRecording) return;
    let cancelled = false;
    setHistory(null);
    setHistoryError("");
    void loadResponseVersions(selectedRecording.response)
      .then((versions) => {
        if (!cancelled) setHistory({ responseId: selectedRecording.response.id, versions });
      })
      .catch((error) => {
        if (cancelled) return;
        if (
          error instanceof RecordingHistoryError &&
          (error.code === "PGRST205" || error.code === "42P01")
        ) {
          // Version history has not been deployed on every backend yet. Do not
          // fabricate a version ID: current recordings still use response IDs.
          setHistory({ responseId: selectedRecording.response.id, versions: [] });
          return;
        }
        setHistoryError(
          error instanceof Error
            ? error.message
            : "Recording history could not be loaded. Try again.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRecording, historyRetryKey]);
  const useDesignSystemFixture = import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1";
  const usePlaybackMediaFixture =
    useDesignSystemFixture && searchParams.get("ds-recording-media") === "demo";
  const usePlaybackErrorFixture =
    useDesignSystemFixture && searchParams.get("ds-recording-error") === "1";

  useEffect(() => {
    if (!requestedResponseId || requestedRecordingIndex >= 0) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("response");
    nextSearchParams.delete("version");
    setSearchParams(nextSearchParams, { replace: true });
  }, [requestedRecordingIndex, requestedResponseId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!responseId || !canPlay) {
      setPlaybackState(initialPlaybackState);
      return;
    }

    let cancelled = false;
    setPlaybackState({ ...initialPlaybackState, key: playbackKey });

    if (useDesignSystemFixture) {
      setPlaybackState(
        usePlaybackErrorFixture
          ? {
              key: playbackKey,
              status: "error",
              url: "",
              fileName: "",
              error: "The recording could not be loaded right now.",
            }
          : {
              key: playbackKey,
              status: "ready",
              url: usePlaybackMediaFixture ? "/videos/home-share-test.mp4" : "",
              fileName: playbackFileName ?? "",
              error: "",
            },
      );
      return;
    }

    void requestResponseRecordingUrl(responseId, false, requestedVersionId)
      .then((recordingUrl) => {
        if (cancelled) {
          return;
        }

        setPlaybackState({
          key: playbackKey,
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
          key: playbackKey,
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
  }, [
    playbackRetryKey,
    responseId,
    requestedVersionId,
    playbackKey,
    playbackFileName,
    canPlay,
    useDesignSystemFixture,
    usePlaybackMediaFixture,
    usePlaybackErrorFixture,
  ]);

  const selectRecording = useCallback(
    (nextIndex: number) => {
      const nextRecording = availableRecordings[nextIndex];

      if (!nextRecording) {
        return;
      }

      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.set("response", nextRecording.response.id);
      nextSearchParams.delete("version");
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
      key: playbackKey,
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
              {formatDateTime(
                selectedVersion?.submittedAt ?? selectedRecording.response.submittedAt,
              )}
            </p>
          </header>

          {versions.length > 1 ? (
            <Select
              label="Recording version"
              value={selectedVersion?.id ?? ""}
              onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                next.set("version", event.target.value);
                setSearchParams(next);
              }}
            >
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {recordingVersionLabel(version.versionNumber)} —{" "}
                  {formatDateTime(version.submittedAt)}
                </option>
              ))}
            </Select>
          ) : null}
          {historyError ? (
            <Alert tone={requestedVersionId ? "danger" : "warning"}>
              {historyError}
              <Button onClick={() => setHistoryRetryKey((key) => key + 1)}>Try again</Button>
            </Alert>
          ) : null}
          {requestedVersionId &&
          history?.responseId === selectedRecording.response.id &&
          !selectedVersion ? (
            <Alert tone="danger">This recording version is unavailable.</Alert>
          ) : null}
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
              {(requestedVersionId &&
                (historyError ||
                  (history?.responseId === selectedRecording.response.id && !selectedVersion))) ||
              playbackRecording?.deletedAt ? (
                <div className={styles.playerStatus}>
                  <p>This recording version is unavailable.</p>
                </div>
              ) : requestedVersionId && selectedVersion && !selectedVersion.recording ? (
                <Stack gap="md">
                  <p>This original feedback contains written answers.</p>
                  {selectedVersion.answers.map((answer) => (
                    <div key={answer.questionId}>
                      <h3>{answer.questionTitle}</h3>
                      <p>{answer.textAnswer ?? answer.selectedOption}</p>
                    </div>
                  ))}
                </Stack>
              ) : currentPlayback.status === "loading" ? (
                <div
                  className={styles.playerStatus}
                  aria-busy="true"
                  aria-live="polite"
                  role="status"
                >
                  <span className="ds-sr-only">Loading recording</span>
                  <Skeleton className={styles.playerSkeleton} />
                </div>
              ) : currentPlayback.status === "error" ? (
                <div className={styles.playerStatus}>
                  <Alert tone="danger" title="Recording unavailable">
                    <Stack gap="md">
                      <p>{currentPlayback.error}</p>
                      <div>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            invalidateResponseRecordingUrl(selectedRecording.response.id);
                            setPlaybackRetryKey((key) => key + 1);
                          }}
                        >
                          Reload video
                        </Button>
                      </div>
                    </Stack>
                  </Alert>
                </div>
              ) : (
                <RecordingClipEditor
                  key={playbackKey}
                  video={videoElement}
                  responseId={selectedRecording.response.id}
                  versionId={requestedVersionId}
                  durationHint={
                    selectedVersion?.durationSeconds ?? selectedRecording.response.durationSeconds
                  }
                  renderPlayer={(clipRange, action) => (
                    <VideoPlayer
                      key={`${playbackKey}-${currentPlayback.url}`}
                      videoRef={setVideoElement}
                      label={`${positionLabel}: ${selectedRecording.submission.productName}`}
                      src={currentPlayback.url || undefined}
                      title={
                        currentPlayback.fileName ||
                        selectedRecording.recording?.fileName ||
                        "Recording"
                      }
                      durationHint={
                        selectedVersion?.durationSeconds ??
                        selectedRecording.response.durationSeconds
                      }
                      onError={handlePlaybackError}
                      clipRange={clipRange}
                      actions={action}
                    />
                  )}
                />
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
            <div className={styles.transcript}>
              {(!requestedVersionId ||
                (selectedVersion && selectedVersion.id === versions[0]?.id)) &&
              canPlay ? (
                <RecordingFeedback
                  key={`${state.currentUserId}:${selectedRecording.response.id}:${selectedRecording.response.submittedAt}`}
                  response={selectedRecording.response}
                  userId={state.currentUserId ?? ""}
                  productName={selectedRecording.submission.productName}
                  fixtureMode={useDesignSystemFixture}
                  fixtureContact={
                    useDesignSystemFixture
                      ? state.users.find(
                          (user) => user.id === selectedRecording.response.testerUserId,
                        )
                      : undefined
                  }
                />
              ) : null}
              <RecordingTranscript
                key={`${state.currentUserId}:${playbackKey}`}
                userId={state.currentUserId ?? ""}
                responseId={selectedRecording.response.id}
                versionId={requestedVersionId}
                source={canPlay ? (playbackRecording ?? undefined) : undefined}
                video={videoElement}
                fixtureMode={useDesignSystemFixture}
                fixtureScenario={searchParams.get("ds-recording-transcript")}
              />
            </div>
          </div>
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
