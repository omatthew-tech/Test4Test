import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flag,
  Mic,
  Trash2,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Dialog,
  Link,
  Radio,
  RecordingStatus,
  Select,
  Stack,
  Stepper,
  Surface,
  Textarea,
  TextField,
  tokens,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import { consumeEarnPlacementSnapshot } from "../lib/earnPlacementCelebration";
import { getOrderedAccessLinks, type AccessLinkItem } from "../lib/format";
import {
  buildRecordingDraftPath,
  clearRecordingTestSession,
  createGeneratedRecordingFileName,
  createRecordingSessionId,
  deleteRecordingDraft,
  downloadRecordingBackup,
  getPreferredMediaRecorderMimeType,
  loadRecordingTestSession,
  normalizeRecordingMimeType,
  RECORDING_ACCEPT_ATTRIBUTE,
  resolveRecordingExperience,
  saveRecordingTestSession,
  type MobileOperatingSystem,
  type RecordingExperience,
  type RecordingTestPhase,
  type RecordingUploadProgress,
  uploadGeneratedRecordingDraft,
  uploadRecordingDraft,
  validateRecordingFile,
} from "../lib/recordings";
import styles from "./TestSessionPage.module.css";
import { getActiveQuestionSet, getActiveSubmissionVersion } from "../lib/selectors";
import { trackEventOncePerSession } from "../lib/analytics";
import { getPublicTesterKey } from "../lib/publicTesterKey";
import {
  clearLocalTestResponseDraft,
  clearTestResponseDraft,
  loadTestResponseDraft,
  saveLocalTestResponseDraft,
  saveTestResponseDraft,
} from "../lib/testResponseDrafts";
import { reportTest } from "../lib/testReports";
import { ProductType, Question, ResponseRecording, TestAnswer, TestReportReason } from "../types";

type NativeStopReason = "user-finished" | "share-ended" | "unmounted";
type DraftSaveStatus =
  "idle" | "loading" | "restored" | "restored_local" | "saving" | "saved" | "saved_local";

const reportReasons: Array<{ value: TestReportReason; label: string }> = [
  { value: "app_unavailable", label: "App unavailable" },
  { value: "requires_payment", label: "Requires payment" },
  { value: "suspicious_malware", label: "Looks suspicious/malware" },
  { value: "other", label: "Other" },
];

const REPORT_MESSAGE_LIMIT = 1000;

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

function pruneAnswerValues(answers: Record<string, string>, questions: Question[]) {
  return Object.fromEntries(
    questions
      .map((question) => [question.id, answers[question.id]] as const)
      .filter(
        (entry): entry is readonly [string, string] =>
          typeof entry[1] === "string" && entry[1].length > 0,
      ),
  );
}

function hasSavedAnswerValues(answerValues: Record<string, string>) {
  return Object.values(answerValues).some((value) => value.trim().length > 0);
}

function parseDraftStartedAt(startedAt: string) {
  const timestamp = Date.parse(startedAt);

  return Number.isNaN(timestamp) ? Date.now() : timestamp;
}

function getDraftStatusCopy(status: DraftSaveStatus) {
  if (status === "loading") {
    return "Checking for saved answers...";
  }

  if (status === "restored") {
    return "Saved answers restored.";
  }

  if (status === "restored_local") {
    return "Saved answers restored from this device.";
  }

  if (status === "saving") {
    return "Saving answers...";
  }

  if (status === "saved") {
    return "Answers saved.";
  }

  if (status === "saved_local") {
    return "Answers saved on this device.";
  }

  return "";
}

function formatElapsedDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatUploadBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${bytes} B`;
}

function formatUploadProgress(progress: RecordingUploadProgress | null) {
  if (!progress) {
    return "Preparing upload...";
  }

  return `${Math.round(progress.percentage)}% (${formatUploadBytes(progress.bytesUploaded)} of ${formatUploadBytes(progress.bytesTotal)})`;
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
        title: "Screen recording",
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

type ManualRecordingDevice = "ios" | "android" | "mobile" | "desktop";

function getAutoDetectedProductType(
  accessLinks: AccessLinkItem[],
  recordingExperience: Pick<RecordingExperience, "isMobile" | "mobileOs">,
) {
  if (accessLinks.length === 0) {
    return null;
  }

  const hasProductType = (productType: ProductType) =>
    accessLinks.some((link) => link.productType === productType);

  if (!recordingExperience.isMobile && hasProductType("website")) {
    return "website";
  }

  if (recordingExperience.mobileOs === "ios" && hasProductType("ios")) {
    return "ios";
  }

  if (recordingExperience.mobileOs === "android" && hasProductType("android")) {
    return "android";
  }

  if (recordingExperience.isMobile && hasProductType("website")) {
    return "website";
  }

  return accessLinks[0].productType;
}

function getManualRecordingDevice(
  productType: ProductType | null,
  mobileOs: MobileOperatingSystem,
  isMobile: boolean,
): ManualRecordingDevice {
  if (mobileOs === "ios" || mobileOs === "android") {
    return mobileOs;
  }

  if (productType === "ios" || productType === "android") {
    return productType;
  }

  return isMobile ? "mobile" : "desktop";
}

function getManualRecordingTitle(device: ManualRecordingDevice, fallbackTitle: string) {
  if (device === "ios") {
    return "iOS recording";
  }

  if (device === "android") {
    return "Android recording";
  }

  if (device === "mobile") {
    return "Mobile recording";
  }

  return fallbackTitle;
}

function ScreenRecordingMenuIllustration({
  device,
}: {
  device: Exclude<ManualRecordingDevice, "mobile" | "desktop">;
}) {
  const isIOS = device === "ios";
  const label = isIOS
    ? "iOS Control Center screen recording button"
    : "Android quick settings screen recording button";

  return (
    <figure
      className={`screen-recording-illustration screen-recording-illustration--${device}`}
      aria-label={label}
    >
      <svg viewBox="0 0 360 260" role="img" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`screen-recording-panel-${device}`} x1="0" x2="1" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor={
                isIOS
                  ? tokens["primitive.color.neutral.800"].value
                  : tokens["primitive.color.neutral.25"].value
              }
            />
            <stop
              offset="100%"
              stopColor={
                isIOS
                  ? tokens["primitive.color.neutral.950"].value
                  : tokens["primitive.color.neutral.100"].value
              }
            />
          </linearGradient>
          <filter
            id={`screen-recording-shadow-${device}`}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feDropShadow
              dx="0"
              dy="12"
              stdDeviation="10"
              floodColor={tokens["primitive.color.neutral.950"].value}
              floodOpacity="0.18"
            />
          </filter>
        </defs>
        <rect
          className="screen-recording-illustration__phone"
          x="30"
          y="14"
          width="300"
          height="226"
          rx="34"
        />
        <rect
          className="screen-recording-illustration__panel"
          x="44"
          y="28"
          width="272"
          height="198"
          rx="26"
          fill={`url(#screen-recording-panel-${device})`}
          filter={`url(#screen-recording-shadow-${device})`}
        />
        {isIOS ? (
          <>
            <rect
              className="screen-recording-illustration__ios-tile"
              x="62"
              y="48"
              width="108"
              height="108"
              rx="28"
            />
            <circle
              className="screen-recording-illustration__ios-toggle screen-recording-illustration__ios-toggle--active"
              cx="92"
              cy="78"
              r="17"
            />
            <circle className="screen-recording-illustration__ios-toggle" cx="140" cy="78" r="17" />
            <circle className="screen-recording-illustration__ios-toggle" cx="92" cy="126" r="17" />
            <circle
              className="screen-recording-illustration__ios-toggle"
              cx="140"
              cy="126"
              r="17"
            />
            <path
              className="screen-recording-illustration__wifi"
              d="M130 74 Q140 66 150 74 M134 80 Q140 75 146 80"
            />
            <rect
              className="screen-recording-illustration__ios-tile"
              x="188"
              y="48"
              width="106"
              height="50"
              rx="20"
            />
            <rect
              className="screen-recording-illustration__ios-slider"
              x="188"
              y="114"
              width="46"
              height="92"
              rx="23"
            />
            <rect
              className="screen-recording-illustration__ios-slider-fill"
              x="188"
              y="154"
              width="46"
              height="52"
              rx="23"
            />
            <rect
              className="screen-recording-illustration__ios-slider"
              x="248"
              y="114"
              width="46"
              height="92"
              rx="23"
            />
            <rect
              className="screen-recording-illustration__ios-slider-fill"
              x="248"
              y="136"
              width="46"
              height="70"
              rx="23"
            />
            <circle
              className="screen-recording-illustration__record-target"
              cx="92"
              cy="190"
              r="26"
            />
            <circle
              className="screen-recording-illustration__record-ring"
              cx="92"
              cy="190"
              r="13"
            />
            <circle className="screen-recording-illustration__record-dot" cx="92" cy="190" r="6" />
            <rect
              className="screen-recording-illustration__small-tile"
              x="124"
              y="164"
              width="46"
              height="52"
              rx="16"
            />
            <path
              className="screen-recording-illustration__arrow"
              d="M250 226 C206 210 164 196 121 191"
            />
            <path
              className="screen-recording-illustration__arrow-head"
              d="M137 176 L119 191 L137 208"
            />
          </>
        ) : (
          <>
            <text className="screen-recording-illustration__android-time" x="66" y="62">
              10:56
            </text>
            <rect
              className="screen-recording-illustration__android-brightness"
              x="64"
              y="82"
              width="232"
              height="20"
              rx="10"
            />
            <rect
              className="screen-recording-illustration__android-brightness-fill"
              x="64"
              y="82"
              width="146"
              height="20"
              rx="10"
            />
            <rect
              className="screen-recording-illustration__android-tile"
              x="64"
              y="118"
              width="104"
              height="44"
              rx="22"
            />
            <rect
              className="screen-recording-illustration__android-tile"
              x="190"
              y="118"
              width="104"
              height="44"
              rx="22"
            />
            <rect
              className="screen-recording-illustration__android-tile"
              x="64"
              y="176"
              width="104"
              height="44"
              rx="22"
            />
            <rect
              className="screen-recording-illustration__android-tile screen-recording-illustration__android-tile--active"
              x="190"
              y="176"
              width="104"
              height="44"
              rx="22"
            />
            <circle
              className="screen-recording-illustration__record-dot"
              cx="216"
              cy="198"
              r="10"
            />
            <text className="screen-recording-illustration__android-label" x="236" y="203">
              Record
            </text>
            <path
              className="screen-recording-illustration__arrow"
              d="M92 236 C128 217 158 205 204 199"
            />
            <path
              className="screen-recording-illustration__arrow-head"
              d="M184 187 L207 198 L188 216"
            />
          </>
        )}
      </svg>
    </figure>
  );
}

export function TestSessionPage() {
  const { submissionId: testRef = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    state,
    currentUser,
    completeTest,
    startGooglePlayClosedTestParticipation,
    recordGooglePlayClosedTestCheckIn,
  } = useAppState();
  const isPublicTester = !currentUser;
  const submissionById = state.submissions.find((item) => item.id === testRef) ?? null;
  const submissionBySlug =
    state.submissions.find((item) => item.publicShareSlug === testRef) ?? null;
  const submission = submissionById ?? submissionBySlug;
  const resolvedSubmissionId = submission?.id ?? testRef;
  const isSlugSharedVisit = Boolean(submissionBySlug && !submissionById);
  const isSharedPublicVisit =
    isPublicTester && (isSlugSharedVisit || searchParams.get("shared") === "1");
  const recordingUploadPublicTesterKey = useMemo(
    () => (isSharedPublicVisit ? getPublicTesterKey() : ""),
    [isSharedPublicVisit],
  );
  const recordingUploadIdentity = currentUser?.id ?? recordingUploadPublicTesterKey;
  const recordingUploadIdentityOptions = recordingUploadPublicTesterKey
    ? { publicTesterKey: recordingUploadPublicTesterKey }
    : {};
  const sharedCustomMessage =
    submission?.publicShareMessage?.trim() || searchParams.get("message")?.trim() || "";
  const initialRecordingSessionRef = useRef(loadRecordingTestSession(testRef));
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
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftSaveSequenceRef = useRef(0);
  const draftServerUnavailableRef = useRef(false);
  const draftEditedKeyRef = useRef("");
  const questionSet = submission ? getActiveQuestionSet(state, submission.id) : null;
  const activeSubmissionVersion = submission
    ? getActiveSubmissionVersion(state, submission.id)
    : null;
  const accessLinks = useMemo(
    () =>
      submission ? getOrderedAccessLinks(submission.accessLinks, submission.productTypes) : [],
    [submission],
  );
  const isRecordingTest = submission?.requiresRecording === true;
  const recordingSessionStorageIds = useMemo(
    () => Array.from(new Set([resolvedSubmissionId, testRef].filter(Boolean))),
    [resolvedSubmissionId, testRef],
  );
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
  const [manualRecordingGuideStep, setManualRecordingGuideStep] = useState(
    initialRecordingSessionRef.current?.confirmedRecording ? 2 : 0,
  );
  const [isRecoveryUploadOpen, setIsRecoveryUploadOpen] = useState(false);
  const [uploadedRecording, setUploadedRecording] = useState<ResponseRecording | null>(
    initialRecordingSessionRef.current?.recording ?? null,
  );
  const [recordingSessionId] = useState(
    () => initialRecordingSessionRef.current?.sessionId ?? createRecordingSessionId(),
  );
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [loadedDraftKey, setLoadedDraftKey] = useState("");
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>("idle");
  const [liveRecordingStartedAt, setLiveRecordingStartedAt] = useState<number | null>(null);
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(0);
  const [nativeRecordingBlob, setNativeRecordingBlob] = useState<Blob | null>(null);
  const [nativeRecordingMimeType, setNativeRecordingMimeType] = useState(
    () => getPreferredMediaRecorderMimeType() || "video/webm",
  );
  const [recordingUploadProgress, setRecordingUploadProgress] =
    useState<RecordingUploadProgress | null>(null);
  const [pendingRecordingUploadPath, setPendingRecordingUploadPath] = useState("");
  const [nativeUploadError, setNativeUploadError] = useState("");
  const [nativeRecoveryUploadEnabled, setNativeRecoveryUploadEnabled] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [screenShareStatus, setScreenShareStatus] = useState<
    "idle" | "requesting" | "active" | "error" | "ended"
  >("idle");
  const [nativeCaptureConfirmed, setNativeCaptureConfirmed] = useState(false);
  const [availableMicrophones, setAvailableMicrophones] = useState<MicrophoneOption[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [microphoneStatus, setMicrophoneStatus] = useState<
    "idle" | "requesting" | "ready" | "error"
  >("idle");
  const [microphoneError, setMicrophoneError] = useState("");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [recordingPipDeleteConfirm, setRecordingPipDeleteConfirm] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState<TestReportReason>("app_unavailable");
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [hasSubmittedReport, setHasSubmittedReport] = useState(false);
  const [closedTestAction, setClosedTestAction] = useState<"joining" | "checking-in" | null>(null);
  const [closedTestNotice, setClosedTestNotice] = useState("");
  const deviceRecordingExperience = useMemo(() => resolveRecordingExperience(null), []);
  const autoDetectedProductType = useMemo(
    () => getAutoDetectedProductType(accessLinks, deviceRecordingExperience),
    [accessLinks, deviceRecordingExperience],
  );
  const effectiveProductType = isRecordingTest
    ? (autoDetectedProductType ?? chosenProductType ?? defaultProductType)
    : (accessLinks[0]?.productType ?? null);

  const selectedLink = useMemo(() => {
    if (!isRecordingTest) {
      return accessLinks[0] ?? null;
    }

    if (!effectiveProductType) {
      return null;
    }

    return accessLinks.find((link) => link.productType === effectiveProductType) ?? null;
  }, [accessLinks, effectiveProductType, isRecordingTest]);

  const selectedProductType = selectedLink?.productType ?? effectiveProductType ?? null;
  const recordingExperience = useMemo(
    () => resolveRecordingExperience(selectedProductType),
    [selectedProductType],
  );
  const isNativeDesktopRecording =
    isRecordingTest &&
    selectedProductType === "website" &&
    recordingExperience.mode === "native-desktop";
  const recordingInstructions = getRecordingInstructions(selectedProductType ?? "website");
  const testerInstructionSteps =
    submission && submission.instructionSteps.length > 0
      ? submission.instructionSteps
      : [
          "Explore the main flow, note anything confusing, and share specific feedback that would help improve the experience.",
        ];
  const todayUtcDate = new Date().toISOString().slice(0, 10);
  const googlePlayClosedTestParticipation = useMemo(() => {
    if (!currentUser || !submission?.needsGooglePlayClosedTesters) {
      return null;
    }

    return (
      state.googlePlayClosedTestParticipations.find(
        (participation) =>
          participation.submissionId === submission.id &&
          participation.testerUserId === currentUser.id &&
          (participation.status === "active" || participation.status === "completed"),
      ) ??
      state.googlePlayClosedTestParticipations.find(
        (participation) =>
          participation.submissionId === submission.id &&
          participation.testerUserId === currentUser.id,
      ) ??
      null
    );
  }, [currentUser, state.googlePlayClosedTestParticipations, submission]);
  const googlePlayClosedTestCheckIns = useMemo(
    () =>
      googlePlayClosedTestParticipation
        ? state.googlePlayClosedTestCheckIns.filter(
            (checkIn) => checkIn.participationId === googlePlayClosedTestParticipation.id,
          )
        : [],
    [googlePlayClosedTestParticipation, state.googlePlayClosedTestCheckIns],
  );
  const googlePlayClosedTestCheckInCount = googlePlayClosedTestCheckIns.length;
  const hasGooglePlayClosedTestCheckInToday = googlePlayClosedTestCheckIns.some(
    (checkIn) => checkIn.checkInDate === todayUtcDate,
  );
  const googlePlayClosedTestStatus = googlePlayClosedTestParticipation?.status ?? "not_started";
  const googlePlayClosedTestActionLabel = !currentUser
    ? "Sign in to join"
    : googlePlayClosedTestStatus === "completed"
      ? "Completed"
      : googlePlayClosedTestStatus === "active"
        ? hasGooglePlayClosedTestCheckInToday
          ? "Checked in today"
          : "Check in today"
        : "Join closed test";
  const googlePlayClosedTestProgressLabel =
    googlePlayClosedTestStatus === "completed"
      ? "14 / 14 days complete"
      : `${Math.min(googlePlayClosedTestCheckInCount, 14)} / 14 days checked in`;
  const hasQuestions = (questionSet?.questions.length ?? 0) > 0;
  const draftIdentity =
    currentUser && submission && activeSubmissionVersion && questionSet
      ? {
          userId: currentUser.id,
          submissionId: submission.id,
          submissionVersionId: activeSubmissionVersion.id,
          questionSetVersionId: questionSet.id,
        }
      : null;
  const draftIdentityKey = draftIdentity
    ? `${draftIdentity.userId}:${draftIdentity.submissionId}:${draftIdentity.submissionVersionId}:${draftIdentity.questionSetVersionId}`
    : "";
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
    const responsiveLevel = Math.pow(weightedLevel, 0.58);
    const weights = [0.6, 0.82, 1, 0.82, 0.6];

    return baseHeights.map((baseHeight, index) =>
      Math.min(
        34,
        Math.max(6, Math.round(baseHeight * (0.55 + responsiveLevel * 1.45 * weights[index]))),
      ),
    );
  }, [microphoneLevel, microphoneStatus]);

  useEffect(() => {
    if (!submission) {
      return;
    }

    trackEventOncePerSession(
      "test_started",
      { submissionId: submission.id },
      `test_started:${submission.id}`,
    );
  }, [submission?.id]);

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
    analyser.smoothingTimeConstant = 0.68;

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
      const nextLevel = Math.min(1, Math.max(0, rms - 0.006) * 18);
      setMicrophoneLevel((currentLevel) => currentLevel * 0.5 + nextLevel * 0.5);
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

  const returnToTestSessionWindow = () => {
    focusTestSessionWindow();
    window.setTimeout(focusTestSessionWindow, 100);
    window.setTimeout(focusTestSessionWindow, 350);
  };

  const renderRecordingPipWindow = () => {
    const pipWindow = recordingPipWindowRef.current;

    if (!pipWindow || pipWindow.closed) {
      recordingPipWindowRef.current = null;
      return;
    }

    const { document: pipDocument } = pipWindow;
    const isDeleteConfirm = recordingPipDeleteConfirm && uploadedRecording !== null;
    const isUploaded = uploadedRecording !== null && recordingPhase === "return_and_submit";
    const isUploading =
      !isUploaded && (recordingPhase === "uploading_recording" || isUploadingRecording);
    const uploadProgressPercentage = Math.min(
      100,
      Math.max(0, recordingUploadProgress?.percentage ?? 0),
    );
    const uploadProgressLabel = formatUploadProgress(recordingUploadProgress);
    const uploadStatusLabel =
      recordingUploadProgress?.state === "retrying" ? "Retrying upload" : "Upload in progress";
    const submitDisabledAttribute = submitDisabled ? " disabled" : "";
    const deleteDisabledAttribute = isDeletingRecording || isSubmitting ? " disabled" : "";
    const submitLabel = isSubmitting ? "Submitting..." : "Submit test";
    const deleteLabel = isDeletingRecording ? "Deleting..." : "Delete and re-record";
    const trashIcon = `
      <svg class="recording-pip__button-icon" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M8 6V4h8v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M19 6l-1 14H6L5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;

    pipDocument.title = isDeleteConfirm
      ? "Delete recording"
      : isUploaded
        ? "Recording uploaded"
        : isUploading
          ? "Uploading recording"
          : "Recording live";

    if (!pipDocument.getElementById("recording-pip-styles")) {
      const style = pipDocument.createElement("style");
      style.id = "recording-pip-styles";
      style.textContent = `
        :root {
          --pip-primary: ${tokens["semantic.color.action.primary"].value};
          --pip-primary-hover: ${tokens["semantic.color.action.primary-hover"].value};
          --pip-accent-tint: ${tokens["semantic.color.action.tint"].value};
          --pip-text: ${tokens["semantic.color.text.primary"].value};
          --pip-text-secondary: ${tokens["semantic.color.text.secondary"].value};
          --pip-border: ${tokens["semantic.color.border.default"].value};
          --pip-background: ${tokens["semantic.color.background.subtle"].value};
          --pip-surface: ${tokens["semantic.color.surface.default"].value};
          --pip-success: ${tokens["semantic.color.status.success"].value};
          --pip-success-tint: ${tokens["semantic.color.status.success-tint"].value};
          --pip-danger: ${tokens["semantic.color.status.danger"].value};
          --pip-danger-tint: ${tokens["semantic.color.status.danger-tint"].value};
          --pip-shadow: ${tokens["primitive.shadow.overlay"].value};
          --pip-font: ${tokens["primitive.font.family.sans"].value};
          --space-025: ${tokens["primitive.space.optical-2"].value};
          --space-050: ${tokens["primitive.space.1"].value};
          --space-075: ${tokens["primitive.space.optical-6"].value};
          --space-100: ${tokens["primitive.space.2"].value};
          --space-150: ${tokens["primitive.space.3"].value};
          --space-200: ${tokens["primitive.space.4"].value};
          --space-250: ${tokens["primitive.space.5"].value};
          --space-300: ${tokens["primitive.space.6"].value};
          color-scheme: light;
          font-family: var(--pip-font);
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
          background: var(--pip-background);
          color: var(--pip-text);
        }

        body {
          padding: var(--space-150);
        }

        .recording-pip {
          display: flex;
          min-height: calc(100vh - 24px);
          flex-direction: column;
          justify-content: space-between;
          gap: var(--space-150);
          padding: var(--space-200);
          border: 1px solid var(--pip-border);
          border-radius: 24px;
          background: var(--pip-surface);
          box-shadow: var(--pip-shadow);
        }

        .recording-pip__top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-150);
          min-width: 0;
        }

        .recording-pip__badge {
          display: inline-flex;
          align-items: center;
          gap: var(--space-100);
          min-width: 0;
          color: var(--pip-text);
          font-family: var(--pip-font);
          font-size: 0.96rem;
          font-weight: 700;
          letter-spacing: 0;
        }

        .recording-pip__dot {
          width: 12px;
          height: 12px;
          flex: 0 0 12px;
          border-radius: 999px;
          background: var(--pip-primary);
        }

        .recording-pip__dot--uploading {
          opacity: 0.78;
        }

        .recording-pip__dot--done {
          background: var(--pip-success);
        }

        .recording-pip__dot--danger {
          background: var(--pip-danger);
        }

        .recording-pip__timer {
          flex: 0 0 auto;
          min-height: 28px;
          padding: var(--space-075) var(--space-150);
          border-radius: 999px;
          background: var(--pip-accent-tint);
          color: var(--pip-primary-hover);
          font-size: 0.82rem;
          font-variant-numeric: tabular-nums;
          font-weight: 700;
        }

        .recording-pip__text {
          margin: 0;
          color: var(--pip-text-secondary);
          font-size: 0.9rem;
          line-height: 1.5;
        }

        .recording-pip__text--strong {
          color: var(--pip-text);
          font-family: var(--pip-font);
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0;
        }

        .recording-pip__status {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-100);
        }

        .recording-pip__pill {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 var(--space-150);
          border-radius: 999px;
          background: var(--pip-background);
          color: var(--pip-text-secondary);
          font-size: 0.82rem;
          font-weight: 700;
        }

        .recording-pip__pill--ok {
          background: var(--pip-accent-tint);
          color: var(--pip-primary-hover);
        }

        .recording-pip__pill--success {
          background: var(--pip-success-tint);
          color: var(--pip-success);
        }

        .recording-pip__button {
          width: 100%;
          min-height: 44px;
          border: 1px solid transparent;
          border-radius: 16px;
          background: var(--pip-primary);
          color: var(--pip-surface);
          cursor: pointer;
          font: inherit;
          font-size: 0.9rem;
          font-weight: 700;
          line-height: 1.2;
          padding: 0 var(--space-200);
          white-space: nowrap;
          transition: background-color 120ms ease, border-color 120ms ease, opacity 120ms ease;
        }

        .recording-pip__button:hover {
          background: var(--pip-primary-hover);
        }

        .recording-pip__button:disabled {
          cursor: default;
          opacity: 0.5;
          box-shadow: none;
        }

        .recording-pip__button-icon {
          flex: 0 0 auto;
        }

        .recording-pip__pill-icon {
          width: 1em;
          height: 1em;
          margin-left: var(--space-075);
          flex: 0 0 auto;
        }

        .recording-pip__progress {
          width: 100%;
          height: 14px;
          overflow: hidden;
          border-radius: 999px;
          background: var(--pip-border);
        }

        .recording-pip__progress-fill {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: var(--pip-primary);
          transition: width 220ms linear;
          will-change: width;
        }

        .recording-pip__progress-fill--uploading {
          width: 0%;
          border-top-right-radius: 0;
          border-bottom-right-radius: 0;
          width: 78%;
        }

        .recording-pip__progress-fill--uploading::after {
          content: "";
          display: block;
          width: 36px;
          height: 100%;
          margin-left: auto;
          transform: skewX(-38deg) translateX(18px);
          transform-origin: left center;
          background: var(--pip-primary-hover);
        }

        .recording-pip__progress-fill--done {
          width: 100%;
        }

        .recording-pip__main {
          display: flex;
          flex-direction: column;
          gap: var(--space-150);
          padding: var(--space-150);
          border: 1px solid var(--pip-border);
          border-radius: 16px;
          background: var(--pip-surface);
        }

        .recording-pip__main--danger {
          border-color: var(--pip-danger);
          background: var(--pip-danger-tint);
        }

        .recording-pip__actions {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: var(--space-100);
          align-items: center;
        }

        .recording-pip__actions .recording-pip__button {
          font-size: 0.84rem;
          padding: 0 var(--space-100);
        }

        .recording-pip__button--secondary,
        .recording-pip__button--danger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-100);
          border: 1px solid var(--pip-border);
          background: var(--pip-surface);
          color: var(--pip-text);
          box-shadow: none;
        }

        .recording-pip__button--secondary {
          border-color: var(--pip-border);
          background: var(--pip-surface);
          color: var(--pip-text);
        }

        .recording-pip__button--danger {
          border-color: var(--pip-danger);
          color: var(--pip-danger);
        }

        .recording-pip__button--danger:hover {
          background: var(--pip-danger-tint);
          border-color: var(--pip-danger);
        }

        .recording-pip__button--danger:disabled {
          background: var(--pip-surface);
          color: var(--pip-danger);
          opacity: 0.48;
        }

        .recording-pip__button--secondary:hover {
          background: var(--pip-background);
          border-color: var(--pip-border);
          box-shadow: none;
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

    if (isDeleteConfirm) {
      root.innerHTML = `
        <section class="recording-pip" aria-label="Delete recording confirmation">
          <div class="recording-pip__top">
            <div class="recording-pip__badge">
              <span>Delete recording?</span>
            </div>
          </div>
          <div class="recording-pip__main recording-pip__main--danger">
            <p class="recording-pip__text recording-pip__text--strong">Are you sure you want to delete and re-record?</p>
            <div class="recording-pip__status">
              <span class="recording-pip__pill">Your recording will be permanently deleted</span>
            </div>
          </div>
          <div class="recording-pip__actions">
            <button id="recording-pip-cancel-delete" class="recording-pip__button recording-pip__button--secondary" type="button">Go back</button>
            <button id="recording-pip-confirm-delete" class="recording-pip__button recording-pip__button--danger" type="button"${deleteDisabledAttribute}>
              ${trashIcon}
              ${deleteLabel}
            </button>
          </div>
        </section>
      `;

      pipDocument
        .getElementById("recording-pip-cancel-delete")
        ?.addEventListener("click", () => setRecordingPipDeleteConfirm(false), { once: true });
      pipDocument.getElementById("recording-pip-confirm-delete")?.addEventListener(
        "click",
        () => {
          void handleDeleteUploadedRecording({ returnToTestPage: true });
        },
        { once: true },
      );
      return;
    }

    if (isUploaded) {
      root.innerHTML = `
        <section class="recording-pip" aria-label="Recording uploaded">
          <div class="recording-pip__top">
            <div class="recording-pip__badge">
              <span>Recording uploaded</span>
            </div>
          </div>
          <div class="recording-pip__main">
            <p class="recording-pip__text">Your screen and voice recording is saved. Submit when you&apos;re ready.</p>
            <div class="recording-pip__progress" aria-label="Recording upload complete">
              <span class="recording-pip__progress-fill recording-pip__progress-fill--done"></span>
            </div>
            <div class="recording-pip__status">
              <span class="recording-pip__pill recording-pip__pill--success">
                Upload complete
                <svg class="recording-pip__pill-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </div>
          </div>
          <div class="recording-pip__actions">
            <button id="recording-pip-delete" class="recording-pip__button recording-pip__button--danger" type="button"${deleteDisabledAttribute}>
              ${trashIcon}
              ${deleteLabel}
            </button>
            <button id="recording-pip-submit" class="recording-pip__button" type="button"${submitDisabledAttribute}>${submitLabel}</button>
          </div>
        </section>
      `;

      pipDocument
        .getElementById("recording-pip-delete")
        ?.addEventListener("click", () => setRecordingPipDeleteConfirm(true), { once: true });
      pipDocument.getElementById("recording-pip-submit")?.addEventListener(
        "click",
        () => {
          void submit();
        },
        { once: true },
      );
      return;
    }

    if (isUploading) {
      root.innerHTML = `
        <section class="recording-pip" aria-label="Uploading recording">
          <div class="recording-pip__top">
            <div class="recording-pip__badge">
              <span>Uploading recording</span>
            </div>
          </div>
          <div class="recording-pip__main">
            <p class="recording-pip__text">Keep this window open while Test4Test saves your recording.</p>
            <div class="recording-pip__progress" aria-label="Recording upload in progress">
              <!-- ds-exception: runtime-measurements — determinate upload percentage. -->
              <span class="recording-pip__progress-fill" style="width: ${uploadProgressPercentage.toFixed(1)}%"></span>
            </div>
            <div class="recording-pip__status">
              <span class="recording-pip__pill recording-pip__pill--ok">${uploadStatusLabel}</span>
              <span class="recording-pip__pill">${uploadProgressLabel}</span>
            </div>
          </div>
          <div class="recording-pip__actions">
            <button class="recording-pip__button recording-pip__button--danger" type="button" disabled>
              ${trashIcon}
              Delete and re-record
            </button>
            <button class="recording-pip__button" type="button" disabled>Submit test</button>
          </div>
        </section>
      `;
      return;
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
        <div class="recording-pip__main">
          <p class="recording-pip__text">You can move this window while you test. Click finish when you are done.</p>
          <div class="recording-pip__status">
            <span class="recording-pip__pill${microphoneStatus === "ready" ? " recording-pip__pill--ok" : ""}">
              Mic ${microphoneStatus === "ready" ? "connected" : "not ready"}
            </span>
            <span class="recording-pip__pill${screenShareStatus === "active" ? " recording-pip__pill--ok" : ""}">
              Screen ${screenShareStatus === "active" ? "sharing" : "not shared"}
            </span>
          </div>
        </div>
        <button id="recording-pip-finish" class="recording-pip__button" type="button">Finish recording</button>
      </section>
    `;

    pipDocument
      .getElementById("recording-pip-finish")
      ?.addEventListener("click", () => stopNativeRecording(), { once: true });
  };

  const openRecordingPipWindow = async () => {
    const documentPictureInPicture = (window as WindowWithDocumentPictureInPicture)
      .documentPictureInPicture;

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
        width: 383,
        height: 292,
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

    for (const stream of [
      displayStreamRef.current,
      microphoneStreamRef.current,
      combinedStreamRef.current,
    ]) {
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
          : activeTrackDeviceId &&
              microphoneDevices.some((device) => device.deviceId === activeTrackDeviceId)
            ? activeTrackDeviceId
            : (microphoneDevices[0]?.deviceId ?? "");

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
      setMessage("");
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
    if (!recordingUploadIdentity) {
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
    setRecordingUploadProgress(null);
    setRecordingPipDeleteConfirm(false);

    try {
      const nextRecording = await uploadRecordingDraft(
        recordingUploadIdentity,
        recordingSessionId,
        file,
        uploadedRecording,
        {
          ...recordingUploadIdentityOptions,
          onProgress: setRecordingUploadProgress,
        },
      );
      setUploadedRecording(nextRecording);
      setNativeRecoveryUploadEnabled(false);
      setRecordingPhase("return_and_submit");
      setRecordingUploadProgress(null);
      setMessage(successMessage);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "The recording could not be uploaded.";
      setNativeUploadError(errorMessage);
      setMessage(errorMessage);
      return false;
    } finally {
      setIsUploadingRecording(false);
    }
  };

  const finalizeNativeRecording = async (blob: Blob, mimeType: string) => {
    const resolvedMimeType =
      normalizeRecordingMimeType(
        "",
        mimeType || getPreferredMediaRecorderMimeType() || "video/webm",
      ) || "video/webm";
    const generatedFileName = createGeneratedRecordingFileName(
      recordingSessionId,
      resolvedMimeType,
    );
    const generatedFile = new File([blob], generatedFileName, {
      type: resolvedMimeType,
      lastModified: Date.now(),
    });
    const validation = validateRecordingFile(generatedFile);

    setNativeRecordingBlob(blob);
    setNativeRecordingMimeType(resolvedMimeType);

    if (!validation.ok) {
      setRecordingPhase("return_and_submit");
      setNativeUploadError(validation.message);
      setMessage(validation.message);
      return;
    }

    if (!recordingUploadIdentity) {
      setRecordingPhase("return_and_submit");
      setNativeUploadError("Verify your email before the browser recording can upload.");
      setMessage("Verify your email before the browser recording can upload.");
      return;
    }

    setRecordingPhase("uploading_recording");
    setIsUploadingRecording(true);
    setNativeUploadError("");
    setMessage("");
    setRecordingUploadProgress(null);
    setRecordingPipDeleteConfirm(false);

    try {
      const uploadPath =
        pendingRecordingUploadPath ||
        buildRecordingDraftPath(recordingUploadIdentity, recordingSessionId, generatedFile.name);
      setPendingRecordingUploadPath(uploadPath);

      const nextRecording = await uploadGeneratedRecordingDraft(
        recordingUploadIdentity,
        recordingSessionId,
        blob,
        resolvedMimeType,
        uploadedRecording,
        {
          ...recordingUploadIdentityOptions,
          path: uploadPath,
          onProgress: setRecordingUploadProgress,
        },
      );
      setUploadedRecording(nextRecording);
      setNativeRecordingBlob(null);
      setNativeRecoveryUploadEnabled(false);
      setPendingRecordingUploadPath("");
      setRecordingUploadProgress(null);
      setRecordingPhase("return_and_submit");
      setScreenShareStatus("ended");
      setNativeCaptureConfirmed(false);
      setMessage("");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "The recording could not be uploaded automatically.";
      setRecordingPhase("return_and_submit");
      setScreenShareStatus("ended");
      setNativeCaptureConfirmed(false);
      setNativeUploadError(errorMessage);
      setMessage(errorMessage);
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
    setRecordingUploadProgress(null);
    setPendingRecordingUploadPath("");
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
    setRecordingPipDeleteConfirm(false);
  };

  const stopNativeRecording = (options?: { focusTestPage?: boolean }) => {
    if (options?.focusTestPage) {
      returnToTestSessionWindow();
    }

    const recorder = mediaRecorderRef.current;
    setRecordingPipDeleteConfirm(false);

    if (!recorder || recorder.state === "inactive") {
      setRecordingPhase("return_and_submit");
      setNativeRecoveryUploadEnabled(true);
      setScreenShareStatus("ended");
      setNativeCaptureConfirmed(false);
      setMessage(
        "The browser recording is no longer active. Upload a saved backup if you have one, or start again.",
      );
      return;
    }

    nativeStopReasonRef.current = "user-finished";
    setRecordingPhase("uploading_recording");
    recorder.stop();
  };

  const buildDraftInput = (nextAnswers: Record<string, string>) => {
    if (!draftIdentity || !questionSet) {
      return null;
    }

    const answerValues = pruneAnswerValues(nextAnswers, questionSet.questions);

    if (!hasSavedAnswerValues(answerValues)) {
      return null;
    }

    return {
      ...draftIdentity,
      answerValues,
      startedAt: new Date(startedAt).toISOString(),
    };
  };

  const saveAnswersLocally = (nextAnswers: Record<string, string>) => {
    if (!draftIdentity) {
      return;
    }

    const input = buildDraftInput(nextAnswers);

    if (!input) {
      clearLocalTestResponseDraft(
        draftIdentity.userId,
        draftIdentity.submissionId,
        draftIdentity.questionSetVersionId,
      );
      return;
    }

    saveLocalTestResponseDraft(input);
  };

  const updateAnswer = (questionId: string, value: string) => {
    draftEditedKeyRef.current = draftIdentityKey;
    setAnswers((current) => {
      const nextAnswers = { ...current, [questionId]: value };
      saveAnswersLocally(nextAnswers);
      return nextAnswers;
    });
  };

  const persistDraftNow = async (nextAnswers = answers) => {
    if (!draftIdentity) {
      return;
    }

    const input = buildDraftInput(nextAnswers);

    if (!input) {
      setDraftSaveStatus("idle");
      await clearTestResponseDraft(
        draftIdentity.userId,
        draftIdentity.submissionId,
        draftIdentity.questionSetVersionId,
      );
      return;
    }

    const result = await saveTestResponseDraft(input, {
      skipServer: draftServerUnavailableRef.current,
    });

    if (result.persistedTo === "server") {
      setDraftSaveStatus("saved");
      return;
    }

    draftServerUnavailableRef.current = true;
    setDraftSaveStatus("saved_local");
  };

  const handleBackToEarn = () => {
    void persistDraftNow();
    navigate("/earn");
  };

  const navigateAfterSuccessfulSubmit = (creditAwarded: boolean) => {
    if (!currentUser) {
      navigate(`/test/${submission?.id ?? resolvedSubmissionId}/success?shared=1`);
      return;
    }

    returnToTestSessionWindow();
    closeRecordingPipWindow();
    navigate("/earn", {
      replace: true,
      state: creditAwarded
        ? {
            kind: "earned-credit",
            placementSnapshot: consumeEarnPlacementSnapshot(),
          }
        : undefined,
    });
  };

  useEffect(() => {
    if (!draftIdentity || !questionSet) {
      setLoadedDraftKey("");
      setDraftSaveStatus("idle");
      return undefined;
    }

    let isCancelled = false;
    const key = draftIdentityKey;
    draftEditedKeyRef.current = "";
    setLoadedDraftKey("");
    setDraftSaveStatus("loading");

    const loadDraft = async () => {
      const draft = await loadTestResponseDraft(
        draftIdentity.userId,
        draftIdentity.submissionId,
        draftIdentity.questionSetVersionId,
      );

      if (isCancelled) {
        return;
      }

      const userEditedDuringLoad = draftEditedKeyRef.current === key;

      if (draft && !userEditedDuringLoad) {
        const nextAnswers = pruneAnswerValues(draft.answerValues, questionSet.questions);
        const hasAnswers = hasSavedAnswerValues(nextAnswers);
        setAnswers(nextAnswers);
        setStartedAt(parseDraftStartedAt(draft.startedAt));
        setDraftSaveStatus(
          hasAnswers ? (draft.source === "server" ? "restored" : "restored_local") : "idle",
        );
      } else if (!userEditedDuringLoad) {
        setAnswers({});
        setStartedAt(Date.now());
        setDraftSaveStatus("idle");
      }

      setLoadedDraftKey(key);
    };

    void loadDraft();

    return () => {
      isCancelled = true;
    };
  }, [draftIdentityKey, questionSet?.id]);

  useEffect(() => {
    if (!draftIdentity || !questionSet || loadedDraftKey !== draftIdentityKey) {
      return undefined;
    }

    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }

    const input = buildDraftInput(answers);

    if (!input) {
      setDraftSaveStatus("idle");
      void clearTestResponseDraft(
        draftIdentity.userId,
        draftIdentity.submissionId,
        draftIdentity.questionSetVersionId,
      );
      return undefined;
    }

    saveLocalTestResponseDraft(input);
    setDraftSaveStatus("saving");

    const saveSequence = draftSaveSequenceRef.current + 1;
    draftSaveSequenceRef.current = saveSequence;
    draftSaveTimerRef.current = window.setTimeout(() => {
      void saveTestResponseDraft(input, {
        skipServer: draftServerUnavailableRef.current,
      }).then((result) => {
        if (draftSaveSequenceRef.current !== saveSequence) {
          return;
        }

        if (result.persistedTo === "server") {
          setDraftSaveStatus("saved");
          return;
        }

        draftServerUnavailableRef.current = true;
        setDraftSaveStatus("saved_local");
      });
    }, 800);

    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [answers, draftIdentityKey, loadedDraftKey, questionSet?.id, startedAt]);

  useEffect(() => {
    if (!isRecordingTest) {
      recordingSessionStorageIds.forEach(clearRecordingTestSession);
      return;
    }

    const validChosenProductType = selectedProductType
      ? accessLinks.some((link) => link.productType === selectedProductType)
        ? selectedProductType
        : null
      : null;

    recordingSessionStorageIds.forEach((storageSubmissionId) => {
      saveRecordingTestSession({
        submissionId: storageSubmissionId,
        sessionId: recordingSessionId,
        phase: recordingPhase,
        chosenProductType: validChosenProductType,
        confirmedRecording,
        recording: uploadedRecording,
      });
    });
  }, [
    accessLinks,
    confirmedRecording,
    isRecordingTest,
    recordingPhase,
    recordingSessionId,
    recordingSessionStorageIds,
    selectedProductType,
    uploadedRecording,
  ]);

  useEffect(() => {
    if (!isRecordingTest) {
      return;
    }

    if (autoDetectedProductType && chosenProductType !== autoDetectedProductType) {
      setChosenProductType(autoDetectedProductType);
      return;
    }

    if (chosenProductType && !accessLinks.some((link) => link.productType === chosenProductType)) {
      setChosenProductType(autoDetectedProductType);
    }
  }, [accessLinks, autoDetectedProductType, chosenProductType, isRecordingTest]);

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
    const shouldKeepRecordingPipOpen =
      isNativeDesktopRecording &&
      (recordingPhase === "recording_live" ||
        recordingPhase === "uploading_recording" ||
        (recordingPhase === "return_and_submit" && uploadedRecording !== null));

    if (!shouldKeepRecordingPipOpen) {
      closeRecordingPipWindow();
      return;
    }

    renderRecordingPipWindow();
  }, [
    isDeletingRecording,
    isNativeDesktopRecording,
    isSubmitting,
    isUploadingRecording,
    liveElapsedSeconds,
    microphoneStatus,
    nativeCaptureConfirmed,
    recordingPipDeleteConfirm,
    recordingPhase,
    recordingUploadProgress,
    screenShareStatus,
    submitDisabled,
    uploadedRecording,
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

  if (!submission || !questionSet || !activeSubmissionVersion) {
    return (
      <AppShell title="Test session" description="The test you're looking for could not be loaded.">
        <Surface>
          <p>Try returning to the Earn page and choosing another live submission.</p>
        </Surface>
      </AppShell>
    );
  }

  const handleGooglePlayClosedTestAction = async () => {
    if (!submission.needsGooglePlayClosedTesters) {
      return;
    }

    if (!currentUser) {
      navigate(`/sign-in?returnTo=${encodeURIComponent(`/test/${submission.id}`)}`);
      return;
    }

    if (
      googlePlayClosedTestParticipation?.status === "completed" ||
      (googlePlayClosedTestParticipation?.status === "active" &&
        hasGooglePlayClosedTestCheckInToday)
    ) {
      return;
    }

    const isActiveAttempt = googlePlayClosedTestParticipation?.status === "active";
    setClosedTestAction(isActiveAttempt ? "checking-in" : "joining");
    setClosedTestNotice("");

    try {
      const result = isActiveAttempt
        ? await recordGooglePlayClosedTestCheckIn(submission.id)
        : await startGooglePlayClosedTestParticipation(submission.id);

      setClosedTestNotice(result.message);
    } catch (error) {
      setClosedTestNotice(
        error instanceof Error
          ? error.message
          : "We could not update this Google Play closed test right now.",
      );
    } finally {
      setClosedTestAction(null);
    }
  };

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
        questionSet.id,
        activeSubmissionVersion.id,
      );
      setMessage(result.message);
      if (result.ok) {
        if (isRecordingTest) {
          recordingSessionStorageIds.forEach(clearRecordingTestSession);
        }
        if (currentUser) {
          await clearTestResponseDraft(currentUser.id, submission.id);
        }
        navigateAfterSuccessfulSubmit(result.creditAwarded);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeReportModal = () => {
    if (isSubmittingReport) {
      return;
    }

    setIsReportModalOpen(false);
    setReportError("");
  };

  const submitReport = async () => {
    if (!currentUser) {
      setReportError("Sign in to report this test.");
      return;
    }

    const trimmedMessage = reportMessage.trim();

    if (reportReason === "other" && !trimmedMessage) {
      setReportError("Tell us what happened before submitting an Other report.");
      return;
    }

    setIsSubmittingReport(true);
    setReportError("");

    try {
      await reportTest(submission.id, reportReason, trimmedMessage);
      setHasSubmittedReport(true);
    } catch (error) {
      setReportError(
        error instanceof Error ? error.message : "We could not submit this report right now.",
      );
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleManualRecordingStart = () => {
    if (!selectedLink && accessLinks.length > 0) {
      setMessage("We couldn't find a matching app link for this device. Try refreshing the page.");
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

    if (!recordingUploadIdentity) {
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
          setNativeUploadError(
            "The browser did not capture a recording. Start again or upload a saved backup file.",
          );
          setMessage(
            "The browser did not capture a recording. Start again or upload a saved backup file.",
          );
          return;
        }

        void finalizeNativeRecording(finalBlob, chunkMimeType);
      };

      activeVideoTrack.onended = () => {
        if (mediaRecorderRef.current?.state === "recording") {
          nativeStopReasonRef.current = "share-ended";
          setScreenShareStatus("ended");
          setNativeCaptureConfirmed(false);
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
        setMessage(
          "Recording live. Your microphone is connected and screen sharing is active. If the website did not open automatically, use the button below to open it in a new tab.",
        );
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

    await uploadManualRecordingFile(file, "");
  };

  const handleDeleteUploadedRecording = async (options?: { returnToTestPage?: boolean }) => {
    if (!uploadedRecording) {
      return;
    }

    if (!recordingUploadIdentity) {
      setMessage("Verify your email before deleting a recording.");
      if (options?.returnToTestPage) {
        returnToTestSessionWindow();
      }
      return;
    }

    if (options?.returnToTestPage) {
      returnToTestSessionWindow();
    }

    setIsDeletingRecording(true);
    setNativeUploadError("");
    setMessage("");
    setRecordingPipDeleteConfirm(false);

    try {
      await deleteRecordingDraft(uploadedRecording, recordingUploadIdentityOptions);
      cleanupActiveCaptureStreams();
      setUploadedRecording(null);
      setNativeRecordingBlob(null);
      setRecordingUploadProgress(null);
      setPendingRecordingUploadPath("");
      setNativeUploadError("");
      setNativeRecoveryUploadEnabled(false);
      setConfirmedRecording(false);
      setManualRecordingGuideStep(0);
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
  const draftStatusCopy = getDraftStatusCopy(draftSaveStatus);
  const manualRecordingDevice = getManualRecordingDevice(
    selectedProductType,
    recordingExperience.mobileOs,
    recordingExperience.isMobile,
  );
  const isPhoneManualRecording =
    manualRecordingDevice === "ios" ||
    manualRecordingDevice === "android" ||
    manualRecordingDevice === "mobile";
  const manualRecordingTitle = getManualRecordingTitle(
    manualRecordingDevice,
    recordingInstructions.title,
  );
  const manualRecordingIntro = isPhoneManualRecording ? "" : recordingInstructions.intro;
  const manualRecordingGuideUrl =
    manualRecordingDevice === "ios"
      ? "https://support.apple.com/en-us/102653"
      : manualRecordingDevice === "android"
        ? "https://support.google.com/android/answer/9075928?hl=en"
        : "";
  const manualRecordingSteps = isPhoneManualRecording
    ? [
        "Find a quiet place, close any unwanted tabs and get ready to think out loud. Share your honest thoughts. There are no right or wrong answers.",
        "The app will open in a new tab. Refer back here for instructions. When you're finished, stop the recording and upload it.",
        "Start recording your screen and microphone.",
      ]
    : recordingInstructions.steps;
  const manualRecordingGuideSteps = [
    { id: "prepare", label: "Prepare" },
    { id: "task", label: "Review task" },
    { id: "record", label: "Start recording" },
  ];
  const activeManualRecordingStep =
    manualRecordingSteps[manualRecordingGuideStep] ?? manualRecordingSteps[0];
  const screenRecordingIllustrationDevice =
    manualRecordingDevice === "ios" || manualRecordingDevice === "android"
      ? manualRecordingDevice
      : null;
  const shouldShowManualRecordingCallout =
    !isNativeDesktopRecording && !recordingExperience.isMobile;
  const shouldShowManualRecordingGuidance = !isNativeDesktopRecording && isPhoneManualRecording;
  const shouldShowManualRecoveryUpload =
    isNativeDesktopRecording &&
    nativeRecoveryUploadEnabled &&
    !uploadedRecording &&
    !nativeRecordingBlob;
  const testSessionHeaderCopy =
    !isSharedPublicVisit && !isRecordingTest && isPublicTester
      ? "No sign up required. Open the app, answer the questions, and your feedback will go straight to the app owner."
      : "";
  const testSessionTitle = isSharedPublicVisit
    ? sharedCustomMessage || `Congrats! You've been selected to try ${submission.productName}`
    : "";
  const backToTestsLabel = currentUser ? "Go back" : "Browse tests";
  const shouldShowBackToTests = !isSharedPublicVisit;

  return (
    <AppShell eyebrowLabel={null} hideSiteHeader={isSharedPublicVisit}>
      <div className={`${styles.page} test-layout test-layout--single`}>
        {testSessionTitle || testSessionHeaderCopy ? (
          <div className="test-session__header">
            <h1 className={testSessionTitle ? undefined : "ds-sr-only"}>
              {testSessionTitle || "Test session"}
            </h1>
            {testSessionHeaderCopy ? <p>{testSessionHeaderCopy}</p> : null}
          </div>
        ) : (
          <h1 className="ds-sr-only">Test session</h1>
        )}

        <Surface className="test-questions test-questions--full">
          <Card className={styles.introCard}>
            <div className="test-session__intro-card-header">
              <div className="test-session__resource">
                <span className="test-session__label">
                  {accessLinks.length > 1 ? "App links" : "App link"}
                </span>
                {accessLinks.length > 0 ? (
                  <div className="test-session__link-list">
                    {accessLinks.map((link) => (
                      <Link
                        key={link.kind}
                        to={link.normalizedUrl}
                        external
                        target="_blank"
                        rel="noreferrer"
                        className="test-session__link"
                      >
                        <span className="test-session__link-label">{link.label}</span>
                        <span>{link.displayUrl}</span>
                        <ExternalLink size={16} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p>No public app links were provided for this test.</p>
                )}
              </div>
              {currentUser ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  onClick={() => {
                    setReportError("");
                    setIsReportModalOpen(true);
                  }}
                  disabled={hasSubmittedReport}
                >
                  <Flag size={16} />
                  {hasSubmittedReport ? "Report submitted" : "Report"}
                </Button>
              ) : null}
            </div>
            <div className="test-session__resource">
              <span className="test-session__label">Tester instructions</span>
              <ol className="test-session__instruction-list">
                {testerInstructionSteps.map((instruction, index) => (
                  <li key={`${index}-${instruction}`}>{instruction}</li>
                ))}
              </ol>
            </div>
            {submission.needsGooglePlayClosedTesters ? (
              <div className="google-play-session-panel">
                <div className="google-play-session-panel__copy">
                  <span className="test-session__label">Google Play closed test</span>
                  <strong>Use this Android app for 14 consecutive days.</strong>
                  <p>
                    Join the Google Play closed test, install the app, and check in here once per
                    day.
                  </p>
                  {submission.googlePlayClosedTestInstructions.trim() ? (
                    <p>{submission.googlePlayClosedTestInstructions.trim()}</p>
                  ) : null}
                  {currentUser ? <small>{googlePlayClosedTestProgressLabel}</small> : null}
                </div>
                <div className="google-play-session-panel__actions">
                  <Button
                    type="button"
                    onClick={() => void handleGooglePlayClosedTestAction()}
                    loading={closedTestAction !== null}
                    loadingLabel="Saving..."
                    disabled={
                      googlePlayClosedTestParticipation?.status === "completed" ||
                      (googlePlayClosedTestParticipation?.status === "active" &&
                        hasGooglePlayClosedTestCheckInToday)
                    }
                  >
                    {googlePlayClosedTestActionLabel}
                  </Button>
                  {closedTestNotice ? (
                    <small className="google-play-session-panel__notice">{closedTestNotice}</small>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Card>

          {isRecordingTest ? (
            <>
              {shouldShowManualRecordingCallout ? (
                <div className="callout callout--soft recording-test-callout">
                  <div className="recording-test-callout__copy">
                    <span className="recording-test-callout__eyebrow">
                      Screen + voice recording
                    </span>
                    <strong>This session needs a screen and voice recording.</strong>
                    <p>{recordingExperience.reason}</p>
                  </div>
                  <Mic size={20} aria-hidden="true" />
                </div>
              ) : null}

              {recordingPhase === "preflight" ? (
                <div className="recording-phase-stack">
                  {isNativeDesktopRecording ? (
                    <Card as="section" className={styles.setupCard}>
                      <ol className={styles.setupSteps} aria-label="Recording setup">
                        <li className={styles.setupStep}>
                          <div className={styles.setupStepBody}>
                            <div className={styles.microphoneSetup}>
                              {availableMicrophones.length > 0 || microphoneStatus === "ready" ? (
                                <div className="recording-microphone-input-row">
                                  {availableMicrophones.length > 0 ? (
                                    <Select
                                      label="Microphone device"
                                      value={selectedMicrophoneId}
                                      onChange={(event) => {
                                        const nextMicrophoneId = event.target.value;
                                        setSelectedMicrophoneId(nextMicrophoneId);
                                        void prepareMicrophonePreview(nextMicrophoneId);
                                      }}
                                      disabled={microphoneStatus === "requesting"}
                                    >
                                      {availableMicrophones.map((microphone) => (
                                        <option
                                          key={microphone.deviceId}
                                          value={microphone.deviceId}
                                        >
                                          {microphone.label}
                                        </option>
                                      ))}
                                    </Select>
                                  ) : null}
                                  {microphoneStatus === "ready" ? (
                                    <div
                                      className="recording-mic-indicator recording-mic-indicator--active"
                                      role="img"
                                      aria-label="Voice activity level for the selected microphone"
                                    >
                                      {microphoneBarHeights.map((height, index) => (
                                        /* ds-exception: runtime-measurements — measured waveform height. */
                                        <span
                                          key={`mic-bar-${index}`}
                                          style={{ height: `${height}px` }}
                                        />
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : null}
                              {microphoneStatus !== "ready" || microphoneError ? (
                                <div className="recording-microphone-actions">
                                  {microphoneStatus !== "ready" ? (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="compact"
                                      loading={microphoneStatus === "requesting"}
                                      loadingLabel="Checking microphone..."
                                      onClick={() => {
                                        void prepareMicrophonePreview(
                                          selectedMicrophoneId || undefined,
                                        );
                                      }}
                                    >
                                      Enable microphone
                                    </Button>
                                  ) : null}
                                  {microphoneStatus !== "ready" ? (
                                    <div
                                      className="recording-mic-indicator recording-mic-indicator--inactive"
                                      role="img"
                                      aria-label="Microphone activity is inactive until microphone access is enabled"
                                    >
                                      {microphoneBarHeights.map((height, index) => (
                                        /* ds-exception: runtime-measurements — measured waveform height. */
                                        <span
                                          key={`inactive-mic-bar-${index}`}
                                          style={{ height: `${height}px` }}
                                        />
                                      ))}
                                    </div>
                                  ) : null}
                                  {microphoneError ? (
                                    <Alert tone="danger">{microphoneError}</Alert>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </li>
                        <li
                          className={`${styles.setupStep} ${
                            microphoneStatus !== "ready" ? styles.setupStepPending : ""
                          }`}
                        >
                          <div className={styles.setupStepBody}>
                            <Button
                              type="button"
                              variant="secondary"
                              size="compact"
                              loading={screenShareStatus === "requesting"}
                              loadingLabel="Waiting for screen share..."
                              onClick={() => {
                                void prepareScreenSharePreview();
                              }}
                              disabled={microphoneStatus !== "ready"}
                            >
                              Share screen
                            </Button>
                            {screenShareStatus === "active" ? (
                              <RecordingStatus
                                status="Screen sharing active"
                                description="Your entire screen is ready to record."
                                tone="success"
                              />
                            ) : screenShareStatus === "error" || screenShareStatus === "ended" ? (
                              <Alert tone="danger">
                                {screenShareStatus === "ended"
                                  ? "Screen sharing stopped. Enable it again before starting."
                                  : "Screen sharing did not start. Try again."}
                              </Alert>
                            ) : (
                              <small className="helper-text">
                                Select "Entire screen" and then click "Share"
                              </small>
                            )}
                          </div>
                        </li>
                        <li
                          className={`${styles.setupStep} ${
                            screenShareStatus !== "active" ? styles.setupStepPending : ""
                          }`}
                        >
                          <div className={styles.setupStepBody}>
                            <strong>Prepare to think out loud</strong>
                            <small className="helper-text">
                              Find a quiet place. Close out any unwanted tabs. And share your honest
                              thoughts. There are no right or wrong answers.
                            </small>
                          </div>
                        </li>
                      </ol>
                    </Card>
                  ) : (
                    <>
                      {shouldShowManualRecordingGuidance ? (
                        <Card as="section" className={styles.setupCard}>
                          <Stack gap="lg">
                            <div className="recording-guidance__intro">
                              <h2>{manualRecordingTitle}</h2>
                              {manualRecordingIntro ? <p>{manualRecordingIntro}</p> : null}
                            </div>
                            <Stepper
                              steps={manualRecordingGuideSteps}
                              currentStep={
                                manualRecordingGuideSteps[manualRecordingGuideStep]?.id ?? "prepare"
                              }
                            />
                            <Stack gap="md">
                              <div>
                                <span className="test-session__label">
                                  Step {manualRecordingGuideStep + 1} of 3
                                </span>
                                <h3>
                                  {manualRecordingGuideSteps[manualRecordingGuideStep]?.label}
                                </h3>
                              </div>
                              {manualRecordingGuideStep === 2 && manualRecordingGuideUrl ? (
                                <p>
                                  Start recording your screen and microphone. If you are not sure
                                  how to record,{" "}
                                  <Link
                                    to={manualRecordingGuideUrl}
                                    external
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    open the recording guide
                                  </Link>
                                  .
                                </p>
                              ) : (
                                <p>{activeManualRecordingStep}</p>
                              )}
                              {manualRecordingGuideStep === 2 &&
                              screenRecordingIllustrationDevice ? (
                                <ScreenRecordingMenuIllustration
                                  device={screenRecordingIllustrationDevice}
                                />
                              ) : null}
                              {manualRecordingGuideStep === 2 ? (
                                <Checkbox
                                  className={styles.attestation}
                                  checked={confirmedRecording}
                                  onChange={(event) => setConfirmedRecording(event.target.checked)}
                                  label={
                                    <span>
                                      I started recording and can see the{" "}
                                      <span
                                        className="recording-attestation__recording-dot"
                                        aria-hidden="true"
                                      />{" "}
                                      at the top of my screen
                                    </span>
                                  }
                                />
                              ) : null}
                              <div className="inline-actions">
                                {manualRecordingGuideStep > 0 ? (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() =>
                                      setManualRecordingGuideStep((step) => Math.max(0, step - 1))
                                    }
                                  >
                                    Back
                                  </Button>
                                ) : null}
                                {manualRecordingGuideStep < 2 ? (
                                  <Button
                                    type="button"
                                    onClick={() =>
                                      setManualRecordingGuideStep((step) => Math.min(2, step + 1))
                                    }
                                  >
                                    Continue
                                  </Button>
                                ) : null}
                              </div>
                            </Stack>
                          </Stack>
                        </Card>
                      ) : null}

                      {!shouldShowManualRecordingGuidance ? (
                        <Checkbox
                          className={styles.attestation}
                          checked={confirmedRecording}
                          onChange={(event) => setConfirmedRecording(event.target.checked)}
                          label="I started recording my screen and microphone."
                        />
                      ) : null}
                    </>
                  )}

                  {isNativeDesktopRecording ? (
                    <details
                      className={styles.recoveryUpload}
                      onToggle={(event) => setIsRecoveryUploadOpen(event.currentTarget.open)}
                    >
                      <summary className={styles.recoverySummary}>
                        <span>Already recorded?</span>
                        {isRecoveryUploadOpen ? (
                          <ChevronUp size={16} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={16} aria-hidden="true" />
                        )}
                      </summary>
                      <div className={styles.recoveryBody}>
                        <div className="recording-recovery-upload__copy">
                          <strong>Already have a saved recording?</strong>
                          <small className="helper-text">
                            If you downloaded a backup after a failed upload, attach it here and
                            submit without recording again.
                          </small>
                        </div>
                        <TextField
                          className="recording-recovery-upload__field"
                          type="file"
                          label="Upload saved recording"
                          helpText="Accepted: MP4, MOV, or WEBM up to 1 GB."
                          accept={RECORDING_ACCEPT_ATTRIBUTE}
                          onChange={handleRecordingUpload}
                          disabled={isUploadingRecording}
                        />
                      </div>
                    </details>
                  ) : null}

                  <div className="wizard-actions">
                    {shouldShowBackToTests ? (
                      <Button type="button" variant="secondary" onClick={handleBackToEarn}>
                        {backToTestsLabel}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      onClick={() => {
                        if (isNativeDesktopRecording) {
                          void handleNativeRecordingStart();
                        } else {
                          handleManualRecordingStart();
                        }
                      }}
                      disabled={
                        isNativeDesktopRecording
                          ? microphoneStatus !== "ready" || screenShareStatus !== "active"
                          : !confirmedRecording
                      }
                    >
                      {isNativeDesktopRecording ? "Start test" : "I'm recording and ready to test"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {recordingPhase === "recording_live" ? (
                <div className="recording-phase-card">
                  <div className="recording-phase-card__copy">
                    <span className="test-session__label">
                      {isNativeDesktopRecording ? "Recording live" : "Testing in progress"}
                    </span>
                    <h2>
                      {isNativeDesktopRecording
                        ? "Your test is recording"
                        : recordingInstructions.launchTitle}
                    </h2>
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
                      <Link
                        to={selectedLink.normalizedUrl}
                        external
                        target="_blank"
                        rel="noreferrer"
                        className={styles.actionLink}
                      >
                        {isNativeDesktopRecording
                          ? "Open website again"
                          : recordingInstructions.launchButtonLabel}
                        <ExternalLink size={16} />
                      </Link>
                    ) : null}
                    {isNativeDesktopRecording ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          void openRecordingPipWindow().then((opened) => {
                            if (!opened) {
                              setMessage(
                                "Your browser did not allow the movable recording control. Keep this Test4Test tab open to finish recording.",
                              );
                            }
                          });
                        }}
                      >
                        Show floating recorder
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      onClick={() => {
                        if (isNativeDesktopRecording) {
                          stopNativeRecording();
                        } else {
                          setRecordingPhase("return_and_submit");
                          setMessage(
                            "Stop your recording, upload the video, then finish the questionnaire.",
                          );
                        }
                      }}
                    >
                      I&apos;m finished testing
                    </Button>
                  </div>
                  {popupBlocked ? (
                    <Alert tone="warning">
                      <span>
                        The website did not open automatically. Use the button above to open it in a
                        new tab.
                      </span>
                    </Alert>
                  ) : null}
                </div>
              ) : null}

              {recordingPhase === "uploading_recording" ? (
                <div className="recording-upload-card">
                  <div className="recording-upload-card__copy">
                    <span className="test-session__label">Uploading recording</span>
                    <h2>Uploading your browser recording</h2>
                    <p>
                      Stay on this page while Test4Test saves the screen recording automatically.
                    </p>
                  </div>
                  <RecordingStatus
                    status={
                      recordingUploadProgress?.state === "retrying"
                        ? "Upload paused briefly. Retrying"
                        : "Uploading recording"
                    }
                    description={formatUploadProgress(recordingUploadProgress)}
                    progress={Math.min(100, Math.max(0, recordingUploadProgress?.percentage ?? 0))}
                    tone={recordingUploadProgress?.state === "retrying" ? "warning" : "info"}
                  />
                </div>
              ) : null}

              {recordingPhase === "return_and_submit" ? (
                <div className="recording-upload-card">
                  {uploadedRecording ? (
                    <div className="recording-upload-card__uploaded">
                      <h2>RECORDING UPLOADED</h2>
                      <Button
                        type="button"
                        variant="danger"
                        size="compact"
                        loading={isDeletingRecording}
                        loadingLabel="Deleting..."
                        onClick={() => {
                          void handleDeleteUploadedRecording();
                        }}
                        disabled={isDeletingRecording || isUploadingRecording || isSubmitting}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        Delete and re-record
                      </Button>
                    </div>
                  ) : (
                    <div className="recording-upload-card__copy">
                      <span className="test-session__label">Return and submit</span>
                      <h2>
                        {isNativeDesktopRecording
                          ? "Review the recording and submit"
                          : "Stop your recording and upload the video"}
                      </h2>
                      <p>
                        {isNativeDesktopRecording
                          ? "Once the recording is uploaded, final submit unlocks here. If the automatic upload fails, retry it or download a backup copy."
                          : "Upload the recording from your computer or phone, then complete the questionnaire below. Final submit stays locked until the video upload succeeds."}
                      </p>
                    </div>
                  )}

                  {!isNativeDesktopRecording && !uploadedRecording ? (
                    <TextField
                      className="recording-upload-card__field"
                      type="file"
                      label="Screen recording upload"
                      helpText="Accepted: MP4, MOV, or WEBM up to 1 GB."
                      accept={RECORDING_ACCEPT_ATTRIBUTE}
                      onChange={handleRecordingUpload}
                      disabled={isUploadingRecording}
                    />
                  ) : null}

                  {isUploadingRecording && recordingUploadProgress ? (
                    <RecordingStatus
                      status={
                        recordingUploadProgress.state === "retrying"
                          ? "Retrying upload"
                          : "Uploading recording"
                      }
                      description={formatUploadProgress(recordingUploadProgress)}
                      progress={Math.min(100, Math.max(0, recordingUploadProgress.percentage))}
                      tone={recordingUploadProgress.state === "retrying" ? "warning" : "info"}
                    />
                  ) : null}

                  {isNativeDesktopRecording && !uploadedRecording && nativeRecordingBlob ? (
                    <div className="recording-upload-card__actions inline-actions">
                      <Button
                        type="button"
                        loading={isUploadingRecording}
                        loadingLabel="Retrying upload..."
                        onClick={() => {
                          void finalizeNativeRecording(
                            nativeRecordingBlob,
                            nativeRecordingMimeType,
                          );
                        }}
                      >
                        Retry upload
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          downloadRecordingBackup(nativeRecordingBlob, nativeBackupFileName)
                        }
                      >
                        Download backup
                      </Button>
                      <Button type="button" variant="quiet" onClick={resetNativeDesktopFlow}>
                        Start a new recording
                      </Button>
                    </div>
                  ) : null}

                  {shouldShowManualRecoveryUpload ? (
                    <>
                      <TextField
                        className="recording-upload-card__field"
                        type="file"
                        label="Upload a saved backup file"
                        helpText="Use this only if you already saved a local backup recording."
                        accept={RECORDING_ACCEPT_ATTRIBUTE}
                        onChange={handleRecordingUpload}
                        disabled={isUploadingRecording}
                      />
                      <div className="recording-upload-card__actions inline-actions">
                        <Button type="button" variant="secondary" onClick={resetNativeDesktopFlow}>
                          Start a new recording
                        </Button>
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
                        {question.type === "multiple" ? (
                          <fieldset className={styles.choiceFieldset} role="radiogroup">
                            <legend className={styles.questionLegend}>
                              {question.sortOrder}. {question.title}
                            </legend>
                            <div className="radio-list">
                              {(question.options ?? []).map((option) => (
                                <Radio
                                  key={option}
                                  className={styles.choiceOption}
                                  name={question.id}
                                  checked={answers[question.id] === option}
                                  onChange={() => updateAnswer(question.id, option)}
                                  label={option}
                                />
                              ))}
                            </div>
                          </fieldset>
                        ) : (
                          <Textarea
                            label={`${question.sortOrder}. ${question.title}`}
                            rows={5}
                            value={answers[question.id] ?? ""}
                            onChange={(event) => updateAnswer(question.id, event.target.value)}
                            placeholder="Add a thoughtful answer with enough detail to be genuinely useful."
                            helpText={`${answers[question.id]?.trim().length ?? 0} / 40 recommended minimum characters`}
                          />
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : isRecordingTest ? (
                <div className="recording-questionless-note">
                  <strong>No written questionnaire for this test.</strong>
                  <p>
                    Once the recording is ready, you can submit this test from the footer below.
                  </p>
                </div>
              ) : null}

              {message ? (
                <Alert tone={nativeUploadError ? "danger" : "info"}>{message}</Alert>
              ) : null}

              <div className="wizard-actions wizard-actions--sticky test-session__footer">
                {isRecordingTest && !hasQuestions ? (
                  shouldShowBackToTests ? (
                    <Button type="button" variant="secondary" onClick={handleBackToEarn}>
                      {backToTestsLabel}
                    </Button>
                  ) : null
                ) : (
                  <div className="test-session__progress">
                    <strong>{progressLabel}</strong>
                    {isRecordingTest ? <span>{recordingStatusCopy}</span> : null}
                    {draftStatusCopy ? <span>{draftStatusCopy}</span> : null}
                  </div>
                )}
                <div className="inline-actions">
                  {shouldShowBackToTests && !(isRecordingTest && !hasQuestions) ? (
                    <Button type="button" variant="secondary" onClick={handleBackToEarn}>
                      {backToTestsLabel}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    loading={isSubmitting}
                    loadingLabel="Submitting test..."
                    onClick={() => void submit()}
                    disabled={submitDisabled}
                  >
                    Submit test
                  </Button>
                </div>
              </div>
            </>
          ) : message ? (
            <Alert tone="warning">{message}</Alert>
          ) : null}
        </Surface>
      </div>

      <Dialog
        open={isReportModalOpen}
        onOpenChange={(open) => {
          if (!open) closeReportModal();
        }}
        title={hasSubmittedReport ? "Report submitted" : <>Report {submission.productName}</>}
        description={
          hasSubmittedReport
            ? "Thanks for submitting a report. We will investigate it and issue a free credit if the app has a problem."
            : "Tell us what went wrong. We will review the app before asking you to test it."
        }
        footer={
          hasSubmittedReport ? (
            <div className="inline-actions inline-actions--compact">
              <Button type="button" variant="secondary" onClick={closeReportModal}>
                Close
              </Button>
              <Button type="button" onClick={() => navigate("/earn")}>
                Back to Earn
              </Button>
            </div>
          ) : (
            <div className="inline-actions inline-actions--compact">
              <Button
                type="button"
                variant="secondary"
                onClick={closeReportModal}
                disabled={isSubmittingReport}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void submitReport()}
                loading={isSubmittingReport}
                loadingLabel="Sending report..."
              >
                Submit report
              </Button>
            </div>
          )
        }
      >
        {hasSubmittedReport ? (
          <Alert tone="success" title="Your report is with the review team">
            <span className={styles.reportSuccess}>
              <CheckCircle2 size={20} aria-hidden="true" />
              You can return to the Earn page while we investigate.
            </span>
          </Alert>
        ) : (
          <Stack gap="md">
            <fieldset className={styles.choiceFieldset} role="radiogroup">
              <legend className={styles.questionLegend}>Report reason</legend>
              <div className="test-report-modal__reasons">
                {reportReasons.map((reason) => (
                  <Radio
                    key={reason.value}
                    className={styles.choiceOption}
                    name="test-report-reason"
                    checked={reportReason === reason.value}
                    onChange={() => {
                      setReportReason(reason.value);
                      setReportError("");
                    }}
                    label={reason.label}
                  />
                ))}
              </div>
            </fieldset>

            {reportReason === "other" ? (
              <Textarea
                label="What happened?"
                rows={4}
                maxLength={REPORT_MESSAGE_LIMIT}
                value={reportMessage}
                onChange={(event) => {
                  setReportMessage(event.target.value);
                  setReportError("");
                }}
                placeholder="Share the issue so support knows what to review."
                helpText={reportMessage.length + " / " + REPORT_MESSAGE_LIMIT + " characters"}
                autoFocus
              />
            ) : null}

            {reportError ? <Alert tone="danger">{reportError}</Alert> : null}
          </Stack>
        )}
      </Dialog>
    </AppShell>
  );
}
