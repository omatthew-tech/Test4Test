import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seededState } from "../../src/data/seeds";
import { TestSessionPage } from "../../src/pages/TestSessionPage";
import type { ResponseRecording } from "../../src/types";

const actions = vi.hoisted(() => ({
  completeTest: vi.fn(),
  reviseTestResponse: vi.fn(),
  anonymous: false,
}));
vi.mock("../../src/context/AppStateContext", () => ({
  useAppState: () => ({
    state: seededState,
    currentUser: actions.anonymous
      ? null
      : seededState.users.find((user) => user.id === "user-avery"),
    completeTest: actions.completeTest,
    reviseTestResponse: actions.reviseTestResponse,
  }),
}));
vi.mock("../../src/components/Layout", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("../../src/lib/analytics", () => ({ trackEventOncePerSession: vi.fn() }));

const recording: ResponseRecording = {
  bucket: "r2:test-response-recordings",
  path: "draft/test/video.webm",
  fileName: "video.webm",
  mimeType: "video/webm",
  fileSizeBytes: 1200,
  uploadedAt: "2026-09-11T12:00:00Z",
  expiresAt: null,
};
function readySession(key: string) {
  sessionStorage.setItem(
    `test4test:recording-session:${key}`,
    JSON.stringify({
      submissionId: key,
      sessionId: "fixture-session",
      phase: "return_and_submit",
      chosenProductType: "website",
      confirmedRecording: true,
      recording,
    }),
  );
}
beforeEach(() => {
  vi.spyOn(window, "focus").mockImplementation(() => {});
  actions.anonymous = false;
  actions.completeTest
    .mockReset()
    .mockResolvedValue({ ok: true, creditAwarded: false, message: "Submitted" });
  actions.reviseTestResponse.mockReset().mockResolvedValue({ ok: true, message: "Revised" });
  sessionStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "submits an uploaded legacy test with empty answers (anonymous=%s)",
  async (anonymous) => {
    actions.anonymous = anonymous;
    readySession("submission-palette");
    render(
      <MemoryRouter initialEntries={["/test/submission-palette?shared=1"]}>
        <Routes>
          <Route path="/test/:submissionId" element={<TestSessionPage />} />
          <Route path="*" element={<p>Completed</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByPlaceholderText(/thoughtful answer/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
    await waitFor(() =>
      expect(actions.completeTest).toHaveBeenCalledWith(
        "submission-palette",
        [],
        expect.any(Number),
        recording,
        "qsv-palette-1",
        "sv-palette-1",
        "shared_link",
      ),
    );
    await screen.findByText("Completed");
  },
);

it("uses a separate revision draft and sends its recording and expected version", async () => {
  readySession("submission-palette");
  readySession("revision:response-palette-1:2");
  render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={
            <TestSessionPage
              revision={{
                responseId: "response-palette-1",
                submissionId: "submission-palette",
                expectedVersionNumber: 2,
              }}
            />
          }
        />
        <Route path="*" element={<p>Completed</p>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit revised recording" }));
  await waitFor(() =>
    expect(actions.reviseTestResponse).toHaveBeenCalledWith(
      "response-palette-1",
      recording,
      expect.any(Number),
      2,
    ),
  );
  expect(actions.completeTest).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("test4test:recording-session:submission-palette")).not.toBeNull();
  expect(
    sessionStorage.getItem("test4test:recording-session:revision:response-palette-1:2"),
  ).toBeNull();
});

it("keeps the draft and allows retry after a failed submit", async () => {
  readySession("submission-palette");
  actions.completeTest.mockRejectedValue(new Error("Connection lost"));
  render(
    <MemoryRouter initialEntries={["/test/submission-palette"]}>
      <Routes>
        <Route path="/test/:submissionId" element={<TestSessionPage />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
  await screen.findByText("Connection lost");
  expect((screen.getByRole("button", { name: "Submit test" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  expect(sessionStorage.getItem("test4test:recording-session:submission-palette")).not.toBeNull();
});
