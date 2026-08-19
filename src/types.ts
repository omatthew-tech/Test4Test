export type ProductType = "website" | "ios" | "android";
export type AccessLinkKind = ProductType | "figma" | "other";
export type AccountType = "pending" | "founder" | "tester";
export type TechnologyProficiency = "not_at_all" | "slightly" | "moderately" | "very" | "extremely";
export type TesterDevice = "computer" | "ios" | "android";
export type EmploymentStatus =
  "full_time" | "part_time" | "self_employed" | "student" | "retired" | "not_employed";
export type WorkArea =
  | "sales"
  | "marketing"
  | "software_development"
  | "it"
  | "design_ux"
  | "product_management"
  | "finance_accounting"
  | "human_resources"
  | "operations"
  | "healthcare"
  | "education"
  | "customer_support"
  | "other";
export type OtpIntent = "sign_in" | "founder_signup" | "tester_signup";
export type TestRewardType = "credit" | "paid";

export interface TesterProfileDraft {
  firstName: string;
  countryCode: string;
  region: string;
  technologyProficiency: TechnologyProficiency | "";
  devices: TesterDevice[];
  employmentStatus: EmploymentStatus | "";
  workArea: WorkArea | "";
  paidTestEmailEnabled: boolean;
}

export interface TesterProfile extends Omit<
  TesterProfileDraft,
  "technologyProficiency" | "employmentStatus" | "workArea"
> {
  userId: string;
  technologyProficiency: TechnologyProficiency;
  employmentStatus: EmploymentStatus;
  workArea: WorkArea | "";
  createdAt: string;
  updatedAt: string;
}

export interface OtherAccessLink {
  label: string;
  url: string;
}

export interface AccessLinks {
  website?: string;
  ios?: string;
  android?: string;
  figma?: string;
  other?: OtherAccessLink;
}
export type QuestionMode = "general" | "ai" | "custom";
export type QuestionType = "multiple" | "paragraph";
export type SubmissionStatus = "draft" | "pending_verification" | "live" | "paused" | "flagged";
export type ResponseStatus = "approved" | "flagged" | "rejected";
export type FeedbackRatingValue = "smiley" | "neutral" | "frowny";
export type FeedbackReportStatus = "pending" | "resolved" | "dismissed";
export type TestReportReason =
  "app_unavailable" | "requires_payment" | "suspicious_malware" | "other";
export type TestReportStatus = "pending" | "dismissed" | "confirmed";
export type CreditTransactionType = "starter_credit" | "earned_test" | "adjustment" | "revocation";
export type NotificationType = "otp" | "new_feedback" | "system";
export type ModerationActionType = "flag" | "reject" | "revoke_credit" | "warn" | "suspend" | "ban";
export type GooglePlayClosedTestParticipationStatus =
  "active" | "completed" | "missed" | "cancelled";

export interface PaymentMethods {
  paypalHandle?: string | null;
  venmoHandle?: string | null;
  cashAppHandle?: string | null;
}

export interface User extends PaymentMethods {
  id: string;
  email: string;
  displayName: string;
  accountType: AccountType;
  testerProfile?: TesterProfile | null;
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
  thumbnail?: RecordingThumbnailMetadata | null;
}

export type RecordingThumbnailStatus = "pending" | "queued" | "processing" | "ready" | "failed";

export interface RecordingThumbnailMetadata {
  bucket: string | null;
  path: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  status: RecordingThumbnailStatus | null;
  attemptCount: number | null;
  lastAttemptAt: string | null;
  error: string | null;
  timestampMs: number | null;
  durationMs: number | null;
  generationVersion: string | null;
}

export interface RecordingPreviewSummary {
  responseId: string;
  submissionId: string;
  productName: string;
  submittedAt: string;
  durationSeconds: number;
  thumbnailStatus: "pending" | "ready" | "failed";
  thumbnailError: string | null;
  thumbnail: (RecordingThumbnailMetadata & { url: string }) | null;
}

export interface Submission {
  id: string;
  userId: string | null;
  productName: string;
  productTypes: ProductType[];
  description: string;
  targetAudience: string;
  instructions: string;
  instructionSteps: string[];
  googlePlayClosedTestInstructions: string;
  accessLinks: AccessLinks;
  requiresRecording: boolean;
  needsGooglePlayClosedTesters: boolean;
  publicShareSlug?: string | null;
  publicShareMessage?: string | null;
  status: SubmissionStatus;
  questionMode: QuestionMode;
  isOpenForMoreTests: boolean;
  rewardType: TestRewardType;
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

export interface TesterEarnAccessSummary {
  completedCreditTests: number;
  fiveStarRatings: number;
  paidAccessUnlocked: boolean;
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
  starRating: number | null;
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
  intent: OtpIntent;
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
  instructionSteps: string[];
  googlePlayClosedTestInstructions: string;
  accessLinks: AccessLinks;
  requiresRecording: boolean;
  needsGooglePlayClosedTesters: boolean;
  questionMode: QuestionMode;
}
