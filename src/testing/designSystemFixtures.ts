import { seededState } from "../data/seeds";
import type { AdminTestReport, AppState, TestResponse, User } from "../types";

function createSecondPaletteResponse(source: TestResponse): TestResponse {
  return {
    ...structuredClone(source),
    id: "response-palette-2",
    testerUserId: "user-nina",
    anonymousLabel: "Tester 7",
    submittedAt: "2026-03-26T14:40:00.000Z",
    durationSeconds: 418,
    internalFlags: [],
    answers: source.answers.map((answer) =>
      answer.type === "paragraph"
        ? {
            ...answer,
            textAnswer:
              "The second fixture response confirms the navigation state while keeping the production data contract unchanged.",
          }
        : { ...answer },
    ),
  };
}

export function createDesignSystemFixtureState(search: string): AppState {
  const parameters = new URLSearchParams(search);
  type TesterFixtureMode = "locked" | "unlocked";

  function createTesterFixtureUser(mode: TesterFixtureMode): User {
    const userId = `user-tester-${mode}`;
    return {
      id: userId,
      email: `${mode}@tester.demo.test4test.app`,
      displayName: mode === "locked" ? "Taylor Tester" : "Uma Tester",
      accountType: "tester" as const,
      testerProfile: {
        userId,
        firstName: mode === "locked" ? "Taylor" : "Uma",
        countryCode: "US",
        region: "New York",
        technologyProficiency: "moderately" as const,
        devices: ["computer", "ios"],
        employmentStatus: "student" as const,
        workArea: "" as const,
        paidTestEmailEnabled: true,
        createdAt: "2026-08-18T12:00:00.000Z",
        updatedAt: "2026-08-18T12:00:00.000Z",
      },
      status: "active" as const,
      createdAt: "2026-08-18T12:00:00.000Z",
      banStatus: "clear" as const,
      bannedAt: null,
      paypalHandle: null,
      venmoHandle: null,
      cashAppHandle: null,
    };
  }

  function createTesterProgress(mode: TesterFixtureMode, testerUserId: string) {
    const count = mode === "unlocked" ? 2 : 1;
    const responses = structuredClone(seededState.responses)
      .filter((response) => response.status === "approved")
      .slice(0, count)
      .map((response, index) => ({
        ...response,
        id: `response-tester-${index + 1}`,
        testerUserId,
        status: "approved" as const,
        creditAwarded: true,
      }));
    const feedbackRatings = responses.map((response, index) => ({
      id: `rating-tester-${index + 1}`,
      testResponseId: response.id,
      ratedByUserId:
        seededState.submissions.find((submission) => submission.id === response.submissionId)
          ?.userId ?? "user-mateo",
      ratingValue: "smiley" as const,
      starRating: 5,
      createdAt: "2026-08-18T13:00:00.000Z",
      updatedAt: "2026-08-18T13:00:00.000Z",
    }));

    return { responses, feedbackRatings };
  }

  function createPaidTestFixture() {
    const source = seededState.submissions.find(
      (submission) => submission.id === "submission-sprout",
    );
    if (!source) throw new Error("Paid-test fixture source is missing.");

    return {
      ...structuredClone(source),
      id: "submission-paid-fixture",
      productName: "Paid Research Preview",
      description: "Review a focused product workflow and share clear usability feedback.",
      rewardType: "paid" as const,
      status: "live" as const,
      isOpenForMoreTests: true,
    };
  }
  const requestedUserId = parameters.get("ds-user");
  const requestedTesterMode = parameters.get("ds-tester");
  const testerMode: TesterFixtureMode | null =
    requestedTesterMode === "locked" || requestedTesterMode === "unlocked"
      ? requestedTesterMode
      : null;
  const testerUser = testerMode ? createTesterFixtureUser(testerMode) : null;
  const fixtureUsers = testerUser ? [...seededState.users, testerUser] : seededState.users;
  const currentUserId =
    testerUser?.id ??
    (requestedUserId && seededState.users.some((user) => user.id === requestedUserId)
      ? requestedUserId
      : null);
  const testerProgress = testerMode
    ? createTesterProgress(testerMode, testerUser?.id ?? "")
    : { responses: [], feedbackRatings: [] };
  const includePaidTest = testerMode === "unlocked" && parameters.get("ds-paid") === "1";
  const banned = parameters.get("ds-banned") === "1";
  const recording = parameters.get("ds-recording") === "1";
  const noLiveSubmission = parameters.get("ds-no-live") === "1";
  const requestedRecordingCount = parameters.get("ds-recordings");
  const availableRecordingCount =
    requestedRecordingCount === "2" ? 2 : requestedRecordingCount === "1" ? 1 : 0;
  const includeSecondResponse =
    parameters.get("ds-responses") === "2" || availableRecordingCount === 2;
  const responses = structuredClone(seededState.responses);
  responses.push(...testerProgress.responses);
  const paletteResponse = responses.find((response) => response.id === "response-palette-1");

  if (includeSecondResponse && paletteResponse) {
    responses.push(createSecondPaletteResponse(paletteResponse));
  }

  responses
    .filter((response) => response.submissionId === "submission-palette")
    .slice(0, availableRecordingCount)
    .forEach((response, index) => {
      response.recording = {
        bucket: "response-recordings",
        path: `fixtures/analytics-recording-${index + 1}.webm`,
        fileName: `analytics-recording-${index + 1}.webm`,
        mimeType: "video/webm",
        fileSizeBytes: 12_000_000 + index * 1_000_000,
        uploadedAt: response.submittedAt,
        expiresAt: "2099-12-31T23:59:59.000Z",
        deletedAt: null,
        thumbnail: {
          bucket: "usability-test-screenshots",
          path: `recording-thumbnails/scene-after-half-v1/fixture-${index + 1}.webp`,
          contentType: "image/webp",
          sizeBytes: 84_000 + index * 1_000,
          width: 960,
          height: 540,
          status: "ready",
          attemptCount: 1,
          lastAttemptAt: response.submittedAt,
          error: null,
          timestampMs: Math.round(response.durationSeconds * 550),
          durationMs: response.durationSeconds * 1000,
          generationVersion: "scene-after-half-v1",
        },
      };
    });

  return {
    ...structuredClone(seededState),
    currentUserId,
    submissions: [
      ...seededState.submissions.map((submission) => {
        const fixtureSubmission =
          submission.id === "submission-palette"
            ? {
                ...structuredClone(submission),
                requiresRecording:
                  recording || availableRecordingCount > 0 || submission.requiresRecording,
                responseCount: includeSecondResponse ? 2 : submission.responseCount,
                lastResponseAt: includeSecondResponse
                  ? "2026-03-26T14:40:00.000Z"
                  : submission.lastResponseAt,
              }
            : structuredClone(submission);

        return noLiveSubmission && fixtureSubmission.userId === currentUserId
          ? { ...fixtureSubmission, status: "paused" as const }
          : fixtureSubmission;
      }),
      ...(includePaidTest ? [createPaidTestFixture()] : []),
    ],
    responses,
    feedbackRatings: [
      ...structuredClone(seededState.feedbackRatings),
      ...testerProgress.feedbackRatings,
    ],
    users: fixtureUsers.map((user) =>
      user.id === currentUserId && banned
        ? { ...user, banStatus: "banned", bannedAt: "2026-07-23T12:00:00.000Z" }
        : { ...user },
    ),
  };
}

export function createDesignSystemAdminReportFixture(): AdminTestReport {
  return {
    id: "report-palette-fixture",
    submissionId: "submission-palette",
    reporterUserId: "user-avery",
    reporterEmail: "avery@demo.test4test.app",
    reporterDisplayName: "Avery Lane",
    founderUserId: "user-mateo",
    founderEmail: "mateo@demo.test4test.app",
    founderDisplayName: "Mateo Cruz",
    appName: "Palette Pilot",
    appDescription: "A collaborative moodboard and creative direction workspace for design teams.",
    appStatus: "live",
    needsGooglePlayClosedTesters: false,
    googlePlayClosedTestInstructions: "",
    reason: "app_unavailable",
    reasonLabel: "App unavailable",
    message: "The app did not load during the deterministic review fixture.",
    status: "pending",
    supportNotifiedAt: "2026-07-23T12:02:00.000Z",
    decisionNote: "",
    decidedByEmail: null,
    decidedAt: null,
    creditedTransactionId: null,
    createdAt: "2026-07-23T12:00:00.000Z",
    updatedAt: "2026-07-23T12:00:00.000Z",
    accessLinks: [{ productType: "Website / Web app", url: "https://palettepilot.app" }],
  };
}
