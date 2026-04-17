import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Mic,
  Monitor,
  Smartphone,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDateTime, getOrderedAccessLinks, productTypeLabel } from "../lib/format";
import {
  clearRecordingTestSession,
  createRecordingSessionId,
  loadRecordingTestSession,
  RECORDING_ACCEPT_ATTRIBUTE,
  saveRecordingTestSession,
  type RecordingTestPhase,
  uploadRecordingDraft,
  validateRecordingFile,
} from "../lib/recordings";
import { getActiveQuestionSet } from "../lib/selectors";
import { ProductType, Question, ResponseRecording, TestAnswer } from "../types";

function buildAnswer(question: Question, value: string): TestAnswer {
  return question.type === "multiple"
    ? {
        questionId: question.id,
        questionTitle: question.title,
        type: question.type,
        selectedOption: value,
      }
    : {
        questionId: question.id,
        questionTitle: question.title,
        type: question.type,
        textAnswer: value,
      };
}

function formatRecordingSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

function getRecordingInstructions(productType: ProductType) {
  switch (productType) {
    case "ios":
      return {
        title: "iPhone / iPad recording",
        intro:
          "Download the app before testing, turn on Screen Recording in Control Center if needed, and make sure your microphone is enabled.",
        steps: [
          "Install or update the app from the link below before you start recording.",
          "Start iOS Screen Recording, then long-press the control to turn the microphone on.",
          "Narrate what you expect, what feels smooth, and where you get stuck.",
          "Return to this tab after testing so you can stop recording, upload the video, and submit your answers.",
        ],
        launchTitle: "Open the iOS app when you are ready",
        launchBody:
          "Use the App Store or TestFlight link, complete the test inside the app, then return here to upload your recording and submit feedback.",
        launchButtonLabel: "Open iOS app link",
      };
    case "android":
      return {
        title: "Android recording",
        intro:
          "Download the Android app before testing and use your phone's built-in screen recorder with microphone audio turned on.",
        steps: [
          "Install or update the app from Google Play before you begin the session.",
          "Start your Android screen recorder and confirm microphone capture is enabled.",
          "Think out loud while moving through the task so the app owner can understand your decisions.",
          "Return to this page after testing to stop recording, upload the file, and submit your answers.",
        ],
        launchTitle: "Open the Android app when you are ready",
        launchBody:
          "Tap the app link below, complete the session in the Android app, then come back here to upload your recording and finish the questionnaire.",
        launchButtonLabel: "Open Android app link",
      };
    default:
      return {
        title: "Desktop / web recording",
        intro:
          "Use your computer's built-in screen recorder or browser-friendly recorder, and make sure your microphone is capturing your voice before you start.",
        steps: [
          "Close extra tabs and confirm you have enough disk space before you begin.",
          "Start recording your full screen or browser window with microphone audio enabled.",
          "Describe what you expect to happen, what surprises you, and why you click each next step.",
          "The site will open in a new tab. When you're done testing, return here to stop recording, upload the video, and submit your answers.",
        ],
        launchTitle: "The website opens in a new tab",
        launchBody:
          "Keep this Test4Test tab open. Test in the new tab, then come back here when you are finished so you can upload the recording and submit your answers.",
        launchButtonLabel: "Open website again",
      };
  }
}

function PlatformIcon({ productType }: { productType: ProductType }) {
  if (productType === "website") {
    return <Monitor size={18} aria-hidden="true" />;
  }

  return <Smartphone size={18} aria-hidden="true" />;
}

const thinkAloudTips = [
  "Say what you expect to happen before you tap or click.",
  "Call out anything confusing, slow, reassuring, or unexpectedly helpful.",
  "If you hesitate, explain what information you were looking for.",
  "Share what you would try next if you were using this for real.",
];

export function TestSessionPage() {
  const { submissionId = "" } = useParams();
  const navigate = useNavigate();
  const { state, currentUser, completeTest } = useAppState();
  const initialRecordingSessionRef = useRef(loadRecordingTestSession(submissionId));
  const submission = state.submissions.find((item) => item.id === submissionId);
  const questionSet = submission ? getActiveQuestionSet(state, submission.id) : null;
  const accessLinks = useMemo(
    () => (submission ? getOrderedAccessLinks(submission.accessLinks, submission.productTypes) : []),
    [submission],
  );
  const isRecordingTest = submission?.requiresRecording === true;
  const defaultProductType = accessLinks.length === 1 ? accessLinks[0].productType : null;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingRecording, setIsUploadingRecording] = useState(false);
  const [recordingPhase, setRecordingPhase] = useState<RecordingTestPhase>(
    initialRecordingSessionRef.current?.phase ?? "preflight",
  );
  const [chosenProductType, setChosenProductType] = useState<ProductType | null>(
    initialRecordingSessionRef.current?.chosenProductType ?? defaultProductType,
  );
  const [confirmedRecording, setConfirmedRecording] = useState(
    initialRecordingSessionRef.current?.confirmedRecording ?? false,
  );
  const [uploadedRecording, setUploadedRecording] = useState<ResponseRecording | null>(
    initialRecordingSessionRef.current?.recording ?? null,
  );
  const [recordingSessionId] = useState(
    () => initialRecordingSessionRef.current?.sessionId ?? createRecordingSessionId(),
  );
  const [startedAt] = useState(() => Date.now());

  const selectedLink = useMemo(() => {
    if (!isRecordingTest) {
      return accessLinks[0] ?? null;
    }

    if (!chosenProductType) {
      return null;
    }

    return accessLinks.find((link) => link.productType === chosenProductType) ?? null;
  }, [accessLinks, chosenProductType, isRecordingTest]);

  const recordingInstructions = getRecordingInstructions(selectedLink?.productType ?? chosenProductType ?? "website");
  const testerInstructions = submission?.instructions.trim()
    ? submission.instructions.trim()
    : "Explore the main flow, note anything confusing, and share specific feedback that would help improve the experience.";

  const completion = useMemo(() => {
    if (!questionSet) {
      return { answered: 0, total: 0, canSubmit: false, shortParagraphs: 0 };
    }

    const answered = questionSet.questions.filter((question) => {
      const value = answers[question.id]?.trim();
      return Boolean(value);
    }).length;
    const shortParagraphs = questionSet.questions.filter(
      (question) =>
        question.type === "paragraph" && (answers[question.id]?.trim().length ?? 0) < 40,
    ).length;

    return {
      answered,
      total: questionSet.questions.length,
      canSubmit: answered === questionSet.questions.length && shortParagraphs === 0,
      shortParagraphs,
    };
  }, [answers, questionSet]);

  useEffect(() => {
    if (!isRecordingTest) {
      clearRecordingTestSession(submissionId);
      return;
    }

    const validChosenProductType = chosenProductType
      ? accessLinks.some((link) => link.productType === chosenProductType)
        ? chosenProductType
        : null
      : null;

    saveRecordingTestSession({
      submissionId,
      sessionId: recordingSessionId,
      phase: recordingPhase,
      chosenProductType: validChosenProductType,
      confirmedRecording,
      recording: uploadedRecording,
    });
  }, [
    accessLinks,
    chosenProductType,
    confirmedRecording,
    isRecordingTest,
    recordingPhase,
    recordingSessionId,
    submissionId,
    uploadedRecording,
  ]);

  useEffect(() => {
    if (!isRecordingTest) {
      return;
    }

    if (accessLinks.length === 1 && !chosenProductType) {
      setChosenProductType(accessLinks[0].productType);
      return;
    }

    if (
      chosenProductType &&
      !accessLinks.some((link) => link.productType === chosenProductType)
    ) {
      setChosenProductType(accessLinks.length === 1 ? accessLinks[0].productType : null);
    }
  }, [accessLinks, chosenProductType, isRecordingTest]);

  if (!submission || !questionSet) {
    return (
      <AppShell title="Test session" description="The test you're looking for could not be loaded.">
        <Surface><p>Try returning to the Earn page and choosing another live submission.</p></Surface>
      </AppShell>
    );
  }

  const submitDisabled =
    !completion.canSubmit ||
    isSubmitting ||
    (isRecordingTest && !uploadedRecording);

  const submit = async () => {
    if (isRecordingTest && !uploadedRecording) {
      setMessage("Upload your screen recording before submitting this test.");
      return;
    }

    const payload = questionSet.questions.map((question) =>
      buildAnswer(question, answers[question.id]?.trim() ?? ""),
    );

    setIsSubmitting(true);
    setMessage("");

    try {
      const result = await completeTest(
        submission.id,
        payload,
        Math.round((Date.now() - startedAt) / 1000),
        uploadedRecording,
      );
      setMessage(result.message);
      if (result.ok) {
        if (isRecordingTest) {
          clearRecordingTestSession(submission.id);
        }
        navigate(`/test/${submission.id}/success`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordingStart = () => {
    if (!selectedLink && accessLinks.length > 0) {
      setMessage("Choose the platform you're about to test before continuing.");
      return;
    }

    if (!confirmedRecording) {
      setMessage("Confirm that your screen and voice recording has started before continuing.");
      return;
    }

    setMessage("");
    setRecordingPhase("launched");

    if (selectedLink?.productType === "website") {
      window.open(selectedLink.normalizedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleRecordingUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!currentUser) {
      setMessage("Verify your email before uploading a recording.");
      return;
    }

    const validation = validateRecordingFile(file);

    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    setIsUploadingRecording(true);
    setMessage("");

    try {
      const nextRecording = await uploadRecordingDraft(
        currentUser.id,
        recordingSessionId,
        file,
        uploadedRecording,
      );
      setUploadedRecording(nextRecording);
      setMessage("Recording uploaded. Finish the questionnaire and submit when you're ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The recording could not be uploaded.");
    } finally {
      setIsUploadingRecording(false);
    }
  };

  const showReturnAndSubmit = !isRecordingTest || recordingPhase === "return_and_submit";

  return (
    <AppShell eyebrowLabel={null}>
      <div className="test-layout test-layout--single">
        <div className="test-session__header">
          <h1>{`Test ${submission.productName}`}</h1>
          <p>
            {isRecordingTest
              ? "This is a recording test. Record your screen and voice during the session, then come back here to upload the video and submit your answers."
              : "Open the app in a new tab, keep this questionnaire here, and leave thoughtful answers that are actually useful to the person who submitted it."}
          </p>
        </div>

        <Surface className="test-questions test-questions--full">
          <div className="test-session__intro-card">
            <div className="test-session__resource">
              <span className="test-session__label">{accessLinks.length > 1 ? "App links" : "App link"}</span>
              {accessLinks.length > 0 ? (
                <div className="test-session__link-list">
                  {accessLinks.map((link) => (
                    <a
                      key={link.productType}
                      href={link.normalizedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="test-session__link"
                    >
                      <span className="test-session__link-label">{link.label}</span>
                      <span>{link.displayUrl}</span>
                      <ExternalLink size={15} />
                    </a>
                  ))}
                </div>
              ) : (
                <p>No public app links were provided for this test.</p>
              )}
            </div>
            <div className="test-session__resource">
              <span className="test-session__label">Tester instructions</span>
              <p>{testerInstructions}</p>
            </div>
          </div>

          {isRecordingTest ? (
            <>
              <div className="callout callout--soft recording-test-callout">
                <div className="recording-test-callout__copy">
                  <span className="recording-test-callout__eyebrow">Recording required</span>
                  <strong>This session needs a screen and voice recording.</strong>
                  <p>
                    Make sure you have enough storage space before you begin. Test4Test keeps uploaded recordings for 7 days, then deletes them automatically.
                  </p>
                </div>
                <Mic size={20} aria-hidden="true" />
              </div>

              {recordingPhase === "preflight" ? (
                <div className="recording-phase-stack">
                  {accessLinks.length > 1 ? (
                    <div className="recording-platform-picker">
                      <span className="test-session__label">Choose the platform you will test</span>
                      <div className="choice-grid choice-grid--compact">
                        {accessLinks.map((link) => {
                          const isActive = chosenProductType === link.productType;

                          return (
                            <button
                              key={link.productType}
                              type="button"
                              className={`choice-card choice-card--multi${isActive ? " choice-card--active" : ""}`}
                              onClick={() => setChosenProductType(link.productType)}
                              aria-pressed={isActive}
                            >
                              <span className={`choice-card__check${isActive ? " choice-card__check--active" : ""}`} aria-hidden="true">
                                {isActive ? <CheckCircle2 size={16} /> : <PlatformIcon productType={link.productType} />}
                              </span>
                              <span className="choice-card__content">
                                <strong>{productTypeLabel(link.productType)}</strong>
                                <small>{link.displayUrl}</small>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="recording-guidance">
                    <div className="recording-guidance__intro">
                      <h2>{recordingInstructions.title}</h2>
                      <p>{recordingInstructions.intro}</p>
                    </div>
                    <ol className="recording-guidance__steps">
                      {recordingInstructions.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>

                  <div className="recording-guidance">
                    <div className="recording-guidance__intro">
                      <h2>Think out loud while you test</h2>
                      <p>The goal is not polished narration. Small reactions and in-the-moment confusion are the most useful parts.</p>
                    </div>
                    <ul className="recording-tips">
                      {thinkAloudTips.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </div>

                  <label className="checkbox-row recording-attestation">
                    <input
                      type="checkbox"
                      checked={confirmedRecording}
                      onChange={(event) => setConfirmedRecording(event.target.checked)}
                    />
                    <span>I have started a screen recording with microphone audio for this session.</span>
                  </label>

                  <div className="wizard-actions">
                    <button type="button" className="button button--secondary" onClick={() => navigate("/earn")}>
                      Back to Earn
                    </button>
                    <button type="button" className="button button--primary" onClick={handleRecordingStart}>
                      I&apos;m recording and ready to test
                    </button>
                  </div>
                </div>
              ) : null}

              {recordingPhase === "launched" ? (
                <div className="recording-phase-card">
                  <div className="recording-phase-card__copy">
                    <span className="test-session__label">Testing in progress</span>
                    <h2>{recordingInstructions.launchTitle}</h2>
                    <p>{recordingInstructions.launchBody}</p>
                    <p>Return to this page when you are finished testing so you can stop recording, upload the video, and submit your answers.</p>
                  </div>
                  <div className="recording-phase-card__actions inline-actions">
                    {selectedLink ? (
                      <a
                        href={selectedLink.normalizedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="button button--secondary"
                      >
                        {recordingInstructions.launchButtonLabel}
                        <ExternalLink size={16} />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => {
                        setRecordingPhase("return_and_submit");
                        setMessage("Stop your recording, upload the video, then finish the questionnaire.");
                      }}
                    >
                      I&apos;m finished testing
                    </button>
                  </div>
                </div>
              ) : null}

              {recordingPhase === "return_and_submit" ? (
                <div className="recording-upload-card">
                  <div className="recording-upload-card__copy">
                    <span className="test-session__label">Return and submit</span>
                    <h2>Stop your recording and upload the video</h2>
                    <p>
                      Upload the recording from your computer or phone, then complete the questionnaire below. Final submit stays locked until the video upload succeeds.
                    </p>
                  </div>
                  <label className="field recording-upload-card__field">
                    <span>Screen recording upload</span>
                    <input
                      type="file"
                      accept={RECORDING_ACCEPT_ATTRIBUTE}
                      onChange={handleRecordingUpload}
                      disabled={isUploadingRecording}
                    />
                    <small className="helper-text">
                      Accepted: MP4, MOV, or WEBM up to 500 MB.
                    </small>
                  </label>
                  {uploadedRecording ? (
                    <div className="recording-upload-card__meta">
                      <strong>{uploadedRecording.fileName}</strong>
                      <span>{formatRecordingSize(uploadedRecording.fileSizeBytes)}</span>
                      <span>{`Available until ${formatDateTime(uploadedRecording.expiresAt)}`}</span>
                    </div>
                  ) : null}
                  {isUploadingRecording ? (
                    <div className="callout callout--soft">
                      <span className="button__spinner" aria-hidden="true" />
                      <span>Uploading recording...</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {showReturnAndSubmit ? (
            <>
              <div className="question-list test-session__questions">
                {questionSet.questions.map((question) => (
                  <article key={question.id} className="question-card question-card--spacious">
                    <div className="test-session__question-body">
                      <h3>{question.sortOrder}. {question.title}</h3>
                      {question.type === "multiple" ? (
                        <div className="radio-list">
                          {(question.options ?? []).map((option) => (
                            <label key={option} className={`radio-card${answers[question.id] === option ? " radio-card--active" : ""}`}>
                              <input
                                className="radio-card__control"
                                type="radio"
                                name={question.id}
                                checked={answers[question.id] === option}
                                onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                              />
                              <span>{option}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <label className="field">
                          <textarea
                            rows={5}
                            value={answers[question.id] ?? ""}
                            onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                            placeholder="Add a thoughtful answer with enough detail to be genuinely useful."
                          />
                          <small className={`helper-text ${(answers[question.id]?.trim().length ?? 0) >= 40 ? "helper-text--success" : ""}`}>
                            {answers[question.id]?.trim().length ?? 0} / 40 recommended minimum characters
                          </small>
                        </label>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {message ? <div className="callout callout--soft">{message}</div> : null}

              <div className="wizard-actions wizard-actions--sticky test-session__footer">
                <div className="test-session__progress">
                  <strong>{completion.answered} / {completion.total} answered</strong>
                  {isRecordingTest ? (
                    <span>{uploadedRecording ? "Recording uploaded and ready." : "Upload the recording to unlock final submit."}</span>
                  ) : null}
                </div>
                <div className="inline-actions">
                  <button type="button" className="button button--secondary" onClick={() => navigate("/earn")}>
                    Back to Earn
                  </button>
                  <button type="button" className="button button--primary" onClick={() => void submit()} disabled={submitDisabled}>
                    Submit test
                  </button>
                </div>
              </div>
            </>
          ) : message ? (
            <div className="callout callout--warning">{message}</div>
          ) : null}
        </Surface>
      </div>
    </AppShell>
  );
}
