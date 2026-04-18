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
  createGeneratedRecordingFileName,
  createRecordingSessionId,
  downloadRecordingBackup,
  getPreferredMediaRecorderMimeType,
  loadRecordingTestSession,
  RECORDING_ACCEPT_ATTRIBUTE,
  resolveRecordingExperience,
  saveRecordingTestSession,
  type RecordingTestPhase,
  uploadGeneratedRecordingDraft,
  uploadRecordingDraft,
  validateRecordingFile,
} from "../lib/recordings";
import { getActiveQuestionSet } from "../lib/selectors";
import { ProductType, Question, ResponseRecording, TestAnswer } from "../types";

type NativeStopReason = "user-finished" | "share-ended" | "unmounted";

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

function formatElapsedDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function getMediaPermissionMessage(error: unknown) {
  if (!(error instanceof DOMException)) {
    return "The browser could not start screen and voice recording. Try again in desktop Chrome or Edge.";
  }

  if (error.name === "NotAllowedError") {
    return "Allow microphone and screen-sharing access to start the recording.";
  }

  if (error.name === "NotFoundError") {
    return "No microphone or shareable screen source was found for this browser session.";
  }

  if (error.name === "NotReadableError") {
    return "The screen share or microphone is unavailable right now. Close other recording tools and try again.";
  }

  if (error.name === "InvalidStateError") {
    return "Click the start button again from this page to begin recording.";
  }

  return "The browser could not start screen and voice recording. Try again in desktop Chrome or Edge.";
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
          "Use your computer's built-in screen recorder or another desktop recorder, and make sure your microphone is capturing your voice before you start.",
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
  const hasHandledRecordingRecoveryRef = useRef(false);
  const isUnmountingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const nativeStopReasonRef = useRef<NativeStopReason>("user-finished");
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
  const [liveRecordingStartedAt, setLiveRecordingStartedAt] = useState<number | null>(null);
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(0);
  const [nativeRecordingBlob, setNativeRecordingBlob] = useState<Blob | null>(null);
  const [nativeRecordingMimeType, setNativeRecordingMimeType] = useState(
    () => getPreferredMediaRecorderMimeType() || "video/webm",
  );
  const [nativeUploadError, setNativeUploadError] = useState("");
  const [nativeRecoveryUploadEnabled, setNativeRecoveryUploadEnabled] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);

  const selectedLink = useMemo(() => {
    if (!isRecordingTest) {
      return accessLinks[0] ?? null;
    }

    if (!chosenProductType) {
      return null;
    }

    return accessLinks.find((link) => link.productType === chosenProductType) ?? null;
  }, [accessLinks, chosenProductType, isRecordingTest]);

  const selectedProductType = selectedLink?.productType ?? chosenProductType ?? defaultProductType ?? null;
  const recordingExperience = useMemo(
    () => resolveRecordingExperience(selectedProductType),
    [selectedProductType],
  );
  const isNativeDesktopRecording =
    isRecordingTest &&
    selectedProductType === "website" &&
    recordingExperience.mode === "native-desktop";
  const recordingInstructions = getRecordingInstructions(selectedProductType ?? "website");
  const testerInstructions = submission?.instructions.trim()
    ? submission.instructions.trim()
    : "Explore the main flow, note anything confusing, and share specific feedback that would help improve the experience.";
  const hasQuestions = (questionSet?.questions.length ?? 0) > 0;
  const nativeBackupFileName = useMemo(
    () => createGeneratedRecordingFileName(recordingSessionId, nativeRecordingMimeType),
    [nativeRecordingMimeType, recordingSessionId],
  );

  const completion = useMemo(() => {
    if (!questionSet) {
      return { answered: 0, total: 0, canSubmit: false, shortParagraphs: 0 };
    }

    if (questionSet.questions.length === 0) {
      return {
        answered: 0,
        total: 0,
        canSubmit: isRecordingTest,
        shortParagraphs: 0,
      };
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
  }, [answers, isRecordingTest, questionSet]);

  const submitDisabled =
    isSubmitting ||
    !completion.canSubmit ||
    (isRecordingTest && !uploadedRecording);

  const cleanupActiveCaptureStreams = () => {
    const tracks = new Set<MediaStreamTrack>();

    for (const stream of [displayStreamRef.current, microphoneStreamRef.current, combinedStreamRef.current]) {
      stream?.getTracks().forEach((track) => tracks.add(track));
    }

    tracks.forEach((track) => track.stop());
    displayStreamRef.current = null;
    microphoneStreamRef.current = null;
    combinedStreamRef.current = null;
    mediaRecorderRef.current = null;
  };

  const launchSelectedWebsite = (preOpenedWindow?: Window | null) => {
    if (!selectedLink || selectedLink.productType !== "website") {
      return false;
    }

    const openedWindow = preOpenedWindow ?? window.open(selectedLink.normalizedUrl, "_blank", "noopener,noreferrer");

    if (!openedWindow) {
      setPopupBlocked(true);
      return false;
    }

    try {
      openedWindow.opener = null;
    } catch {
      // Some browsers lock down opener assignment.
    }

    try {
      openedWindow.location.href = selectedLink.normalizedUrl;
      setPopupBlocked(false);
      return true;
    } catch {
      setPopupBlocked(true);
      return false;
    }
  };

  const uploadManualRecordingFile = async (file: File, successMessage: string) => {
    if (!currentUser) {
      setMessage("Verify your email before uploading a recording.");
      return false;
    }

    const validation = validateRecordingFile(file);

    if (!validation.ok) {
      setNativeUploadError("");
      setMessage(validation.message);
      return false;
    }

    setIsUploadingRecording(true);
    setNativeUploadError("");
    setMessage("");

    try {
      const nextRecording = await uploadRecordingDraft(
        currentUser.id,
        recordingSessionId,
        file,
        uploadedRecording,
      );
      setUploadedRecording(nextRecording);
      setNativeRecoveryUploadEnabled(false);
      setRecordingPhase("return_and_submit");
      setMessage(successMessage);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The recording could not be uploaded.");
      return false;
    } finally {
      setIsUploadingRecording(false);
    }
  };

  const finalizeNativeRecording = async (blob: Blob, mimeType: string) => {
    const resolvedMimeType = mimeType || getPreferredMediaRecorderMimeType() || "video/webm";
    const generatedFile = new File(
      [blob],
      createGeneratedRecordingFileName(recordingSessionId, resolvedMimeType),
      {
        type: resolvedMimeType,
        lastModified: Date.now(),
      },
    );
    const validation = validateRecordingFile(generatedFile);

    setNativeRecordingBlob(blob);
    setNativeRecordingMimeType(resolvedMimeType);

    if (!validation.ok) {
      setRecordingPhase("return_and_submit");
      setNativeUploadError(validation.message);
      setMessage(validation.message);
      return;
    }

    if (!currentUser) {
      setRecordingPhase("return_and_submit");
      setNativeUploadError("Verify your email before the browser recording can upload.");
      setMessage("Verify your email before the browser recording can upload.");
      return;
    }

    setRecordingPhase("uploading_recording");
    setIsUploadingRecording(true);
    setNativeUploadError("");
    setMessage("");

    try {
      const nextRecording = await uploadGeneratedRecordingDraft(
        currentUser.id,
        recordingSessionId,
        blob,
        resolvedMimeType,
        uploadedRecording,
      );
      setUploadedRecording(nextRecording);
      setNativeRecordingBlob(null);
      setNativeRecoveryUploadEnabled(false);
      setRecordingPhase("return_and_submit");
      setMessage(
        nativeStopReasonRef.current === "share-ended"
          ? "Screen sharing ended, and the recording captured so far has been uploaded."
          : "Recording uploaded. Submit when you're ready.",
      );
    } catch (error) {
      setRecordingPhase("return_and_submit");
      setNativeUploadError(
        error instanceof Error
          ? error.message
          : "The recording could not be uploaded automatically.",
      );
      setMessage("The browser recording is ready. Retry the upload or download a backup copy.");
    } finally {
      setIsUploadingRecording(false);
    }
  };

  const resetNativeDesktopFlow = () => {
    setRecordingPhase("preflight");
    setLiveRecordingStartedAt(null);
    setLiveElapsedSeconds(0);
    setNativeRecordingBlob(null);
    setNativeUploadError("");
    setNativeRecoveryUploadEnabled(false);
    setPopupBlocked(false);
    setMessage("");
  };

  const stopNativeRecording = () => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      setRecordingPhase("return_and_submit");
      setNativeRecoveryUploadEnabled(true);
      setMessage("The browser recording is no longer active. Upload a saved backup if you have one, or start again.");
      return;
    }

    nativeStopReasonRef.current = "user-finished";
    setRecordingPhase("uploading_recording");
    recorder.stop();
  };

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

  useEffect(() => {
    if (!isNativeDesktopRecording || !liveRecordingStartedAt) {
      setLiveElapsedSeconds(0);
      return;
    }

    setLiveElapsedSeconds(Math.max(0, Math.round((Date.now() - liveRecordingStartedAt) / 1000)));
    const intervalId = window.setInterval(() => {
      setLiveElapsedSeconds(Math.max(0, Math.round((Date.now() - liveRecordingStartedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isNativeDesktopRecording, liveRecordingStartedAt]);

  useEffect(() => {
    if (
      !isRecordingTest ||
      !isNativeDesktopRecording ||
      hasHandledRecordingRecoveryRef.current ||
      !initialRecordingSessionRef.current
    ) {
      return;
    }

    const initialPhase = initialRecordingSessionRef.current.phase;

    if (
      (initialPhase === "recording_live" || initialPhase === "uploading_recording") &&
      !initialRecordingSessionRef.current.recording
    ) {
      hasHandledRecordingRecoveryRef.current = true;
      setRecordingPhase("return_and_submit");
      setNativeRecoveryUploadEnabled(true);
      setMessage(
        "Your active browser recording could not reconnect after this page reloaded. Upload a saved backup if you have one, or start a new recording.",
      );
    }
  }, [isNativeDesktopRecording, isRecordingTest]);

  useEffect(() => {
    return () => {
      isUnmountingRef.current = true;
      nativeStopReasonRef.current = "unmounted";

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore teardown races while navigating away.
        }
      }

      cleanupActiveCaptureStreams();
    };
  }, []);

  if (!submission || !questionSet) {
    return (
      <AppShell title="Test session" description="The test you're looking for could not be loaded.">
        <Surface><p>Try returning to the Earn page and choosing another live submission.</p></Surface>
      </AppShell>
    );
  }

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

  const handleManualRecordingStart = () => {
    if (!selectedLink && accessLinks.length > 0) {
      setMessage("Choose the platform you're about to test before continuing.");
      return;
    }

    if (!confirmedRecording) {
      setMessage("Confirm that your screen and voice recording has started before continuing.");
      return;
    }

    setMessage("");
    setRecordingPhase("recording_live");

    if (selectedLink?.productType === "website") {
      window.open(selectedLink.normalizedUrl, "_blank", "noopener,noreferrer");
    }
  };

  const handleNativeRecordingStart = async () => {
    if (!selectedLink || selectedLink.productType !== "website") {
      setMessage("Choose the website you're about to test before continuing.");
      return;
    }

    if (!currentUser) {
      setMessage("Verify your email before starting a recording test.");
      return;
    }

    setPopupBlocked(false);
    setNativeRecoveryUploadEnabled(false);
    setNativeUploadError("");
    setNativeRecordingBlob(null);
    setMessage("");

    const preOpenedWindow = window.open("", "_blank");
    let microphoneStream: MediaStream | null = null;
    let displayStream: MediaStream | null = null;

    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const displayCaptureOptions = {
        audio: false,
        video: true,
        selfBrowserSurface: "exclude",
        preferCurrentTab: false,
        surfaceSwitching: "include",
        monitorTypeSurfaces: "include",
      } as unknown as DisplayMediaStreamOptions;
      displayStream = await navigator.mediaDevices.getDisplayMedia(displayCaptureOptions);
      const combinedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...microphoneStream.getAudioTracks(),
      ]);
      const preferredMimeType = getPreferredMediaRecorderMimeType();
      const recorder = preferredMimeType
        ? new MediaRecorder(combinedStream, { mimeType: preferredMimeType })
        : new MediaRecorder(combinedStream);
      const activeVideoTrack = displayStream.getVideoTracks()[0] ?? null;

      microphoneStreamRef.current = microphoneStream;
      displayStreamRef.current = displayStream;
      combinedStreamRef.current = combinedStream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      nativeStopReasonRef.current = "user-finished";
      setLiveRecordingStartedAt(Date.now());
      setNativeRecordingMimeType(recorder.mimeType || preferredMimeType || "video/webm");

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (isUnmountingRef.current || nativeStopReasonRef.current === "unmounted") {
          recordingChunksRef.current = [];
          setLiveRecordingStartedAt(null);
          cleanupActiveCaptureStreams();
          return;
        }

        const chunkMimeType = recorder.mimeType || preferredMimeType || "video/webm";
        const finalBlob = new Blob(recordingChunksRef.current, { type: chunkMimeType });
        recordingChunksRef.current = [];
        setLiveRecordingStartedAt(null);
        cleanupActiveCaptureStreams();

        if (finalBlob.size === 0) {
          setRecordingPhase("return_and_submit");
          setNativeRecoveryUploadEnabled(true);
          setNativeUploadError("The browser did not capture a recording. Start again or upload a saved backup file.");
          setMessage("The browser did not capture a recording. Start again or upload a saved backup file.");
          return;
        }

        void finalizeNativeRecording(finalBlob, chunkMimeType);
      };

      activeVideoTrack?.addEventListener("ended", () => {
        if (mediaRecorderRef.current?.state === "recording") {
          nativeStopReasonRef.current = "share-ended";
          mediaRecorderRef.current.stop();
        }
      }, { once: true });

      recorder.start(1000);
      setRecordingPhase("recording_live");

      const launched = launchSelectedWebsite(preOpenedWindow);

      if (!launched) {
        setMessage("Recording started. If the website did not open automatically, use the button below to open it in a new tab.");
      }
    } catch (error) {
      preOpenedWindow?.close();
      microphoneStream?.getTracks().forEach((track) => track.stop());
      displayStream?.getTracks().forEach((track) => track.stop());
      cleanupActiveCaptureStreams();
      setLiveRecordingStartedAt(null);
      setRecordingPhase("preflight");
      setMessage(getMediaPermissionMessage(error));
    }
  };

  const handleRecordingUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    await uploadManualRecordingFile(file, "Recording uploaded. Submit when you're ready.");
  };

  const showReturnAndSubmit = !isRecordingTest || recordingPhase === "return_and_submit";
  const progressLabel = hasQuestions
    ? `${completion.answered} / ${completion.total} answered`
    : isRecordingTest
      ? "Recording-only test"
      : "Ready to submit";
  const recordingStatusCopy = uploadedRecording
    ? "Recording uploaded and ready."
    : isNativeDesktopRecording
      ? "Finish the browser recording and let it upload to unlock submit."
      : "Upload the recording to unlock final submit.";
  const shouldShowManualRecoveryUpload =
    isNativeDesktopRecording &&
    nativeRecoveryUploadEnabled &&
    !uploadedRecording &&
    !nativeRecordingBlob;

  return (
    <AppShell eyebrowLabel={null}>
      <div className="test-layout test-layout--single">
        <div className="test-session__header">
          <h1>{`Test ${submission.productName}`}</h1>
          <p>
            {isRecordingTest
              ? isNativeDesktopRecording
                ? "This is a recording test. Desktop Chrome or Edge will open the browser's native share picker, record your screen and voice, and upload the video automatically when you finish."
                : "This is a recording test. Record your screen and voice during the session, then come back here to upload the video and submit your answers."
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
                  <span className="recording-test-callout__eyebrow">Screen + voice recording</span>
                  <strong>
                    {isNativeDesktopRecording
                      ? "This session can use the browser's built-in recorder."
                      : "This session needs a screen and voice recording."}
                  </strong>
                  <p>{recordingExperience.reason}</p>
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

                  {isNativeDesktopRecording ? (
                    <>
                      <div className="recording-guidance">
                        <div className="recording-guidance__intro">
                          <h2>Start with the browser&apos;s native picker</h2>
                          <p>Chrome or Edge will ask for microphone access and then open the built-in share picker.</p>
                        </div>
                        <ol className="recording-guidance__steps">
                          <li>Choose Entire screen or a browser window, not a single tab.</li>
                          <li>Allow microphone access so your voice is captured with the recording.</li>
                          <li>The website opens in a new tab after recording begins, so keep this Test4Test tab open.</li>
                          <li>Return here when you are done testing and click the finish button to upload automatically.</li>
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
                    </>
                  ) : (
                    <>
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
                    </>
                  )}

                  <div className="wizard-actions">
                    <button type="button" className="button button--secondary" onClick={() => navigate("/earn")}>
                      Back to Earn
                    </button>
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => {
                        if (isNativeDesktopRecording) {
                          void handleNativeRecordingStart();
                        } else {
                          handleManualRecordingStart();
                        }
                      }}
                    >
                      {isNativeDesktopRecording ? "Start screen + voice recording" : "I&apos;m recording and ready to test"}
                    </button>
                  </div>
                </div>
              ) : null}

              {recordingPhase === "recording_live" ? (
                <div className="recording-phase-card">
                  <div className="recording-phase-card__copy">
                    <span className="test-session__label">
                      {isNativeDesktopRecording ? "Recording in progress" : "Testing in progress"}
                    </span>
                    <h2>{isNativeDesktopRecording ? "Testing in a new tab" : recordingInstructions.launchTitle}</h2>
                    <p>
                      {isNativeDesktopRecording
                        ? "The browser's recording indicator should stay visible while you test. Keep this tab open and return here when you are ready to finish."
                        : recordingInstructions.launchBody}
                    </p>
                    <p>
                      {isNativeDesktopRecording
                        ? "When you return, click the finish button so Test4Test can stop the recording and upload it automatically."
                        : "Return to this page when you are finished testing so you can stop recording, upload the video, and submit your answers."}
                    </p>
                    {isNativeDesktopRecording ? (
                      <div className="recording-phase-card__timer">
                        <strong>{formatElapsedDuration(liveElapsedSeconds)}</strong>
                        <span>elapsed</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="recording-phase-card__actions inline-actions">
                    {selectedLink ? (
                      <a
                        href={selectedLink.normalizedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="button button--secondary"
                      >
                        {isNativeDesktopRecording ? "Open website again" : recordingInstructions.launchButtonLabel}
                        <ExternalLink size={16} />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => {
                        if (isNativeDesktopRecording) {
                          stopNativeRecording();
                        } else {
                          setRecordingPhase("return_and_submit");
                          setMessage("Stop your recording, upload the video, then finish the questionnaire.");
                        }
                      }}
                    >
                      I&apos;m finished testing
                    </button>
                  </div>
                  {popupBlocked ? (
                    <div className="callout callout--warning">
                      <span>The website did not open automatically. Use the button above to open it in a new tab.</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {recordingPhase === "uploading_recording" ? (
                <div className="recording-upload-card">
                  <div className="recording-upload-card__copy">
                    <span className="test-session__label">Uploading recording</span>
                    <h2>Uploading your browser recording</h2>
                    <p>Stay on this page while Test4Test saves the screen recording automatically.</p>
                  </div>
                  <div className="callout callout--soft">
                    <span className="button__spinner" aria-hidden="true" />
                    <span>Uploading recording...</span>
                  </div>
                </div>
              ) : null}

              {recordingPhase === "return_and_submit" ? (
                <div className="recording-upload-card">
                  <div className="recording-upload-card__copy">
                    <span className="test-session__label">Return and submit</span>
                    <h2>{isNativeDesktopRecording ? "Review the recording and submit" : "Stop your recording and upload the video"}</h2>
                    <p>
                      {isNativeDesktopRecording
                        ? "Once the recording is uploaded, final submit unlocks here. If the automatic upload fails, retry it or download a backup copy."
                        : "Upload the recording from your computer or phone, then complete the questionnaire below. Final submit stays locked until the video upload succeeds."}
                    </p>
                  </div>

                  {!isNativeDesktopRecording ? (
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
                  ) : null}

                  {uploadedRecording ? (
                    <div className="recording-upload-card__meta">
                      <strong>{uploadedRecording.fileName}</strong>
                      <span>{formatRecordingSize(uploadedRecording.fileSizeBytes)}</span>
                      <span>{`Available until ${formatDateTime(uploadedRecording.expiresAt)}`}</span>
                    </div>
                  ) : null}

                  {isNativeDesktopRecording && !uploadedRecording && nativeRecordingBlob ? (
                    <div className="recording-upload-card__actions inline-actions">
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => { void finalizeNativeRecording(nativeRecordingBlob, nativeRecordingMimeType); }}
                        disabled={isUploadingRecording}
                      >
                        Retry upload
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => downloadRecordingBackup(nativeRecordingBlob, nativeBackupFileName)}
                      >
                        Download backup
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={resetNativeDesktopFlow}
                      >
                        Start a new recording
                      </button>
                    </div>
                  ) : null}

                  {shouldShowManualRecoveryUpload ? (
                    <>
                      <label className="field recording-upload-card__field">
                        <span>Upload a saved backup file</span>
                        <input
                          type="file"
                          accept={RECORDING_ACCEPT_ATTRIBUTE}
                          onChange={handleRecordingUpload}
                          disabled={isUploadingRecording}
                        />
                        <small className="helper-text">
                          Use this only if you already saved a local backup recording.
                        </small>
                      </label>
                      <div className="recording-upload-card__actions inline-actions">
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={resetNativeDesktopFlow}
                        >
                          Start a new recording
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {showReturnAndSubmit ? (
            <>
              {hasQuestions ? (
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
              ) : isRecordingTest ? (
                <div className="recording-questionless-note">
                  <strong>No written questionnaire for this test.</strong>
                  <p>Once the recording is ready, you can submit this test from the footer below.</p>
                </div>
              ) : null}

              {message ? (
                <div className={`callout ${nativeUploadError ? "callout--warning" : "callout--soft"}`}>
                  <span>{message}</span>
                </div>
              ) : null}

              <div className="wizard-actions wizard-actions--sticky test-session__footer">
                <div className="test-session__progress">
                  <strong>{progressLabel}</strong>
                  {isRecordingTest ? (
                    <span>{recordingStatusCopy}</span>
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
