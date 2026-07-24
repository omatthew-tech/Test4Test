import { seededState } from "../data/seeds";
import type { AdminTestReport, AppState, TestResponse } from "../types";

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
  const requestedUserId = parameters.get("ds-user");
  const currentUserId =
    requestedUserId && seededState.users.some((user) => user.id === requestedUserId)
      ? requestedUserId
      : null;
  const banned = parameters.get("ds-banned") === "1";
  const recording = parameters.get("ds-recording") === "1";
  const includeSecondResponse = parameters.get("ds-responses") === "2";
  const responses = structuredClone(seededState.responses);
  const paletteResponse = responses.find((response) => response.id === "response-palette-1");

  if (includeSecondResponse && paletteResponse) {
    responses.push(createSecondPaletteResponse(paletteResponse));
  }

  return {
    ...structuredClone(seededState),
    currentUserId,
    submissions: seededState.submissions.map((submission) =>
      submission.id === "submission-palette"
        ? {
            ...structuredClone(submission),
            requiresRecording: recording || submission.requiresRecording,
            responseCount: includeSecondResponse ? 2 : submission.responseCount,
            lastResponseAt: includeSecondResponse
              ? "2026-03-26T14:40:00.000Z"
              : submission.lastResponseAt,
          }
        : structuredClone(submission),
    ),
    responses,
    users: seededState.users.map((user) =>
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
