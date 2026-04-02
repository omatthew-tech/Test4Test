import {
  AppState,
  FeedbackRatingValue,
  Question,
  QuestionSetVersion,
  Submission,
  TestResponse,
  User,
} from "../types";
import { clamp } from "./format";

const stopWords = new Set([
  "about",
  "after",
  "again",
  "almost",
  "also",
  "because",
  "could",
  "didn't",
  "does",
  "felt",
  "from",
  "have",
  "just",
  "made",
  "more",
  "most",
  "really",
  "still",
  "that",
  "their",
  "there",
  "these",
  "thing",
  "this",
  "very",
  "with",
  "would",
]);

export function getCurrentUser(state: AppState) {
  return state.users.find((user) => user.id === state.currentUserId) ?? null;
}

export function getUserById(state: AppState, userId: string | null) {
  return state.users.find((user) => user.id === userId) ?? null;
}

export function getCreditBalance(state: AppState, userId: string | null) {
  if (!userId) {
    return 0;
  }

  return state.creditTransactions
    .filter((transaction) => transaction.userId === userId)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function getActiveQuestionSet(
  state: AppState,
  submissionId: string,
): QuestionSetVersion | null {
  return (
    state.questionSetVersions.find(
      (version) => version.submissionId === submissionId && version.isActive,
    ) ?? null
  );
}

export function getSubmissionResponses(state: AppState, submissionId: string) {
  return state.responses
    .filter((response) => response.submissionId === submissionId)
    .sort(
      (first, second) =>
        new Date(second.submittedAt).getTime() -
        new Date(first.submittedAt).getTime(),
    );
}

export function getResponseRating(
  state: AppState,
  responseId: string,
  userId: string | null,
) {
  return (
    state.feedbackRatings.find(
      (rating) =>
        rating.testResponseId === responseId && rating.ratedByUserId === userId,
    ) ?? null
  );
}

export function getMySubmissions(state: AppState) {
  return state.submissions
    .filter((submission) => submission.userId === state.currentUserId)
    .sort(
      (first, second) =>
        new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
    );
}

export function getAvailableSubmissions(state: AppState) {
  return state.submissions
    .filter((submission) => {
      if (submission.status !== "live") {
        return false;
      }

      if (submission.userId === state.currentUserId) {
        return false;
      }

      const completedByUser = state.responses.some(
        (response) =>
          response.submissionId === submission.id &&
          response.testerUserId === state.currentUserId,
      );

      return !completedByUser;
    })
    .sort((first, second) => {
      if (first.promoted !== second.promoted) {
        return first.promoted ? -1 : 1;
      }

      if (first.responseCount !== second.responseCount) {
        return first.responseCount - second.responseCount;
      }

      return (
        new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()
      );
    });
}

export function buildQuestionAnalytics(
  questions: Question[],
  responses: TestResponse[],
) {
  return questions.map((question) => {
    const answers = responses
      .map((response) =>
        response.answers.find((answer) => answer.questionId === question.id),
      )
      .filter(Boolean);

    if (question.type === "paragraph") {
      const texts = answers
        .map((answer) => answer?.textAnswer?.trim())
        .filter((value): value is string => Boolean(value));

      return {
        question,
        type: "paragraph" as const,
        responses: texts,
      };
    }

    const options = question.options ?? [];
    const counts = options.map((option) => ({
      option,
      count: answers.filter((answer) => answer?.selectedOption === option).length,
    }));

    const total = Math.max(1, answers.length);
    const sorted = [...counts].sort((first, second) => second.count - first.count);
    const optionIndexSum = answers.reduce((sum, answer) => {
      const index = options.indexOf(answer?.selectedOption ?? "");
      return sum + Math.max(index, 0);
    }, 0);

    return {
      question,
      type: "multiple" as const,
      counts,
      total,
      topChoice: sorted[0]?.option ?? "No responses yet",
      averageScore: clamp((optionIndexSum / total) + 1, 1, options.length || 1),
    };
  });
}

function extractThemes(texts: string[]) {
  const counts = new Map<string, number>();

  texts.forEach((text) => {
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word))
      .forEach((word) => {
        counts.set(word, (counts.get(word) ?? 0) + 1);
      });
  });

  return [...counts.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 3)
    .map(([word]) => word);
}

export function buildSubmissionSummary(
  state: AppState,
  submission: Submission,
  responses: TestResponse[],
) {
  const activeVersion = getActiveQuestionSet(state, submission.id);
  const questions = activeVersion?.questions ?? [];
  const analytics = buildQuestionAnalytics(questions, responses);
  const paragraphGroups = analytics.filter((item) => item.type === "paragraph");
  const positiveTexts = paragraphGroups
    .filter((group) =>
      /effective|clear|polished|stand/i.test(group.question.title),
    )
    .flatMap((group) => group.responses);
  const frictionTexts = paragraphGroups
    .filter((group) =>
      /confusing|improve|hesitate|friction|slow/i.test(group.question.title),
    )
    .flatMap((group) => group.responses);
  const allParagraphs = paragraphGroups.flatMap((group) => group.responses);

  const ratings = responses
    .map((response) =>
      state.feedbackRatings.find((rating) => rating.testResponseId === response.id),
    )
    .filter(Boolean)
    .map((rating) => rating?.ratingValue as FeedbackRatingValue);

  return {
    analytics,
    topPositiveThemes: extractThemes(positiveTexts.length ? positiveTexts : allParagraphs),
    topFrictionThemes: extractThemes(frictionTexts.length ? frictionTexts : allParagraphs),
    priorityImprovement:
      extractThemes(frictionTexts)[0] ??
      "clarity",
    ratings: {
      smiley: ratings.filter((value) => value === "smiley").length,
      neutral: ratings.filter((value) => value === "neutral").length,
      frowny: ratings.filter((value) => value === "frowny").length,
    },
  };
}

export function getModerationQueue(state: AppState) {
  return state.responses
    .filter(
      (response) =>
        response.status !== "approved" ||
        response.internalFlags.length > 0 ||
        response.qualityScore < 55,
    )
    .sort((first, second) => first.qualityScore - second.qualityScore);
}

export function buildAnonymousLabel(
  state: AppState,
  submissionId: string,
  testerUser: User,
) {
  const index =
    state.responses.filter((response) => response.submissionId === submissionId)
      .length + 1;

  return `${testerUser.displayName.split(" ")[0]} ${index}`;
}
