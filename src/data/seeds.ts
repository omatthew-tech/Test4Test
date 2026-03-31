import {
  AppState,
  FeedbackRating,
  Question,
  QuestionSetVersion,
  Submission,
  TestResponse,
  User,
} from "../types";
import {
  buildAiQuestions,
  buildGeneralQuestions,
  defaultCustomQuestions,
  estimateMinutes,
} from "../lib/questions";

function withIds(questions: Question[], prefix: string) {
  return questions.map((question, index) => ({
    ...question,
    id: `${prefix}-q-${index + 1}`,
  }));
}

const users: User[] = [
  {
    id: "user-avery",
    email: "avery@demo.test4test.app",
    displayName: "Avery Lane",
    status: "active",
    createdAt: "2026-03-09T09:20:00.000Z",
    banStatus: "clear",
  },
  {
    id: "user-mateo",
    email: "mateo@demo.test4test.app",
    displayName: "Mateo Cruz",
    status: "active",
    createdAt: "2026-03-10T12:00:00.000Z",
    banStatus: "clear",
  },
  {
    id: "user-jo",
    email: "jo@demo.test4test.app",
    displayName: "Jo Kim",
    status: "active",
    createdAt: "2026-03-12T15:30:00.000Z",
    banStatus: "clear",
  },
  {
    id: "user-nina",
    email: "nina@demo.test4test.app",
    displayName: "Nina Shah",
    status: "active",
    createdAt: "2026-03-13T18:10:00.000Z",
    banStatus: "clear",
  },
  {
    id: "user-theo",
    email: "theo@demo.test4test.app",
    displayName: "Theo Park",
    status: "warned",
    createdAt: "2026-03-15T11:05:00.000Z",
    banStatus: "clear",
  },
];

const sproutQuestions = withIds(buildGeneralQuestions("Sprout Habit"), "sprout");
const paletteQuestions = withIds(
  buildAiQuestions({
    productName: "Palette Pilot",
    productTypes: ["website"],
    description: "A collaborative moodboard and creative direction tool for freelance designers.",
    targetAudience: "freelance designers and small studios",
    instructions: "Create a sample moodboard and invite a collaborator.",
    accessLinks: {
      website: "https://palettepilot.app",
    },
    questionMode: "ai",
  }),
  "palette",
);
const pantryQuestions = withIds(defaultCustomQuestions("Pocket Pantry"), "pantry");
const trailQuestions = withIds(buildGeneralQuestions("TrailMixer"), "trail");

const submissions: Submission[] = [
  {
    id: "submission-sprout",
    userId: "user-avery",
    productName: "Sprout Habit",
    productTypes: ["ios"],
    description: "A habit-tracking app focused on gentle accountability and daily routines.",
    targetAudience: "people building healthier daily habits",
    instructions: "Try adding a habit and reviewing the weekly summary.",
    accessLinks: {
      ios: "https://testflight.apple.com/join/sprouthabit",
    },
    status: "live",
    questionMode: "general",
    isOpenForMoreTests: true,
    createdAt: "2026-03-18T14:00:00.000Z",
    estimatedMinutes: estimateMinutes(sproutQuestions),
    responseCount: 0,
    lastResponseAt: null,
    tags: ["Wellness", "iOS", "Routine"],
  },
  {
    id: "submission-palette",
    userId: "user-mateo",
    productName: "Palette Pilot",
    productTypes: ["website"],
    description: "A collaborative moodboard and creative direction workspace for design teams.",
    targetAudience: "freelance designers and small studios",
    instructions: "Create a board and inspect how easy it is to add references.",
    accessLinks: {
      website: "https://palettepilot.app",
    },
    status: "live",
    questionMode: "ai",
    isOpenForMoreTests: true,
    createdAt: "2026-03-22T17:15:00.000Z",
    estimatedMinutes: estimateMinutes(paletteQuestions),
    responseCount: 1,
    lastResponseAt: "2026-03-25T13:20:00.000Z",
    tags: ["Design", "Collaboration", "Web app"],
  },
  {
    id: "submission-pantry",
    userId: "user-jo",
    productName: "Pocket Pantry",
    productTypes: ["website"],
    description: "A meal planning tool that helps users turn pantry items into realistic weekly dinners.",
    targetAudience: "busy households that want low-friction meal planning",
    instructions: "Search for a pantry-based recipe and save it to the week plan.",
    accessLinks: {
      website: "https://pocketpantry.app",
    },
    status: "live",
    questionMode: "custom",
    isOpenForMoreTests: true,
    createdAt: "2026-03-24T10:30:00.000Z",
    estimatedMinutes: estimateMinutes(pantryQuestions),
    responseCount: 1,
    lastResponseAt: "2026-03-25T16:05:00.000Z",
    tags: ["Food", "Planning", "Household"],
  },
  {
    id: "submission-trail",
    userId: "user-nina",
    productName: "TrailMixer",
    productTypes: ["ios", "android"],
    description: "A trip-planning companion for stitching outdoor routes, packing lists, and weather together.",
    targetAudience: "casual hikers planning day trips",
    instructions: "Plan a route and check what would help you trust the trip details.",
    accessLinks: {
      ios: "https://apps.apple.com/app/trailmixer/id1234567890",
      android: "https://play.google.com/store/apps/details?id=app.trailmixer",
    },
    status: "live",
    questionMode: "general",
    isOpenForMoreTests: true,
    createdAt: "2026-03-25T08:45:00.000Z",
    estimatedMinutes: estimateMinutes(trailQuestions),
    responseCount: 1,
    lastResponseAt: "2026-03-25T18:10:00.000Z",
    tags: ["Travel", "Outdoor", "iOS", "Android"],
  },
];

const questionSetVersions: QuestionSetVersion[] = [
  {
    id: "qsv-sprout-1",
    submissionId: "submission-sprout",
    versionNumber: 1,
    createdAt: "2026-03-18T14:00:00.000Z",
    isActive: true,
    mode: "general",
    questions: sproutQuestions,
  },
  {
    id: "qsv-palette-1",
    submissionId: "submission-palette",
    versionNumber: 1,
    createdAt: "2026-03-22T17:15:00.000Z",
    isActive: true,
    mode: "ai",
    questions: paletteQuestions,
  },
  {
    id: "qsv-pantry-1",
    submissionId: "submission-pantry",
    versionNumber: 1,
    createdAt: "2026-03-24T10:30:00.000Z",
    isActive: true,
    mode: "custom",
    questions: pantryQuestions,
  },
  {
    id: "qsv-trail-1",
    submissionId: "submission-trail",
    versionNumber: 1,
    createdAt: "2026-03-25T08:45:00.000Z",
    isActive: true,
    mode: "general",
    questions: trailQuestions,
  },
];

function answerMultiple(question: Question, optionIndex: number) {
  return {
    questionId: question.id,
    questionTitle: question.title,
    type: question.type,
    selectedOption: question.options?.[optionIndex] ?? question.options?.[0],
  };
}

function answerParagraph(question: Question, textAnswer: string) {
  return {
    questionId: question.id,
    questionTitle: question.title,
    type: question.type,
    textAnswer,
  };
}

const responses: TestResponse[] = [
  {
    id: "response-palette-1",
    submissionId: "submission-palette",
    testerUserId: "user-avery",
    questionSetVersionId: "qsv-palette-1",
    anonymousLabel: "Tester 4",
    status: "approved",
    qualityScore: 88,
    creditAwarded: true,
    submittedAt: "2026-03-25T13:20:00.000Z",
    durationSeconds: 372,
    internalFlags: [],
    answers: [
      answerMultiple(paletteQuestions[0], 2),
      answerMultiple(paletteQuestions[1], 3),
      answerMultiple(paletteQuestions[2], 3),
      answerParagraph(
        paletteQuestions[3],
        "The first place I slowed down was when deciding whether the moodboard itself or the project overview card was the real starting point. The labels were close, but the hierarchy between them could be stronger.",
      ),
      answerParagraph(
        paletteQuestions[4],
        "I would make the collaboration state more explicit. Showing who has already joined and what happens after sending the invite would make the workspace feel immediately more trustworthy.",
      ),
    ],
  },
  {
    id: "response-pantry-1",
    submissionId: "submission-pantry",
    testerUserId: "user-nina",
    questionSetVersionId: "qsv-pantry-1",
    anonymousLabel: "Tester 2",
    status: "approved",
    qualityScore: 92,
    creditAwarded: true,
    submittedAt: "2026-03-25T16:05:00.000Z",
    durationSeconds: 410,
    internalFlags: [],
    answers: [
      answerMultiple(pantryQuestions[0], 2),
      answerMultiple(pantryQuestions[1], 3),
      answerMultiple(pantryQuestions[2], 2),
      answerParagraph(
        pantryQuestions[3],
        "The best part was the pantry-to-meal suggestion area. It felt focused and useful without asking me for too much before showing value.",
      ),
      answerParagraph(
        pantryQuestions[4],
        "I would improve the recipe-save action first. It works, but it is easy to miss compared with the ingredient filters and the meal preview cards.",
      ),
    ],
  },
  {
    id: "response-trail-1",
    submissionId: "submission-trail",
    testerUserId: "user-theo",
    questionSetVersionId: "qsv-trail-1",
    anonymousLabel: "Tester 1",
    status: "flagged",
    qualityScore: 34,
    creditAwarded: false,
    submittedAt: "2026-03-25T18:10:00.000Z",
    durationSeconds: 94,
    internalFlags: ["Very short answers", "Likely rushed completion"],
    answers: [
      answerMultiple(trailQuestions[0], 1),
      answerMultiple(trailQuestions[1], 1),
      answerMultiple(trailQuestions[2], 1),
      answerMultiple(trailQuestions[3], 1),
      answerMultiple(trailQuestions[4], 1),
    ],
  },
];

const feedbackRatings: FeedbackRating[] = [
  {
    id: "rating-palette-1",
    testResponseId: "response-palette-1",
    ratedByUserId: "user-mateo",
    ratingValue: "smiley",
    createdAt: "2026-03-25T15:10:00.000Z",
    updatedAt: "2026-03-25T15:10:00.000Z",
  },
];

export const seededState: AppState = {
  currentUserId: null,
  users,
  submissions,
  questionSetVersions,
  responses,
  feedbackRatings,
  creditTransactions: [
    {
      id: "tx-avery-1",
      userId: "user-avery",
      type: "earned_test",
      amount: 1,
      reason: "Completed a usability test",
      relatedTestResponseId: "response-palette-1",
      createdAt: "2026-03-25T13:20:00.000Z",
    },
    {
      id: "tx-nina-1",
      userId: "user-nina",
      type: "earned_test",
      amount: 1,
      reason: "Completed a usability test",
      relatedTestResponseId: "response-pantry-1",
      createdAt: "2026-03-25T16:05:00.000Z",
    },
  ],
  emailLogs: [
    {
      id: "email-palette-1",
      userId: "user-mateo",
      submissionId: "submission-palette",
      notificationType: "new_feedback",
      deliveredAt: "2026-03-25T13:23:00.000Z",
      status: "delivered",
      subject: "New feedback is ready for Palette Pilot",
    },
  ],
  moderationActions: [
    {
      id: "moderation-trail-1",
      responseId: "response-trail-1",
      userId: "user-theo",
      action: "flag",
      createdAt: "2026-03-25T18:15:00.000Z",
      notes: "Auto-flagged for short open-text answers and low completion time.",
    },
  ],
  otpChallenge: null,
};