import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AnalyticsPage } from "../../src/pages/AnalyticsPage";
import { seededState } from "../../src/data/seeds";

const api = vi.hoisted(() => ({ open: vi.fn(), media: vi.fn(), previews: vi.fn() }));
vi.mock("../../src/context/AppStateContext", () => ({
  useAppState: () => ({ state: seededState, openFeedback: api.open }),
}));
vi.mock("../../src/components/Layout", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("../../src/pages/AnalyticsTranscriptReport", () => ({
  AnalyticsTranscriptReport: () => null,
}));
vi.mock("../../src/lib/recordings", () => ({
  requestResponseRecordingUrl: api.media,
  invalidateResponseRecordingUrl: vi.fn(),
}));
vi.mock("../../src/lib/recordingPreviews", () => ({
  requestRecordingPreviews: api.previews,
  buildFixtureRecordingPreviews: () => [],
  mergeRecordingPreviews: (_old: unknown, rows: unknown) => rows,
}));
function Destination() {
  return <p>{useLocation().search}</p>;
}
function mount(path = "/analytics") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/recordings" element={<Destination />} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.stubEnv("VITE_DS_FIXTURES", "0");
  api.open.mockReset().mockResolvedValue({ status: "unlocked", balance: 0 });
  api.media.mockReset().mockResolvedValue({ url: "https://media.example/video" });
  api.previews.mockReset().mockResolvedValue([
    {
      responseId: "response",
      submissionId: "app",
      productName: "Example",
      submittedAt: "2026-09-22T00:00:00Z",
      durationSeconds: 60,
      thumbnailStatus: "ready",
      thumbnail: null,
      feedbackAccess: "locked",
    },
  ]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
it("opens the selected recording in the viewer without charging or loading inline media", async () => {
  const { container } = mount();
  const play = await screen.findByRole("button", { name: "Play Recording 1: Example" });
  expect(api.open).not.toHaveBeenCalled();
  fireEvent.click(play);
  await screen.findByText("?response=response");
  expect(container.querySelector("video")).toBeNull();
  expect(api.open).not.toHaveBeenCalled();
  expect(api.media).not.toHaveBeenCalled();
});
it("preserves query parameters and replaces the selected response for locked recordings", async () => {
  api.open.mockResolvedValue({ status: "insufficient_credits", balance: 0 });
  mount("/analytics?source=report&response=previous");
  fireEvent.click(await screen.findByRole("button", { name: "Play Recording 1: Example" }));
  await screen.findByText("?source=report&response=response");
  expect(api.open).not.toHaveBeenCalled();
  expect(api.media).not.toHaveBeenCalled();
});
