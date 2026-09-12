import fs from 'node:fs';
const edit=(p,fn)=>fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n')));
edit('src/lib/recordings.ts',s=>s.replace('  recordingAccessCache.delete(`${responseId}:play`);\n  recordingAccessCache.delete(`${responseId}:download`);', '  for (const key of recordingAccessCache.keys()) {\n    if (key.startsWith(`${responseId}:`)) recordingAccessCache.delete(key);\n  }')
 .replace('requestResponseRecordingUrl(responseId: string, download = false)', 'requestResponseRecordingUrl(responseId: string, download = false, versionId?: string)')
 .replace('`${responseId}:${download ? "download" : "play"}`','`${responseId}:${versionId ?? "latest"}:${download ? "download" : "play"}`')
 .replace('      responseId,\n      download,','      responseId,\n      versionId,\n      download,'));
edit('src/pages/RecordingViewPage.tsx',s=>s.replace('  Skeleton,','  Skeleton,\n  Select,')
 .replace('import styles from', 'import { loadResponseVersions, recordingVersionLabel, type TestResponseVersion } from "../lib/responseVersions";\nimport styles from')
 .replace('  const selectedRecording = availableRecordings[selectedRecordingIndex] ?? null;', `  const selectedRecording = availableRecordings[selectedRecordingIndex] ?? null;
  const [history, setHistory] = useState<{ responseId: string; versions: TestResponseVersion[] } | null>(null);
  const [historyError, setHistoryError] = useState("");
  const versions = history?.responseId === selectedRecording?.response.id ? history?.versions ?? [] : [];
  const requestedVersionId = searchParams.get("version");
  const selectedVersion = requestedVersionId ? versions.find(item => item.id === requestedVersionId) : versions[0];
  useEffect(() => {
    if (!selectedRecording) return;
    let cancelled = false;
    setHistoryError("");
    void loadResponseVersions(selectedRecording.response).then(versions => {
      if (!cancelled) setHistory({ responseId: selectedRecording.response.id, versions });
    }).catch(error => { if (!cancelled) setHistoryError(error.message); });
    return () => { cancelled = true; };
  }, [selectedRecording, retryKey]);`)
 .replace('    if (!selectedRecording) {\n      setPlaybackState', '    if (!selectedRecording || !selectedVersion) {\n      setPlaybackState')
 .replace('fileName: selectedRecording.recording.fileName,','fileName: selectedVersion.recording?.fileName ?? "",')
 .replace('void requestResponseRecordingUrl(selectedRecording.response.id)', 'void requestResponseRecordingUrl(selectedRecording.response.id, false, selectedVersion.id)')
 .replace('[retryKey, selectedRecording, useDesignSystemFixture, usePlaybackErrorFixture]', '[retryKey, selectedRecording, selectedVersion, useDesignSystemFixture, usePlaybackErrorFixture]')
 .replace('nextSearchParams.set("response", nextRecording.response.id);', 'nextSearchParams.set("response", nextRecording.response.id);\n      nextSearchParams.delete("version");')
 .replace('{formatDateTime(selectedRecording.response.submittedAt)}','{formatDateTime(selectedVersion?.submittedAt ?? selectedRecording.response.submittedAt)}')
 .replace('          <div className={styles.playerNavigation}>', `          {versions.length > 1 ? <Select label="Recording version" value={selectedVersion?.id ?? ""}
            options={versions.map(version => ({ value: version.id, label: \`\${recordingVersionLabel(version.versionNumber)} — \${formatDateTime(version.submittedAt)}\` }))}
            onChange={event => { const next = new URLSearchParams(searchParams); next.set("version", event.target.value); setSearchParams(next); }} /> : null}
          {historyError ? <Alert tone="danger">{historyError}<Button onClick={() => setRetryKey(key => key + 1)}>Try again</Button></Alert> : null}
          {requestedVersionId && history && !selectedVersion ? <Alert tone="danger">This recording version is unavailable.</Alert> : null}
          <div className={styles.playerNavigation}>`)
 .replace('{playbackState.status === "loading" ? (', '{selectedVersion && !selectedVersion.recording ? (<Stack gap="md"><p>This original feedback contains written answers.</p>{selectedVersion.answers.map(answer => <div key={answer.questionId}><h3>{answer.questionTitle}</h3><p>{answer.textAnswer ?? answer.selectedOption}</p></div>)}</Stack>) : playbackState.status === "loading" ? (')
 .replace('key={`${selectedRecording.response.id}-${playbackState.url}`}', 'key={`${selectedVersion?.id}-${playbackState.url}`}'));
edit('src/lib/transcriptReport.ts',s=>s.replace('  responseId: string;','  responseId: string;\n  versionId?: string;\n  versionNumber?: number;')
 .replace('TRANSCRIPT_REPORT_VERSION = "1"','TRANSCRIPT_REPORT_VERSION = "2"')
 .replace('a.responseId.localeCompare(b.responseId)', '(a.versionId ?? a.responseId).localeCompare(b.versionId ?? b.responseId)')
 .replace('const recordingUrl = (id: string)', 'const recordingUrl = (id: string, versionId?: string)')
 .replace('url.searchParams.set("response", id);', 'url.searchParams.set("response", id);\n    if (versionId) url.searchParams.set("version", versionId);')
 .replace('Recording identifier: ${recording.responseId}\\nSubmitted', 'Recording identifier: ${recording.versionId ?? recording.responseId}\\nTest response: ${recording.responseId}\\nVersion: ${(recording.versionNumber ?? 1) === 1 ? "Original" : `Revision ${(recording.versionNumber ?? 1) - 1}`}\\nSubmitted')
 .replace('recordingUrl(recording.responseId)', 'recordingUrl(recording.responseId, recording.versionId)'));
edit('src/lib/transcriptReports.ts',s=>s.replace('[row.responseId, row]', '[row.versionId ?? row.responseId, row]')
 .replaceAll('get(recording.responseId)', 'get(recording.versionId ?? recording.responseId)')
 .replaceAll('set(recording.responseId,', 'set(recording.versionId ?? recording.responseId,')
 .replace('[row.responseId, row.revision]', '[row.versionId ?? row.responseId, row.revision]')
 .replace('responseId: string, signal: AbortSignal)', 'responseId: string, signal: AbortSignal, versionId?: string)')
 .replace('{ responseId },', '{ responseId, versionId },'));
edit('src/pages/AnalyticsTranscriptReport.tsx',s=>s.replace('async function retry(responseId: string)', 'async function retry(responseId: string, versionId?: string)')
 .replace('const retry = async (responseId: string)', 'const retry = async (responseId: string, versionId?: string)')
 .replace('setRetrying(responseId)', 'setRetrying(versionId ?? responseId)')
 .replace('retryRecordingTranscript(userId, responseId, controller.signal)', 'retryRecordingTranscript(userId, responseId, controller.signal, versionId)')
 .replace('key={recording.responseId}', 'key={recording.versionId ?? recording.responseId}')
 .replace('retry(recording.responseId)', 'retry(recording.responseId, recording.versionId)')
 .replace('retrying === recording.responseId', 'retrying === (recording.versionId ?? recording.responseId)'));
edit('services/video-processor/src/transcriptQueue.ts',s=>s.replace('  responseId: string;', '  responseId: string;\n  versionId?: string;').replace('        responseId: job.responseId,', '        responseId: job.responseId,\n        ...(job.versionId ? { versionId: job.versionId } : {}),'));
edit('services/video-processor/src/transcriptProcessor.ts',s=>s.replace('  if (typeof job.source.url', '  if (job.versionId !== undefined && !uuid.test(job.versionId)) return null;\n  if (typeof job.source.url')
 .replace('return { responseId: job.responseId,', 'return { ...(job.versionId ? { versionId: job.versionId } : {}), responseId: job.responseId,')
 .replace('    responseId: job.responseId,', '    responseId: job.responseId,\n    ...(job.versionId ? { versionId: job.versionId } : {}),'));
edit('supabase/functions/dispatch-recording-transcripts/index.ts',s=>s.replace('            responseId: job.response_id,', '            responseId: job.response_id,\n            versionId: job.version_id,'));
edit('supabase/functions/retry-recording-transcript/index.ts',s=>s.replace('    const { data, error }', '    if (body.versionId != null && (typeof body.versionId !== "string" || !UUID_PATTERN.test(body.versionId))) throw new TranscriptHttpError("Invalid recording version.");\n    const { data, error }').replace('      p_response_id: body.responseId,', '      p_response_id: body.responseId,\n      p_version_id: body.versionId ?? null,'));
edit('supabase/functions/get-transcript-report/index.ts',s=>s.replace('afterId: last.responseId,', 'afterId: last.versionId ?? last.responseId,'));
