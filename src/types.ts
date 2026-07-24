export type ProductType = "website" | "ios" | "android";
export type AccessLinks = Partial<Record<ProductType, string>>;
export type QuestionMode = "general" | "ai" | "custom";
export type QuestionType = "multiple" | "paragraph";
export type SubmissionStatus =
  | "draft"
  | "pending_verification"
  | "live"
  | "paused"
  | "flagged";
export type ResponseStatus = "approved" | "flagged" | "rejected";
export type FeedbackRatingValue = "smiley" | "neutral" | "frowny";
export type FeedbackReportStatus = "pending" | "resolved" | "dismissed";
export type TestReportReason =
  | "app_unavailable"
  | "requires_payment"
  | "suspicious_malware"
  | "other";
export type TestReportStatus = "pending" | "dismissed" | "confirmed";
export type CreditTransactionType =
  | "starter_credit"
  | "earned_test"
  | "adjustment"
  | "revocation";
export type NotificationType = "otp" | "new_feedback" | "system";
export type ModerationActionType =
  | "flag"
  | "reject"
  | "revoke_credit"
  | "warn"
  | "suspend"
  | "ban";
export type GooglePlayClosedTestParticipationStatus =
  | "active"
  | "completed"
  | "missed"
  | "cancelled";

export interface PaymentMethods {
  paypalHandle?: string | null;
  venmoHandle?: string | null;
  cashAppHandle?: string | null;
}

export interface User extends PaymentMethods {
  id: string;
  email: string;
  displayName: string;
  status: "active" | "warned";
  createdAt: string;
  banStatus: "clear" | "banned";
  bannedAt?: string | null;
}

export interface Question {
  id: string;
  title: string;
  type: QuestionType;
  required: boolean;
  sortOrder: number;
  options?: string[];
}

export interface SubmissionVersion {
  id: string;
  submissionId: string;
  versionNumber: number;
  title: string;
  description: string | null;
  createdAt: string;
  isActive: boolean;
}

export interface QuestionSetVersion {
  id: string;
  submissionId: string;
  versionNumber: number;
  createdAt: string;
  isActive: boolean;
  mode: QuestionMode;
  questions: Question[];
}

export interface ResponseRecording {
  bucket: string;
  path: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedAt: string;
  expiresAt: string;
  deletedAt?: string | null;
  thumbnail?: {
    bucket: string;
    path: string;
    contentType: string;
    sizeBytes: number;
    width: number;
    height: number;
  } | null;
}

export interface Submission {
  id: string;
  userId: string | null;
  productName: string;
  productTypes: ProductType[];
  description: string;
  targetAudience: string;
  instructions: string;
  googlePlayClosedTestInstructions: string;
  accessLinks: AccessLinks;
  requiresRecording: boolean;
  needsGooglePlayClosedTesters: boolean;
  publicShareSlug?: string | null;
  publicShareMessage?: string | null;
  status: SubmissionStatus;
  questionMode: QuestionMode;
  isOpenForMoreTests: boolean;
  promoted: boolean;
  createdAt: string;
  estimatedMinutes: number;
  responseCount: number;
  lastResponseAt?: string | null;
  tags: string[];
}

export interface EarnSubmissionReputation {
  submissionId: string;
  ownerHasTestedYou: boolean;
  ownerHasCompletedTest: boolean;
  ownerCreditBalance: number;
  ownerTestBackRatePercent: number;
  ownerSatisfactionRatePercent: number;
  ownerAvatarUrl?: string | null;
}

export interface EarnSubmissionCard {
  submission: Submission;
  reputation: EarnSubmissionReputation | null;
}

export interface EarnVisibilitySummary {
  submissionId: string | null;
  productName: string | null;
  hasCompletedTest: boolean;
  rank: number | null;
  rankedSubmissionCount: number;
  wouldRank: number | null;
  wouldRankedSubmissionCount: number;
  testBackRatePercent: number;
  satisfactionRatePercent: number;
  tokenBalance: number;
}

export interface SubmissionReportStatus {
  submissionId: string;
  status: TestReportStatus;
}

export interface AdminTestReport {
  id: string;
  submissionId: string;
  reporterUserId: string;
  reporterEmail: string;
  reporterDisplayName: string;
  founderUserId: string;
  founderEmail: string;
  founderDisplayName: string;
  appName: string;
  appDescription: string;
  appStatus: SubmissionStatus;
  needsGooglePlayClosedTesters: boolean;
  googlePlayClosedTestInstructions: string;
  reason: TestReportReason;
  reasonLabel: string;
  message: string;
  status: TestReportStatus;
  supportNotifiedAt: string | null;
  decisionNote: string;
  decidedByEmail: string | null;
  decidedAt: string | null;
  creditedTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
  accessLinks: Array<{ productType: string; url: string }>;
}

export interface AdminReviewSubmission {
  submissionId: string;
  appName: string;
  founderEmail: string;
  founderDisplayName: string;
  latestReportId: string;
  reasonLabel: string;
  updatedAt: string;
}

export interface SubmittedFeedbackCard {
  responseId: string;
  submissionId: string;
  productName: string;
  productTypes: ProductType[];
  description: string;
  needsGooglePlayClosedTesters: boolean;
  submittedAt: string;
  ratingValue: FeedbackRatingValue | null;
  ownerTestBackRatePercent: number;
  ownerSatisfactionRatePercent: number;
  ownerAvatarUrl?: string | null;
  submissionStatus: SubmissionStatus;
  reportStatus: FeedbackReportStatus | null;
}

export interface TestAnswer {
  questionId: string;
  questionTitle: string;
  type: QuestionType;
  selectedOption?: string;
  textAnswer?: string;
}

export interface TestResponse {
  id: string;
  submissionId: string;
  submissionVersionId: string;
  testerUserId: string | null;
  publicTesterKey?: string | null;
  questionSetVersionId: string;
  anonymousLabel: string;
  status: ResponseStatus;
  qualityScore: number;
  creditAwarded: boolean;
  submittedAt: string;
  durationSeconds: number;
  answers: TestAnswer[];
  recording: ResponseRecording | null;
  internalFlags: string[];
}

export interface FeedbackRating {
  id: string;
  testResponseId: string;
  ratedByUserId: string;
  ratingValue: FeedbackRatingValue;
  createdAt: string;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  type: CreditTransactionType;
  amount: number;
  reason: string;
  relatedTestResponseId?: string;
  createdAt: string;
}

export interface GooglePlayClosedTestParticipation {
  id: string;
  submissionId: string;
  testerUserId: string;
  founderUserId: string;
  attemptNumber: number;
  startedOn: string;
  status: GooglePlayClosedTestParticipationStatus;
  requiredDays: number;
  completedAt?: string | null;
  missedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GooglePlayClosedTestCheckIn {
  id: string;
  participationId: string;
  checkInDate: string;
  createdAt: string;
}

export interface EmailNotificationLog {
  id: string;
  userId: string;
  submissionId?: string;
  notificationType: NotificationType;
  deliveredAt: string;
  status: "queued" | "delivered";
  subject: string;
}

export interface OTPChallenge {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  resendCount: number;
  submissionId?: string;
}

export interface ModerationAction {
  id: string;
  responseId: string;
  userId: string;
  action: ModerationActionType;
  createdAt: string;
  notes: string;
}

export interface AppState {
  currentUserId: string | null;
  users: User[];
  submissions: Submission[];
  submissionVersions: SubmissionVersion[];
  questionSetVersions: QuestionSetVersion[];
  responses: TestResponse[];
  feedbackRatings: FeedbackRating[];
  creditTransactions: CreditTransaction[];
  googlePlayClosedTestParticipations: GooglePlayClosedTestParticipation[];
  googlePlayClosedTestCheckIns: GooglePlayClosedTestCheckIn[];
  emailLogs: EmailNotificationLog[];
  moderationActions: ModerationAction[];
  otpChallenge: OTPChallenge | null;
}

export interface SubmissionDraft {
  productName: string;
  productTypes: ProductType[];
  description: string;
  targetAudience: string;
  instructions: string;
  googlePlayClosedTestInstructions: string;
  accessLinks: AccessLinks;
  requiresRecording: boolean;
  needsGooglePlayClosedTesters: boolean;
  questionMode: QuestionMode;
}

export type UsabilityReportStatus = "pending" | "processing" | "completed" | "failed";

export interface UsabilityReportPreviewFrame {
  id: string;
  testResponseId: string;
  source: "thumbnail" | "worker";
  url: string;
  width?: number | null;
  height?: number | null;
  timestampMs?: number | null;
  frameIndex?: number | null;
}

export interface UsabilityReport {
  id: string;
  submissionId: string;
  submissionProductName: string;
  reportNumber: number;
  reportName: string;
  status: UsabilityReportStatus;
  errorMessage?: string | null;
  sourceResponseCount: number;
  frameCount: number;
  createdAt: string;
  completedAt?: string | null;
}

export interface UsabilityReportFrame {
  id: string;
  reportId: string;
  testResponseId: string;
  testerLabel?: string | null;
  frameIndex: number;
  /** Exact offset of this screenshot within the source recording, in milliseconds. */
  timestampMs: number;
  /**
   * Optional explicit display window for this screenshot, in milliseconds.
   * When omitted, the window is derived as [timestampMs, next frame's timestampMs)
   * for the same recording (see lib/quoteMatching).
   */
  startMs?: number | null;
  endMs?: number | null;
  /** Short-lived signed URL for the screenshot image. */
  url: string;
  width?: number | null;
  height?: number | null;
}

/**
 * A verbatim tester quote captured at an exact moment in a recording, linked to
 * the screenshot that was on screen at that time. Used on both the summary view
 * (all testers) and individual response pages.
 */
export interface UsabilityReportQuote {
  id: string;
  reportId: string;
  /** The recording / tester this quote came from. */
  testResponseId: string;
  testerLabel?: string | null;
  /** Exact offset of the quote within the source recording, in milliseconds. */
  timestampMs: number;
  /** Segment start/end offsets in milliseconds when sourced from transcription. */
  startMs?: number | null;
  endMs?: number | null;
  /** The verbatim quote text. */
  text: string;
  /** Optional speaker/source label (e.g. "Tester", "Moderator"). */
  speaker?: string | null;
  /** Source transcript segment id, when this quote was generated from speech-to-text. */
  transcriptSegmentId?: string | null;
  /** Future-ready flag for excluding quotes from AI summaries. */
  includeInSummary?: boolean;
  /** Linked screenshot id (usability_report_frames.id). Null if no frame matched. */
  linkedFrameId?: string | null;
  /** Convenience: short-lived signed URL for the linked screenshot. */
  linkedFrameUrl?: string | null;
}

export type UsabilityReportQuoteAnalysisStatus = "pending" | "processing" | "completed" | "failed";

export interface UsabilityReportQuoteAnalysisEvidence {
  quoteId: string;
  testResponseId: string;
  testerLabel: string;
  timestampMs: number;
  linkedFrameId: string | null;
  quote: string;
}

export interface UsabilityReportPageInsight {
  frameId: string;
  usefulForUsabilityTesting: boolean;
  suggestion: string | null;
}

export interface UsabilityReportQuoteAnalysisFinding {
  title: string;
  category:
    | "navigation"
    | "visual_design"
    | "content"
    | "functionality"
    | "performance"
    | "accessibility"
    | "data_clarity"
    | "other";
  severity: "low" | "medium" | "high";
  frequency: "one_off" | "repeated";
  quoteCount: number;
  recordingCount: number;
  description: string;
  evidence: UsabilityReportQuoteAnalysisEvidence[];
  affectedArea: string;
  recommendation: string;
}

export interface UsabilityReportQuoteAnalysisResult {
  summary: string;
  pageInsights: UsabilityReportPageInsight[];
  findings: UsabilityReportQuoteAnalysisFinding[];
  positiveFeedback: Array<{
    summary: string;
    quoteCount: number;
    recordingCount: number;
    evidence: UsabilityReportQuoteAnalysisEvidence[];
  }>;
  unclearFeedback: Array<{
    quoteId: string;
    testResponseId: string;
    testerLabel: string;
    timestampMs: number;
    linkedFrameId: string | null;
    quote: string;
    reason: string;
  }>;
}

export interface UsabilityReportQuoteAnalysis {
  id: string;
  reportId: string;
  status: UsabilityReportQuoteAnalysisStatus;
  model: string;
  promptVersion: string;
  inputHash: string;
  quoteCount: number;
  analysis: UsabilityReportQuoteAnalysisResult | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsabilityReportDetail extends UsabilityReport {
  frames: UsabilityReportFrame[];
  quotes?: UsabilityReportQuote[];
  quoteAnalysis?: UsabilityReportQuoteAnalysis | null;
}


