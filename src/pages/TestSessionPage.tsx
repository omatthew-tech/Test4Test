import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Mic,
  Monitor,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { formatDateTime, getOrderedAccessLinks, productTypeLabel } from "../lib/format";
import {
  clearRecordingTestSession,
  createGeneratedRecordingFileName,
  createRecordingSessionId,
  deleteRecordingDraft,
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

interface MicrophoneOption {
  deviceId: string;
  label: string;
}

interface PermissionsPolicyDocument extends Document {
  permissionsPolicy?: {
    allowsFeature?: (feature: string) => boolean;
  };
  featurePolicy?: {
    allowsFeature?: (feature: string) => boolean;
  };
}

interface DocumentPictureInPictureController {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window?: Window | null;
}

interface WindowWithDocumentPictureInPicture extends Window {
  documentPictureInPicture?: DocumentPictureInPictureController;
}

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

function getMicrophonePermissionMessage(error: unknown) {
  const policyDocument = document as PermissionsPolicyDocument;
  const microphoneBlockedByPolicy =
    policyDocument.permissionsPolicy?.allowsFeature?.("microphone") === false ||
    policyDocument.featurePolicy?.allowsFeature?.("microphone") === false;

  if (microphoneBlockedByPolicy) {
    return "Microphone access is blocked by this site's browser permissions policy. Refresh after the latest deploy and try again.";
  }

  if (!(error instanceof DOMException)) {
    return "Allow microphone access so you can choose a microphone before starting the test.";
  }

  if (error.name === "NotAllowedError") {
    return "Allow microphone access so you can choose a microphone before starting the test.";
  }

  if (error.name === "NotFoundError") {
    return "No microphone was found for this browser session.";
  }

  if (error.name === "NotReadableError") {
    return "The selected microphone is unavailable right now. Close other apps using it and try again.";
  }

  return "Allow microphone access so you can choose a microphone before starting the test.";
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
  const microphoneAudioContextRef = useRef<AudioContext | null>(null);
  const microphoneMeterFrameRef = useRef<number | null>(null);
  const microphoneAnalyserRef = useRef<AnalyserNode | null>(null);
  const microphoneLevelDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const recordingPipWindowRef = useRef<Window | null>(null);
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
  const [isDeletingRecording, setIsDeletingRecording] = useState(false);
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
  const [screenShareStatus, setScreenShareStatus] = useState<"idle" | "requesting" | "active" | "error" | "ended">("idle");
  const [nativeCaptureConfirmed, setNativeCaptureConfirmed] = useState(false);
  const [availableMicrophones, setAvailableMicrophones] = useState<MicrophoneOption[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [microphoneStatus, setMicrophoneStatus] = useState<"idle" | "requesting" | "ready" | "error">("idle");
  const [microphoneError, setMicrophoneError] = useState("");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);

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
  const microphoneBarHeights = useMemo(() => {
    const baseHeights = [10, 14, 18, 14, 10];

    if (microphoneStatus !== "ready") {
      return baseHeights;
    }

    const weightedLevel = Math.max(0, Math.min(1, microphoneLevel));
    const weights = [0.6, 0.82, 1, 0.82, 0.6];

    return baseHeights.map((baseHeight, index) =>
      Math.max(6, Math.round(baseHeight * (0.45 + weightedLevel * 1.9 * weights[index]))),
    );
  }, [microphoneLevel, microphoneStatus]);

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
    isDeletingRecording ||
    !completion.canSubmit ||
    (isRecordingTest && !uploadedRecording);

  const stopMicrophoneMeter = () => {
    if (microphoneMeterFrameRef.current !== null) {
      window.cancelAnimationFrame(microphoneMeterFrameRef.current);
      microphoneMeterFrameRef.current = null;
    }

    microphoneAnalyserRef.current = null;
    microphoneLevelDataRef.current = null;

    if (microphoneAudioContextRef.current) {
      void microphoneAudioContextRef.current.close().catch(() => undefined);
      microphoneAudioContextRef.current = null;
    }
  };

  const startMicrophoneMeter = (stream: MediaStream) => {
    stopMicrophoneMeter();

    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
      setMicrophoneLevel(0);
      return;
    }

    const audioContext = new window.AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    microphoneAudioContextRef.current = audioContext;
    microphoneAnalyserRef.current = analyser;
    microphoneLevelDataRef.current = data;

    const updateMeter = () => {
      const nextAnalyser = microphoneAnalyserRef.current;
      const nextData = microphoneLevelDataRef.current;

      if (!nextAnalyser || !nextData) {
        return;
      }

      nextAnalyser.getByteTimeDomainData(nextData);

      let sumSquares = 0;

      for (let index = 0; index < nextData.length; index += 1) {
        const normalizedSample = (nextData[index] - 128) / 128;
        sumSquares += normalizedSample * normalizedSample;
      }

      const rms = Math.sqrt(sumSquares / nextData.length);
      const nextLevel = Math.min(1, rms * 8);
      setMicrophoneLevel((currentLevel) => currentLevel * 0.65 + nextLevel * 0.35);
      microphoneMeterFrameRef.current = window.requestAnimationFrame(updateMeter);
    };

    microphoneMeterFrameRef.current = window.requestAnimationFrame(updateMeter);
  };

  const stopMicrophonePreviewStream = () => {
    stopMicrophoneMeter();
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = null;
    setMicrophoneLevel(0);
  };

  const stopDisplayPreviewStream = () => {
    displayStreamRef.current?.getVideoTracks().forEach((track) => {
      track.onended = null;
    });
    displayStreamRef.current?.getTracks().forEach((track) => track.stop());
    displayStreamRef.current = null;
  };

  const closeRecordingPipWindow = () => {
    const pipWindow = recordingPipWindowRef.current;
    recordingPipWindowRef.current = null;

    if (!pipWindow || pipWindow.closed) {
      return;
    }

    try {
      pipWindow.close();
    } catch {
      // The browser owns PiP window lifecycle; closing can fail during teardown.
    }
  };

  const focusTestSessionWindow = () => {
    try {
      window.focus();
    } catch {
      // Browser focus behavior is best-effort, especially across tabs.
    }
  };

  const renderRecordingPipWindow = () => {
    const pipWindow = recordingPipWindowRef.current;

    if (!pipWindow || pipWindow.closed) {
      recordingPipWindowRef.current = null;
      return;
    }

    const { document: pipDocument } = pipWindow;
    pipDocument.title = "Recording live";

    if (!pipDocument.getElementById("recording-pip-styles")) {
      const style = pipDocument.createElement("style");
      style.id = "recording-pip-styles";
      style.textContent = `
        :root {
          color-scheme: light;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          width: 100%;
          min-height: 100%;
          margin: 0;
          overflow: hidden;
          background: #fffaf5;
          color: #201813;
        }

        body {
          padding: 14px;
        }

        .recording-pip {
          display: flex;
          min-height: calc(100vh - 28px);
          flex-direction: column;
          justify-content: space-between;
          gap: 14px;
          padding: 16px;
          border: 1px solid rgba(245, 142, 86, 0.28);
          border-radius: 22px;
          background:
            radial-gradient(circle at top right, rgba(245, 142, 86, 0.18), transparent 34%),
            #fffdfb;
          box-shadow: 0 18px 34px rgba(33, 24, 17, 0.16);
        }

        .recording-pip__top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .recording-pip__badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .recording-pip__dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: #f06a3f;
          box-shadow: 0 0 0 7px rgba(240, 106, 63, 0.15);
        }

        .recording-pip__timer {
          color: #8a5c3f;
          font-variant-numeric: tabular-nums;
          font-weight: 800;
        }

        .recording-pip__text {
          margin: 0;
          color: #65584f;
          font-size: 0.9rem;
          line-height: 1.45;
        }

        .recording-pip__status {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .recording-pip__pill {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 11px;
          border-radius: 999px;
          background: rgba(235, 238, 242, 0.95);
          color: #6f7782;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .recording-pip__pill--ok {
          background: rgba(255, 241, 230, 0.95);
          color: #8a5c3f;
        }

        .recording-pip__button {
          width: 100%;
          min-height: 42px;
          border: 0;
          border-radius: 999px;
          background: #f58e56;
          color: #201813;
          cursor: pointer;
          font: inherit;
          font-weight: 800;
          box-shadow: 0 10px 24px rgba(245, 142, 86, 0.28);
        }

        .recording-pip__button:hover {
          background: #f67e42;
        }
      `;
      pipDocument.head.append(style);
    }

    let root = pipDocument.getElementById("recording-pip-root");

    if (!root) {
      root = pipDocument.createElement("div");
      root.id = "recording-pip-root";
      pipDocument.body.replaceChildren(root);
    }

    root.innerHTML = `
      <section class="recording-pip" aria-label="Test4Test recording control">
        <div class="recording-pip__top">
          <div class="recording-pip__badge">
            <span class="recording-pip__dot" aria-hidden="true"></span>
            <span>Recording live</span>
          </div>
          <strong class="recording-pip__timer">${formatElapsedDuration(liveElapsedSeconds)}</strong>
        </div>
        <p class="recording-pip__text">You can move this window while you test. Click finish when you are done.</p>
        <div class="recording-pip__status">
          <span class="recording-pip__pill${microphoneStatus === "ready" ? " recording-pip__pill--ok" : ""}">
            Mic ${microphoneStatus === "ready" ? "connected" : "not ready"}
          </span>
          <span class="recording-pip__pill${screenShareStatus === "active" ? " recording-pip__pill--ok" : ""}">
            Screen ${screenShareStatus === "active" ? "sharing" : "not shared"}
          </span>
        </div>
        <button id="recording-pip-finish" class="recording-pip__button" type="button">Finish recording</button>
      </section>
    `;

    pipDocument
      .getElementById("recording-pip-finish")
      ?.addEventListener("click", () => stopNativeRecording({ focusTestPage: true }), { once: true });
  };

  const openRecordingPipWindow = async () => {
    const documentPictureInPicture = (window as WindowWithDocumentPictureInPicture).documentPictureInPicture;

    if (typeof documentPictureInPicture?.requestWindow !== "function") {
      return false;
    }

    const existingWindow = recordingPipWindowRef.current;

    if (existingWindow && !existingWindow.closed) {
      renderRecordingPipWindow();
      return true;
    }

    try {
      const pipWindow = await documentPictureInPicture.requestWindow({
        width: 300,
        height: 224,
      });
      recordingPipWindowRef.current = pipWindow;
      pipWindow.addEventListener("pagehide", () => {
        if (recordingPipWindowRef.current === pipWindow) {
          recordingPipWindowRef.current = null;
        }
      });
      renderRecordingPipWindow();
      return true;
    } catch {
      return false;
    }
  };

  const cleanupActiveCaptureStreams = () => {
    stopMicrophoneMeter();
    const tracks = new Set<MediaStreamTrack>();

    displayStreamRef.current?.getVideoTracks().forEach((track) => {
      track.onended = null;
    });

    for (const stream of [displayStreamRef.current, microphoneStreamRef.current, combinedStreamRef.current]) {
      stream?.getTracks().forEach((track) => tracks.add(track));
    }

    tracks.forEach((track) => track.stop());
    displayStreamRef.current = null;
    microphoneStreamRef.current = null;
    combinedStreamRef.current = null;
    mediaRecorderRef.current = null;
  };

  const prepareMicrophonePreview = async (deviceId?: string) => {
    if (!isNativeDesktopRecording) {
      return false;
    }

    setMicrophoneStatus("requesting");
    setMicrophoneError("");
    setMessage("");

    if (mediaRecorderRef.current?.state !== "recording") {
      stopMicrophonePreviewStream();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        deviceId
          ? {
              audio: {
                deviceId: { exact: deviceId },
              },
            }
          : {
              audio: true,
            },
      );
      const devices = await navigator.mediaDevices.enumerateDevices();
      const microphoneDevices = devices
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));
      const activeTrackDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId ?? "";
      const nextSelectedMicrophoneId =
        deviceId && microphoneDevices.some((device) => device.deviceId === deviceId)
          ? deviceId
          : activeTrackDeviceId && microphoneDevices.some((device) => device.deviceId === activeTrackDeviceId)
            ? activeTrackDeviceId
            : microphoneDevices[0]?.deviceId ?? "";

      microphoneStreamRef.current = stream;
      setAvailableMicrophones(microphoneDevices);
      setSelectedMicrophoneId(nextSelectedMicrophoneId);
      setMicrophoneStatus("ready");
      setMicrophoneError("");
      startMicrophoneMeter(stream);
      return true;
    } catch (error) {
      stopMicrophonePreviewStream();
      setMicrophoneStatus("error");
      setMicrophoneError(getMicrophonePermissionMessage(error));
      setMessage(getMicrophonePermissionMessage(error));
      return false;
    }
  };

  const prepareScreenSharePreview = async () => {
    if (!isNativeDesktopRecording) {
      return false;
    }

    if (!selectedLink || selectedLink.productType !== "website") {
      setMessage("Choose the website you're about to test before enabling screen sharing.");
      return false;
    }

    if (microphoneStatus !== "ready" || !microphoneStreamRef.current) {
      setMessage("Enable your microphone before you share your screen.");
      return false;
    }

    setScreenShareStatus("requesting");
    setNativeCaptureConfirmed(false);
    setPopupBlocked(false);
    setMessage("");

    stopDisplayPreviewStream();

    try {
      const displayCaptureOptions = {
        audio: false,
        video: {
          displaySurface: "monitor",
        },
        selfBrowserSurface: "exclude",
        preferCurrentTab: false,
        surfaceSwitching: "include",
        monitorTypeSurfaces: "include",
      } as unknown as DisplayMediaStreamOptions;
      const displayStream = await navigator.mediaDevices.getDisplayMedia(displayCaptureOptions);
      const activeVideoTrack = displayStream.getVideoTracks()[0] ?? null;

      if (!activeVideoTrack) {
        displayStream.getTracks().forEach((track) => track.stop());
        setScreenShareStatus("error");
        setMessage("The browser did not return a shareable screen. Try again.");
        return false;
      }

      activeVideoTrack.onended = () => {
        if (mediaRecorderRef.current?.state === "recording") {
          nativeStopReasonRef.current = "share-ended";
          setScreenShareStatus("ended");
          setNativeCaptureConfirmed(false);
          closeRecordingPipWindow();
          mediaRecorderRef.current.stop();
          return;
        }

        if (displayStreamRef.current === displayStream) {
          displayStreamRef.current = null;
        }

        setScreenShareStatus("ended");
        setNativeCaptureConfirmed(false);
        setMessage("Screen sharing stopped. Enable it again before you start the test.");
      };

      displayStreamRef.current = displayStream;
      setScreenShareStatus("active");
      setMessage("Screen sharing is ready. Click Start test when you're ready to begin recording.");
      return true;
    } catch (error) {
      setScreenShareStatus("error");
      setNativeCaptureConfirmed(false);
      setMessage(getMediaPermissionMessage(error));
      return false;
    }
  };

  const focusOpenedWebsiteWindow = (openedWindow: Window | null) => {
    if (!openedWindow || openedWindow.closed) {
      return;
    }

    try {
      openedWindow.focus();
    } catch {
      // Browser focus behavior is intentionally user-agent controlled.
    }
  };

  const launchSelectedWebsite = () => {
    if (!selectedLink || selectedLink.productType !== "website") {
      return { launched: false, openedWindow: null };
    }

    const openedWindow = window.open(selectedLink.normalizedUrl, "_blank");

    if (!openedWindow) {
      setPopupBlocked(true);
      return { launched: false, openedWindow: null };
    }

    focusOpenedWebsiteWindow(openedWindow);

    try {
      openedWindow.opener = null;
    } catch {
      // Some browsers lock down opener assignment.
    }

    try {
      window.setTimeout(() => {
        focusOpenedWebsiteWindow(openedWindow);
      }, 0);
      setPopupBlocked(false);
      return { launched: true, openedWindow };
    } catch {
      setPopupBlocked(true);
      return { launched: false, openedWindow: null };
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
      setScreenShareStatus("ended");
      setNativeCaptureConfirmed(false);
      setMessage(
        nativeStopReasonRef.current === "share-ended"
          ? "Screen sharing ended, and the recording captured so far has been uploaded."
          : "Recording uploaded. Submit when you're ready.",
      );
    } catch (error) {
      setRecordingPhase("return_and_submit");
      setScreenShareStatus("ended");
      setNativeCaptureConfirmed(false);
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
    cleanupActiveCaptureStreams();
    setRecordingPhase("preflight");
    setLiveRecordingStartedAt(null);
    setLiveElapsedSeconds(0);
    setNativeRecordingBlob(null);
    setNativeUploadError("");
    setNativeRecoveryUploadEnabled(false);
    setPopupBlocked(false);
    setScreenShareStatus("idle");
    setNativeCaptureConfirmed(false);
    setAvailableMicrophones([]);
    setSelectedMicrophoneId("");
    setMicrophoneStatus("idle");
    setMicrophoneError("");
    setMessage("");
  };

  const stopNativeRecording = (options?: { focusTestPage?: boolean }) => {
    if (options?.focusTestPage) {
      focusTestSessionWindow();
      window.setTimeout(focusTestSessionWindow, 100);
      window.setTimeout(focusTestSessionWindow, 350);
    }

    const recorder = mediaRecorderRef.current;
    closeRecordingPipWindow();

    if (!recorder || recorder.state === "inactive") {
      setRecordingPhase("return_and_submit");
      setNativeRecoveryUploadEnabled(true);
      setScreenShareStatus("ended");
      setNativeCaptureConfirmed(false);
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
    if (isNativeDesktopRecording) {
      return;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      return;
    }

    stopDisplayPreviewStream();
    stopMicrophonePreviewStream();
    setAvailableMicrophones([]);
    setSelectedMicrophoneId("");
    setMicrophoneStatus("idle");
    setMicrophoneError("");
    setScreenShareStatus("idle");
  }, [isNativeDesktopRecording]);

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
    if (!isNativeDesktopRecording || recordingPhase !== "recording_live") {
      closeRecordingPipWindow();
      return;
    }

    renderRecordingPipWindow();
  }, [
    isNativeDesktopRecording,
    liveElapsedSeconds,
    microphoneStatus,
    nativeCaptureConfirmed,
    recordingPhase,
    screenShareStatus,
  ]);

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
      setRecordingPhase("preflight");
      setNativeRecoveryUploadEnabled(false);
      setScreenShareStatus("idle");
      setNativeCaptureConfirmed(false);
      setNativeRecordingBlob(null);
      stopDisplayPreviewStream();
      setMessage(
        "The previous browser recording was interrupted when this page reloaded. Enable screen sharing again, then start a new test recording.",
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

      closeRecordingPipWindow();
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
      launchSelectedWebsite();
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

    if (microphoneStatus !== "ready" || !microphoneStreamRef.current) {
      setMessage("Enable your microphone before starting the test.");
      return;
    }

    if (screenShareStatus !== "active" || !displayStreamRef.current) {
      setMessage("Enable screen sharing before starting the test.");
      return;
    }

    setPopupBlocked(false);
    setNativeRecoveryUploadEnabled(false);
    setNativeUploadError("");
    setNativeRecordingBlob(null);
    setNativeCaptureConfirmed(false);
    setMessage("");

    try {
      const displayStream = displayStreamRef.current;
      const previewMicrophoneStream = microphoneStreamRef.current;
      const activeVideoTrack = displayStream.getVideoTracks()[0] ?? null;

      if (!activeVideoTrack || activeVideoTrack.readyState !== "live") {
        setScreenShareStatus("ended");
        setMessage("Screen sharing is no longer active. Enable it again before starting the test.");
        return;
      }

      stopMicrophoneMeter();
      const combinedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...previewMicrophoneStream.getAudioTracks(),
      ]);
      const preferredMimeType = getPreferredMediaRecorderMimeType();
      const recorder = preferredMimeType
        ? new MediaRecorder(combinedStream, { mimeType: preferredMimeType })
        : new MediaRecorder(combinedStream);

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
          setScreenShareStatus("ended");
          setNativeCaptureConfirmed(false);
          setNativeUploadError("The browser did not capture a recording. Start again or upload a saved backup file.");
          setMessage("The browser did not capture a recording. Start again or upload a saved backup file.");
          return;
        }

        void finalizeNativeRecording(finalBlob, chunkMimeType);
      };

      activeVideoTrack.onended = () => {
        if (mediaRecorderRef.current?.state === "recording") {
          nativeStopReasonRef.current = "share-ended";
          setScreenShareStatus("ended");
          setNativeCaptureConfirmed(false);
          closeRecordingPipWindow();
          mediaRecorderRef.current.stop();
          return;
        }

        if (displayStreamRef.current === displayStream) {
          displayStreamRef.current = null;
        }

        setScreenShareStatus("ended");
        setNativeCaptureConfirmed(false);
      };

      recorder.start(1000);
      setRecordingPhase("recording_live");
      setScreenShareStatus("active");
      setNativeCaptureConfirmed(true);

      const pipWindowPromise = openRecordingPipWindow();
      const { launched, openedWindow } = launchSelectedWebsite();

      if (launched) {
        window.setTimeout(() => focusOpenedWebsiteWindow(openedWindow), 150);
        window.setTimeout(() => focusOpenedWebsiteWindow(openedWindow), 500);
      }

      if (!launched) {
        setMessage("Recording live. Your microphone is connected and screen sharing is active. If the website did not open automatically, use the button below to open it in a new tab.");
      } else {
        setMessage("Recording live. Your microphone is connected and screen sharing is active.");
      }

      void pipWindowPromise.then((opened) => {
        if (launched) {
          window.setTimeout(() => focusOpenedWebsiteWindow(openedWindow), 0);
          window.setTimeout(() => focusOpenedWebsiteWindow(openedWindow), 300);
        }

        if (!opened) {
          setMessage(
            "Recording live. Keep this Test4Test tab open to finish recording, or return here and click Show floating recorder.",
          );
        }
      });
    } catch (error) {
      if (mediaRecorderRef.current?.state !== "recording") {
        const previewStream = microphoneStreamRef.current;

        if (previewStream) {
          startMicrophoneMeter(previewStream);
          setMicrophoneStatus("ready");
        } else {
          setMicrophoneStatus("idle");
        }
      }

      setScreenShareStatus(displayStreamRef.current ? "active" : "error");
      setNativeCaptureConfirmed(false);
      combinedStreamRef.current = null;
      mediaRecorderRef.current = null;
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

  const handleDeleteUploadedRecording = async () => {
    if (!uploadedRecording) {
      return;
    }

    if (!currentUser) {
      setMessage("Verify your email before deleting a recording.");
      return;
    }

    setIsDeletingRecording(true);
    setNativeUploadError("");
    setMessage("");

    try {
      await deleteRecordingDraft(uploadedRecording);
      cleanupActiveCaptureStreams();
      setUploadedRecording(null);
      setNativeRecordingBlob(null);
      setNativeUploadError("");
      setNativeRecoveryUploadEnabled(false);
      setConfirmedRecording(false);
      setRecordingPhase("preflight");
      setLiveRecordingStartedAt(null);
      setLiveElapsedSeconds(0);
      setPopupBlocked(false);
      setScreenShareStatus("idle");
      setNativeCaptureConfirmed(false);
      setAvailableMicrophones([]);
      setSelectedMicrophoneId("");
      setMicrophoneStatus("idle");
      setMicrophoneError("");
      setMessage("Recording deleted. Start a new recording when you're ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The recording could not be deleted.");
    } finally {
      setIsDeletingRecording(false);
    }
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
              {!isNativeDesktopRecording ? (
                <div className="callout callout--soft recording-test-callout">
                  <div className="recording-test-callout__copy">
                    <span className="recording-test-callout__eyebrow">Screen + voice recording</span>
                    <strong>This session needs a screen and voice recording.</strong>
                    <p>{recordingExperience.reason}</p>
                  </div>
                  <Mic size={20} aria-hidden="true" />
                </div>
              ) : null}

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
                    <div className="recording-quickstart">
                      <div className="recording-quickstart__step">
                        <span className="recording-quickstart__number">1.</span>
                        <div className="recording-quickstart__content">
                          <div className="recording-quickstart__copy">
                            <strong>Enable microphone access</strong>
                            <div className="recording-microphone-setup">
                              {availableMicrophones.length > 0 ? (
                                <label className="recording-microphone-select">
                                  <span>Select microphone</span>
                                  <select
                                    value={selectedMicrophoneId}
                                    onChange={(event) => {
                                      const nextMicrophoneId = event.target.value;
                                      setSelectedMicrophoneId(nextMicrophoneId);
                                      void prepareMicrophonePreview(nextMicrophoneId);
                                    }}
                                    disabled={microphoneStatus === "requesting"}
                                  >
                                    {availableMicrophones.map((microphone) => (
                                      <option key={microphone.deviceId} value={microphone.deviceId}>
                                        {microphone.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                              <div className="recording-microphone-actions">
                                <button
                                  type="button"
                                  className="button button--secondary button--small"
                                  onClick={() => { void prepareMicrophonePreview(selectedMicrophoneId || undefined); }}
                                  disabled={microphoneStatus === "requesting"}
                                >
                                  {microphoneStatus === "ready"
                                    ? "Change microphone"
                                    : microphoneStatus === "requesting"
                                      ? "Checking microphone..."
                                      : "Enable microphone"}
                                </button>
                                {microphoneError ? (
                                  <small className="helper-text helper-text--warning">{microphoneError}</small>
                                ) : microphoneStatus === "ready" ? (
                                  <small className="helper-text helper-text--success">Microphone ready and responding to your voice</small>
                                ) : (
                                  <small className="helper-text">Choose the microphone you want to use for this test.</small>
                                )}
                              </div>
                            </div>
                          </div>
                          <div
                            className={`recording-mic-indicator${microphoneStatus === "ready" ? " recording-mic-indicator--active" : " recording-mic-indicator--inactive"}`}
                            role="img"
                            aria-label={
                              microphoneStatus === "ready"
                                ? "Voice activity level for the selected microphone"
                                : "Microphone activity is inactive until microphone access is enabled"
                            }
                          >
                            {microphoneBarHeights.map((height, index) => (
                              <span key={`mic-bar-${index}`} style={{ height: `${height}px` }} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="recording-quickstart__step">
                        <span className="recording-quickstart__number">2.</span>
                        <div className="recording-quickstart__content">
                          <div className="recording-quickstart__copy">
                            <strong>Enable screen sharing</strong>
                            <div className="recording-microphone-actions">
                              <button
                                type="button"
                                className="button button--secondary button--small"
                                onClick={() => { void prepareScreenSharePreview(); }}
                                disabled={microphoneStatus !== "ready" || screenShareStatus === "requesting"}
                              >
                                {screenShareStatus === "active"
                                  ? "Share screen again"
                                  : screenShareStatus === "requesting"
                                    ? "Waiting for screen share..."
                                    : "Enable screen sharing"}
                              </button>
                            </div>
                            <small className={`helper-text ${screenShareStatus === "active" ? "helper-text--success" : screenShareStatus === "error" ? "helper-text--warning" : ""}`}>
                              {screenShareStatus === "active"
                                ? "Screen sharing is active. Keep this tab open, then click Start test."
                                : screenShareStatus === "requesting"
                                  ? "Chrome or Edge is asking what you want to share."
                                  : screenShareStatus === "error"
                                    ? "Screen sharing did not start. Try again."
                                    : screenShareStatus === "ended"
                                      ? "Screen sharing stopped. Enable it again before starting."
                                      : "Choose Entire screen or Window so the new test tab is included."}
                            </small>
                          </div>
                        </div>
                      </div>
                      <div className="recording-quickstart__step">
                        <span className="recording-quickstart__number">3.</span>
                        <div className="recording-quickstart__content">
                          <div className="recording-quickstart__copy">
                            <strong>Start test</strong>
                            <small className="helper-text">When your microphone and screen are ready, Start test opens the website in a new tab and begins recording right away.</small>
                          </div>
                        </div>
                      </div>
                      <div className={`recording-status-summary${nativeCaptureConfirmed ? " recording-status-summary--live" : ""}`}>
                        <strong>{nativeCaptureConfirmed ? "Recording confirmed" : "Ready to start"}</strong>
                        <span>
                          {nativeCaptureConfirmed
                            ? "We can confirm screen sharing is active and your selected microphone is connected."
                            : screenShareStatus === "active"
                              ? "Screen sharing is ready. Click Start test to open the website and begin recording."
                              : "Enable your microphone, then share your screen before you start the test."}
                        </span>
                      </div>
                    </div>
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
                      disabled={isNativeDesktopRecording && (microphoneStatus !== "ready" || screenShareStatus !== "active")}
                    >
                      {isNativeDesktopRecording ? "Start test" : "I&apos;m recording and ready to test"}
                    </button>
                  </div>
                </div>
              ) : null}

              {recordingPhase === "recording_live" ? (
                <div className="recording-phase-card">
                  <div className="recording-phase-card__copy">
                    <span className="test-session__label">{isNativeDesktopRecording ? "Recording live" : "Testing in progress"}</span>
                    <h2>{isNativeDesktopRecording ? "Your test is recording" : recordingInstructions.launchTitle}</h2>
                    <p>
                      {isNativeDesktopRecording
                        ? nativeCaptureConfirmed
                          ? "We confirmed that screen sharing is active and your selected microphone is connected. Test in the other tab, then use the floating recorder to finish."
                          : "Test in the other tab, then come back here when you are ready to finish."
                        : recordingInstructions.launchBody}
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
                    {isNativeDesktopRecording ? (
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => {
                          void openRecordingPipWindow().then((opened) => {
                            if (!opened) {
                              setMessage("Your browser did not allow the movable recording control. Keep this Test4Test tab open to finish recording.");
                            }
                          });
                        }}
                      >
                        Show floating recorder
                      </button>
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
                      <div className="recording-upload-card__meta-copy">
                        <strong>{uploadedRecording.fileName}</strong>
                        <span>{formatRecordingSize(uploadedRecording.fileSizeBytes)}</span>
                        <span>{`Available until ${formatDateTime(uploadedRecording.expiresAt)}`}</span>
                      </div>
                      <button
                        type="button"
                        className="button button--danger button--small"
                        onClick={() => { void handleDeleteUploadedRecording(); }}
                        disabled={isDeletingRecording || isUploadingRecording || isSubmitting}
                      >
                        {isDeletingRecording ? (
                          <span className="button__spinner" aria-hidden="true" />
                        ) : (
                          <Trash2 size={15} aria-hidden="true" />
                        )}
                        {isDeletingRecording ? "Deleting..." : "Delete and re-record"}
                      </button>
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
