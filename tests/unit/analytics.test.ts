import { describe, expect, it } from "vitest";
import { seededState } from "../../src/data/seeds";
import { getAvailableRecordingsForCurrentUser } from "../../src/lib/selectors";
import type { ResponseRecording, TestResponse } from "../../src/types";

const now = Date.parse("2026-08-08T12:00:00.000Z");

function createRecording(
  id: string,
  expiresAt = "2026-09-08T12:00:00.000Z",
  deletedAt: string | null = null,
): ResponseRecording {
  return {
    bucket: "response-recordings",
    path: `tests/${id}.webm`,
    fileName: `${id}.webm`,
    mimeType: "video/webm",
    fileSizeBytes: 12_000_000,
    uploadedAt: "2026-08-01T12:00:00.000Z",
    expiresAt,
    deletedAt,
  };
}

describe("available Analytics recordings", () => {
  it("returns only current-user recordings that have not expired or been deleted", () => {
    const state = structuredClone(seededState);
    state.currentUserId = "user-mateo";
    const template = state.responses.find(
      (response) => response.submissionId === "submission-palette",
    );

    if (!template) {
      throw new Error("The Analytics selector test requires the Palette Pilot response fixture.");
    }

    const response = (
      id: string,
      submissionId: string,
      submittedAt: string,
      recording: ResponseRecording | null,
    ): TestResponse => ({
      ...structuredClone(template),
      id,
      submissionId,
      submittedAt,
      recording,
    });

    state.responses = [
      response(
        "available-newest",
        "submission-palette",
        "2026-08-07T12:00:00.000Z",
        createRecording("available-newest"),
      ),
      response(
        "expired",
        "submission-palette",
        "2026-08-06T12:00:00.000Z",
        createRecording("expired", "2026-08-08T12:00:00.000Z"),
      ),
      response(
        "deleted",
        "submission-palette",
        "2026-08-05T12:00:00.000Z",
        createRecording("deleted", "2026-09-08T12:00:00.000Z", "2026-08-07T12:00:00.000Z"),
      ),
      response("missing", "submission-palette", "2026-08-04T12:00:00.000Z", null),
      response(
        "foreign",
        "submission-pantry",
        "2026-08-03T12:00:00.000Z",
        createRecording("foreign"),
      ),
      response(
        "available-older",
        "submission-palette",
        "2026-08-01T12:00:00.000Z",
        createRecording("available-older"),
      ),
    ];

    const availableRecordings = getAvailableRecordingsForCurrentUser(state, now);

    expect(availableRecordings.map(({ response: item }) => item.id)).toEqual([
      "available-newest",
      "available-older",
    ]);
    expect(availableRecordings[0]).toMatchObject({
      recording: { path: "tests/available-newest.webm" },
      submission: { id: "submission-palette", userId: "user-mateo" },
    });
  });

  it("returns no recordings without an authenticated user", () => {
    const state = structuredClone(seededState);
    state.currentUserId = null;

    expect(getAvailableRecordingsForCurrentUser(state, now)).toEqual([]);
  });
});
