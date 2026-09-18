import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Alert, Button, Skeleton, Stack, Surface } from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { loadSharedRecording } from "../lib/recordingShare";
import styles from "./RecordingViewPage.module.css";

export function SharedRecordingPage() {
  const { hash } = useLocation();
  const [recording, setRecording] = useState<Awaited<
    ReturnType<typeof loadSharedRecording>
  > | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRecording(null);
    setError("");
    void loadSharedRecording(hash.slice(1))
      .then((value) => {
        if (!cancelled) setRecording(value);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "This recording is unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [hash, retry]);

  return (
    <AppShell eyebrowLabel={null} hideMemberChrome>
      <Stack className={styles.content} gap="xl">
        <header className={styles.recordingHeader}>
          <p className={styles.position}>Shared recording</p>
          <h1>{recording?.productName ?? "View recording"}</h1>
        </header>
        {error ? (
          <Alert tone="danger" title="Recording unavailable">
            <Stack gap="md">
              <p>{error}</p>
              <div>
                <Button onClick={() => setRetry((value) => value + 1)}>Try again</Button>
              </div>
            </Stack>
          </Alert>
        ) : recording ? (
          <Surface className={styles.playerSurface} padding="none" tone="raised">
            <video
              aria-label={`${recording.productName} recording`}
              className={styles.video}
              controls
              playsInline
              preload="metadata"
              src={recording.url || undefined}
              title={recording.fileName}
              onError={() => setError("The video could not be played. Try again to reload it.")}
            >
              Your browser does not support embedded video playback.
            </video>
          </Surface>
        ) : (
          <div className={styles.playerStatus} role="status" aria-busy="true">
            <span className="ds-sr-only">Loading recording</span>
            <Skeleton className={styles.playerSkeleton} />
          </div>
        )}
      </Stack>
    </AppShell>
  );
}
