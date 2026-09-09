import { Copy, Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Cluster,
  PageHeader,
  Select,
  Skeleton,
  Stack,
  Textarea,
} from "@test4test/design-system";
import { useAppState } from "../context/AppStateContext";
import {
  buildTranscriptReport,
  orderReportRecordings,
  transcriptCoverage,
  transcriptReportFilename,
  type TranscriptReportApp,
  type TranscriptReportData,
} from "../lib/transcriptReport";
import { requestTranscriptReport, retryRecordingTranscript } from "../lib/transcriptReports";
import { buildTranscriptReportFixtures } from "../testing/transcriptReportFixtures";
import styles from "./AnalyticsPage.module.css";

interface ReportSnapshot {
  data: TranscriptReportData;
  exportedAt: string;
}

/** Route-local composition; the parent keys this by account to discard private report state. */
export function AnalyticsTranscriptReport() {
  const { state } = useAppState();
  const [searchParams] = useSearchParams();
  const userId = state.currentUserId;
  const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1";
  const scenario = searchParams.get("ds-transcripts");
  const fixtureReports = useMemo(
    () => (fixtureMode ? buildTranscriptReportFixtures(state, scenario) : null),
    [fixtureMode, state, scenario],
  );
  const [apps, setApps] = useState<TranscriptReportApp[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const retriedFixtures = useRef(new Set<string>());
  const selectionVersion = useRef(0);
  const retryController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let appId = selectedAppId;

    async function refresh() {
      if (!userId || controller.signal.aborted || inFlight || document.visibilityState === "hidden")
        return;
      clearTimeout(timer);
      inFlight = true;
      try {
        const result = fixtureReports
          ? {
              apps: [...fixtureReports.values()].map((report) => report.app),
              report: structuredClone(
                (appId ? fixtureReports.get(appId) : [...fixtureReports.values()][0]) ?? null,
              ),
            }
          : await requestTranscriptReport(userId, appId, controller.signal);
        if (controller.signal.aborted) return;
        appId ??= result.report?.app.id ?? null;
        if (fixtureReports && result.report) {
          result.report.recordings = result.report.recordings.map((recording) =>
            retriedFixtures.current.has(recording.responseId)
              ? { ...recording, status: "ready" }
              : recording,
          );
        }
        setApps(result.apps);
        setError(null);
        const report = result.report;
        setSnapshot((current) => {
          if (!report) return null;
          if (JSON.stringify(current?.data) === JSON.stringify(report)) return current;
          return {
            data: report,
            exportedAt: fixtureMode ? "2026-09-08T12:00:00.000Z" : new Date().toISOString(),
          };
        });
        if (report && transcriptCoverage(report.recordings).preparing > 0)
          timer = setTimeout(refresh, 5000);
      } catch {
        if (!controller.signal.aborted) {
          setSnapshot(null);
          setError("The report could not be loaded. Try again.");
        }
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    setLoading(true);
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
      else clearTimeout(timer);
    };
    const onFocus = () => {
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [fixtureMode, fixtureReports, selectedAppId, revision, userId]);

  useEffect(
    () => () => {
      selectionVersion.current++;
      retryController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (copyFailed && previewOpen) {
      previewRef.current?.focus();
      previewRef.current?.select();
    }
  }, [copyFailed, previewOpen]);

  const reportText = useMemo(
    () =>
      snapshot
        ? buildTranscriptReport(snapshot.data, snapshot.exportedAt, window.location.origin)
        : "",
    [snapshot],
  );
  const coverage = transcriptCoverage(snapshot?.data.recordings ?? []);
  const canExport = Boolean(snapshot && coverage.ready > 0 && !loading);
  const recordings = orderReportRecordings(snapshot?.data.recordings ?? []);

  async function copyReport() {
    if (!canExport) return;
    const version = selectionVersion.current;
    setCopyFailed(false);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(reportText);
      if (version === selectionVersion.current) setNotice("Report copied.");
    } catch {
      if (version !== selectionVersion.current) return;
      setPreviewOpen(true);
      setCopyFailed(true);
      setNotice(
        "Copy is unavailable in this browser. Select the report below to copy it manually, or download it.",
      );
    }
  }

  function downloadReport() {
    if (!snapshot || !canExport) return;
    const url = URL.createObjectURL(new Blob([reportText], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = transcriptReportFilename(snapshot.data.app.productName, snapshot.exportedAt);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function retry(responseId: string) {
    if (!userId || retrying) return;
    const version = selectionVersion.current;
    const controller = new AbortController();
    retryController.current = controller;
    setRetrying(responseId);
    setNotice("");
    try {
      if (fixtureMode) retriedFixtures.current.add(responseId);
      else await retryRecordingTranscript(userId, responseId, controller.signal);
      if (version !== selectionVersion.current) return;
      setNotice("Transcription retry requested.");
      setRevision((value) => value + 1);
    } catch {
      if (version === selectionVersion.current)
        setNotice("Transcription could not be retried. Refresh the report and try again.");
    } finally {
      if (version === selectionVersion.current) setRetrying(null);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Transcript report"
        description="Copy or download your app's transcripts, then add your own question in ChatGPT, Claude, or another LLM."
        alignment="center"
      />
      {apps.length > 1 ? (
        <Select
          label="App"
          value={selectedAppId ?? snapshot?.data.app.id ?? apps[0]?.id ?? ""}
          onChange={(event) => {
            selectionVersion.current++;
            retryController.current?.abort();
            setSelectedAppId(event.target.value);
            setSnapshot(null);
            setLoading(true);
            setError(null);
            setNotice("");
            setCopyFailed(false);
            setPreviewOpen(false);
            setRetrying(null);
          }}
        >
          {apps.map((app) => (
            <option key={app.id} value={app.id}>
              {app.productName}
            </option>
          ))}
        </Select>
      ) : null}
      {loading && !snapshot ? <Skeleton label="Loading transcript report" /> : null}
      {error ? (
        <Alert title="Report unavailable" tone="danger">
          <Stack gap="sm">
            <span>{error}</span>
            <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
              Retry report
            </Button>
          </Stack>
        </Alert>
      ) : null}
      {!loading && !error && !snapshot ? (
        <p className={styles.reportStatus}>
          Your transcript report will appear here when you have a recording.
        </p>
      ) : null}
      {snapshot ? (
        <>
          <p className={styles.reportStatus} role="status">
            {coverage.ready} of {coverage.total}{" "}
            {coverage.total === 1 ? "transcript" : "transcripts"} ready for{" "}
            {snapshot.data.app.productName}.
            {coverage.preparing > 0
              ? ` ${coverage.preparing} ${coverage.preparing === 1 ? "is" : "are"} being prepared automatically.`
              : ""}
            {coverage.ready < coverage.total ? " The report lists any missing transcripts." : ""}
          </p>
          {coverage.failed > 0 ? (
            <Alert title="Some transcripts need another attempt" tone="warning">
              <Stack gap="sm">
                {recordings.map((recording, index) =>
                  recording.status === "failed" ? (
                    <Cluster key={recording.responseId} gap="md">
                      <span>Recording {index + 1}: transcription failed.</span>
                      <Button
                        variant="secondary"
                        disabled={retrying !== null}
                        onClick={() => {
                          void retry(recording.responseId);
                        }}
                      >
                        {retrying === recording.responseId
                          ? "Retrying…"
                          : `Retry transcript ${index + 1}`}
                      </Button>
                    </Cluster>
                  ) : null,
                )}
              </Stack>
            </Alert>
          ) : null}
        </>
      ) : null}
      <Cluster className={styles.actions} gap="md">
        <Button
          disabled={!canExport}
          onClick={() => {
            void copyReport();
          }}
        >
          <Copy aria-hidden="true" size={20} />
          Copy report
        </Button>
        <Button disabled={!canExport} variant="secondary" onClick={downloadReport}>
          <Download aria-hidden="true" size={20} />
          Download report
        </Button>
      </Cluster>
      {notice ? (
        <p className={styles.reportStatus} role="status">
          {notice}
        </p>
      ) : null}
      {snapshot ? (
        <Stack gap="md">
          <Button
            variant="quiet"
            aria-expanded={previewOpen}
            aria-controls="transcript-report-preview"
            onClick={() => setPreviewOpen((value) => !value)}
          >
            {previewOpen ? "Hide report preview" : "Preview report"}
          </Button>
          {previewOpen ? (
            <div id="transcript-report-preview">
              <Textarea
                ref={previewRef}
                className={styles.reportPreview}
                label="Report preview"
                helpText="This is the exact text included when you copy or download the report."
                readOnly
                rows={12}
                value={reportText}
              />
            </div>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
