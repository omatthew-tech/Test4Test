import {
  AppState,
  QuestionSetVersion,
  ResponseRecording,
  Submission,
  SubmissionVersion,
  TestResponse,
  User,
} from "../types";

function sortResponsesDescending(first: TestResponse, second: TestResponse) {
  return new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime();
}

function sortQuestionSetVersionsDescending(first: QuestionSetVersion, second: QuestionSetVersion) {
  if (first.versionNumber !== second.versionNumber) {
    return second.versionNumber - first.versionNumber;
  }

  return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
}

function sortSubmissionVersionsDescending(first: SubmissionVersion, second: SubmissionVersion) {
  if (first.versionNumber !== second.versionNumber) {
    return second.versionNumber - first.versionNumber;
  }

  return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
}

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

export function getSubmissionVersions(state: AppState, submissionId: string) {
  return state.submissionVersions
    .filter((version) => version.submissionId === submissionId)
    .sort(sortSubmissionVersionsDescending);
}

export function getActiveSubmissionVersion(
  state: AppState,
  submissionId: string,
): SubmissionVersion | null {
  const versions = getSubmissionVersions(state, submissionId);

  return versions.find((version) => version.isActive) ?? versions[0] ?? null;
}

export function getSubmissionQuestionSetVersions(state: AppState, submissionId: string) {
  return state.questionSetVersions
    .filter((version) => version.submissionId === submissionId)
    .sort(sortQuestionSetVersionsDescending);
}

export function getQuestionSetVersionById(state: AppState, questionSetVersionId: string) {
  return state.questionSetVersions.find((version) => version.id === questionSetVersionId) ?? null;
}

export function getActiveQuestionSet(
  state: AppState,
  submissionId: string,
): QuestionSetVersion | null {
  const versions = getSubmissionQuestionSetVersions(state, submissionId);

  return versions.find((version) => version.isActive) ?? versions[0] ?? null;
}

export function getSubmissionResponses(state: AppState, submissionId: string) {
  return state.responses
    .filter((response) => response.submissionId === submissionId)
    .sort(sortResponsesDescending);
}

export function getMySubmissions(state: AppState) {
  return state.submissions
    .filter((submission) => submission.userId === state.currentUserId)
    .sort(
      (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
    );
}

export interface AvailableRecording {
  recording: ResponseRecording;
  response: TestResponse;
  submission: Submission;
}

export function getAvailableRecordingsForCurrentUser(
  state: AppState,
  now = Date.now(),
): AvailableRecording[] {
  if (!state.currentUserId) {
    return [];
  }

  const ownedSubmissions = new Map(
    state.submissions
      .filter((submission) => submission.userId === state.currentUserId)
      .map((submission) => [submission.id, submission]),
  );

  return state.responses
    .reduce<AvailableRecording[]>((availableRecordings, response) => {
      const submission = ownedSubmissions.get(response.submissionId);
      const recording = response.recording;
      const expiresAt = recording ? Date.parse(recording.expiresAt) : Number.NaN;

      if (
        !submission ||
        !recording ||
        recording.deletedAt ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= now
      ) {
        return availableRecordings;
      }

      availableRecordings.push({ recording, response, submission });
      return availableRecordings;
    }, [])
    .sort((first, second) => {
      const submittedAtDifference =
        Date.parse(second.response.submittedAt) - Date.parse(first.response.submittedAt);

      return submittedAtDifference || first.response.id.localeCompare(second.response.id);
    });
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
          response.submissionId === submission.id && response.testerUserId === state.currentUserId,
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

      return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
    });
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

export function buildAnonymousLabel(state: AppState, submissionId: string, testerUser: User) {
  const index =
    state.responses.filter((response) => response.submissionId === submissionId).length + 1;

  return `${testerUser.displayName.split(" ")[0]} ${index}`;
}
