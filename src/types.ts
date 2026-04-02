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

export interface User {
  id: string;
  email: string;
  displayName: string;
  status: "active" | "warned";
  createdAt: string;
  banStatus: "clear" | "suspended" | "banned";
}

export interface Question {
  id: string;
  title: string;
  type: QuestionType;
  required: boolean;
  sortOrder: number;
  options?: string[];
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

export interface Submission {
  id: string;
  userId: string | null;
  productName: string;
  productTypes: ProductType[];
  description: string;
  targetAudience: string;
  instructions: string;
  accessLinks: AccessLinks;
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
  testerUserId: string;
  questionSetVersionId: string;
  anonymousLabel: string;
  status: ResponseStatus;
  qualityScore: number;
  creditAwarded: boolean;
  submittedAt: string;
  durationSeconds: number;
  answers: TestAnswer[];
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
  questionSetVersions: QuestionSetVersion[];
  responses: TestResponse[];
  feedbackRatings: FeedbackRating[];
  creditTransactions: CreditTransaction[];
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
  accessLinks: AccessLinks;
  questionMode: QuestionMode;
}