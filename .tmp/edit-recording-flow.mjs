import fs from 'node:fs';
const edit = (p, fn) => fs.writeFileSync(p, fn(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n')));
const cut = (s,a,b) => { const i=s.indexOf(a), j=s.indexOf(b,i); if(i<0||j<0)throw new Error(a); return s.slice(0,i)+s.slice(j); };
edit('src/pages/TestSessionPage.tsx', s => {
 s=s.replace('  type ChangeEvent,','  type ChangeEvent,\n  type ReactNode,');
 s=cut(s,'import {\n  clearLocalTestResponseDraft,','import { reportTest');
 s=s.replace('ProductType, Question, ResponseRecording, TestAnswer, TestReportReason','ProductType, ResponseRecording, TestReportReason');
 s=cut(s,'type DraftSaveStatus =','type DesignSystemRecordingUploadControl');
 s=cut(s,'function buildAnswer(','function formatElapsedDuration(');
 s=s.replace('export function TestSessionPage() {', `export interface RecordingRevision {
  responseId: string;
  submissionId: string;
  expectedVersionNumber: number;
}

export function TestSessionPage({ revision, revisionActions }: { revision?: RecordingRevision; revisionActions?: ReactNode } = {}) {`);
 s=s.replace('const { submissionId: testRef = "" } = useParams();','const { submissionId: routeTestRef = "" } = useParams();\n  const testRef = revision?.submissionId ?? routeTestRef;\n  const sessionKey = revision ? `revision:${revision.responseId}:${revision.expectedVersionNumber}` : testRef;');
 s=s.replace('    completeTest,','    completeTest,\n    reviseTestResponse,');
 s=s.replace('loadRecordingTestSession(testRef)', 'loadRecordingTestSession(sessionKey)');
 s=cut(s,'  const draftSaveTimerRef =','  const questionSet =');
 s=s.replace('const isRecordingTest = submission?.requiresRecording === true;', 'const isRecordingTest = true;');
 s=s.replace('() => Array.from(new Set([resolvedSubmissionId, testRef].filter(Boolean))),\n    [resolvedSubmissionId, testRef],','() => revision ? [sessionKey] : Array.from(new Set([resolvedSubmissionId, testRef].filter(Boolean))),\n    [resolvedSubmissionId, testRef, revision, sessionKey],');
 s=s.replace('  const [answers, setAnswers] = useState<Record<string, string>>({});\n','');
 s=s.replace('const [startedAt, setStartedAt]', 'const [startedAt]');
 s=s.replace('  const [loadedDraftKey, setLoadedDraftKey] = useState("");\n','').replace('  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>("idle");\n','');
 s=cut(s,'  const hasQuestions =','  const nativeBackupFileName =');
 s=cut(s,'  const completion = useMemo','  const submitDisabled =');
 s=s.replace('    !completion.canSubmit ||\n','    isUploadingRecording ||\n');
 s=s.replace('const submitLabel = isSubmitting ? "Submitting..." : "Submit test";', 'const submitLabel = isSubmitting ? "Submitting..." : revision ? "Submit revised recording" : "Submit test";');
 s=cut(s,'  const buildDraftInput =','  const handleBackToEarn =');
 s=s.replace('    void persistDraftNow();\n    navigate("/earn");','    navigate(revision ? "/submissions" : "/earn");');
 s=s.replace('  const navigateAfterSuccessfulSubmit = (creditAwarded: boolean) => {','  const navigateAfterSuccessfulSubmit = (creditAwarded: boolean) => {\n    if (revision) {\n      returnToTestSessionWindow();\n      closeRecordingPipWindow();\n      navigate("/submissions", { replace: true });\n      return;\n    }');
 s=cut(s,'  useEffect(() => {\n    if (!draftIdentity','  useEffect(() => {\n    if (!isRecordingTest)');
 s=cut(s,'    const payload = questionSet.questions.map','    setIsSubmitting(true);');
 s=s.replace('const result = await completeTest(\n        submission.id,\n        payload,', 'const result = revision && uploadedRecording\n        ? await reviseTestResponse(revision.responseId, uploadedRecording, Math.round((Date.now() - startedAt) / 1000), revision.expectedVersionNumber)\n        : await completeTest(\n        submission.id,\n        [],');
 s=s.replace('        if (currentUser) {\n          await clearTestResponseDraft(currentUser.id, submission.id);\n        }\n','');
 s=s.replace('navigateAfterSuccessfulSubmit(result.creditAwarded);','navigateAfterSuccessfulSubmit("creditAwarded" in result && result.creditAwarded === true);');
 s=cut(s,'  const progressLabel =','  const manualRecordingDevice =');
 s=s.replace('const testSessionTitle = isSharedPublicVisit', 'const testSessionTitle = revision ? `Revise feedback for ${submission.productName}` : isSharedPublicVisit');
 s=s.replace('            {testSessionHeaderCopy ? <p>{testSessionHeaderCopy}</p> : null}', '            {testSessionHeaderCopy ? <p>{testSessionHeaderCopy}</p> : null}\n            {revision ? <p>Record new feedback. Your previous recordings remain in the history.</p> : null}\n            {revisionActions}');
 s=cut(s,'              {hasQuestions ? (','              {message ? (');
 const start=s.indexOf('                {isRecordingTest && !hasQuestions ? (');
 const end=s.indexOf('                  <Button\n                    type="button"\n                    loading={isSubmitting}',start);
 if(start<0||end<0)throw new Error('footer');
 s=s.slice(0,start)+`                {shouldShowBackToTests ? (
                  <Button type="button" variant="secondary" onClick={handleBackToEarn}>{backToTestsLabel}</Button>
                ) : null}
                <div className="inline-actions">
`+s.slice(end);
 s=s.replace('                    Submit test\n', '                    {revision ? "Submit revised recording" : "Submit test"}\n');
 s=s.replaceAll('submit your answers','submit your recording').replaceAll('finish the questionnaire','submit your recording')
  .replaceAll('then complete the questionnaire below','then submit it below').replace('Open the app, answer the questions, and your feedback', 'Open the app, record your feedback, and it');
 return s;
});
edit('src/pages/SharePage.tsx',s=> {
 s=s.replace('  Radio,\n','').replace('getActiveQuestionSet, ', '');
 s=s.replace('  const questionSet = liveSubmission ? getActiveQuestionSet(state, liveSubmission.id) : null;\n','');
 s=cut(s,'  const previewQuestions =','  const testerInstructionSteps =');
 s=cut(s,'                {previewQuestions.length > 0 ? (','              </Surface>');
 s=s.replace('{liveSubmission.requiresRecording ? (','{(').replace('                ) : null}\n\n              </Surface>', '                )}\n\n              </Surface>');
 return s;
});
edit('src/components/EditSubmissionModal.tsx',s=>s.replace('requiresRecording: submission.requiresRecording','requiresRecording: true'));
edit('src/context/AppStateContext.tsx',s=>s.replace('    answers: TestAnswer[],\n    durationSeconds: number,\n  ) => Promise<{ ok: boolean; message: string }>', '    recording: ResponseRecording,\n    durationSeconds: number,\n    expectedVersionNumber: number,\n  ) => Promise<{ ok: boolean; message: string }>')
 .replace('async reviseTestResponse(responseId, answers, durationSeconds)', 'async reviseTestResponse(responseId, recording, durationSeconds, expectedVersionNumber)')
 .replace('supabase.rpc("revise_test_response", {\n          p_response_id: responseId,\n          p_answers: answers,\n          p_duration_seconds: durationSeconds,', 'supabase.rpc("revise_test_recording", {\n          p_response_id: responseId,\n          p_recording_bucket: recording.bucket,\n          p_recording_path: recording.path,\n          p_duration_seconds: durationSeconds,\n          p_expected_version_number: expectedVersionNumber,')
 .replaceAll('requires_recording: draft.requiresRecording','requires_recording: true'));
