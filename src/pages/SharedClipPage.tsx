import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Alert, Button, Link, Stack, Surface } from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { loadPublicClip, type PublicClip } from "../lib/recordingClips";
import styles from "./RecordingViewPage.module.css";

export function SharedClipPage() {
  const { hash } = useLocation();
  const [clip, setClip] = useState<PublicClip | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setClip(null);
    setError("");
    const load = async () => {
      try {
        const result = await loadPublicClip(hash.slice(1));
        if (cancelled) return;
        setClip(result);
        if (["pending", "processing"].includes(result.status))
          timer = setTimeout(() => void load(), 3000);
      } catch (reason) {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "This clip is unavailable.");
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hash, retry]);
  return (
    <AppShell eyebrowLabel={null} hideMemberChrome>
      <title>Shared clip · Test4Test</title>
      <meta name="robots" content="noindex, nofollow" />
      <meta name="referrer" content="no-referrer" />
      <Stack className={styles.content} gap="lg">
        <header className={styles.recordingHeader}>
          <p className={styles.position}>Shared clip</p>
          <h1>{clip?.productName ?? "View clip"}</h1>
        </header>
        {error || clip?.status === "failed" ? (
          <Alert tone="danger" title="Clip unavailable">
            <Stack>
              <p>
                {error ||
                  "This clip could not be created. Please ask the person who shared it to retry the export."}
              </p>
              <Button onClick={() => setRetry((value) => value + 1)}>Try again</Button>
            </Stack>
          </Alert>
        ) : clip?.status === "ready" ? (
          <>
            <Surface className={styles.playerSurface} padding="none" tone="raised">
              <video
                className={styles.video}
                controls
                playsInline
                preload="metadata"
                src={clip.url || undefined}
                aria-label={`${clip.productName} clip`}
                onError={() => setError("The video could not be played. Try again to reload it.")}
              />
            </Surface>
            {clip.downloadUrl && (
              <Link external to={clip.downloadUrl} download="clip.mp4">
                Download MP4
              </Link>
            )}
          </>
        ) : (
          <p role="status" aria-live="polite">
            {clip ? "Your clip is being created. It will appear here when ready." : "Loading clip…"}
          </p>
        )}
      </Stack>
    </AppShell>
  );
}
