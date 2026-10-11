import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { seededState } from "../../src/data/seeds";
const backend = vi.hoisted(() => ({ save: vi.fn(), track: vi.fn() }));
vi.mock("../../src/context/AppStateContext", () => ({
  useAppState: () => ({
    state: { ...seededState, currentUserId: "user-avery" },
    upsertSubmissionShareLink: backend.save,
  }),
}));
vi.mock("../../src/components/Layout", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("../../src/lib/shareCopyActivity", () => ({ recordShareLinkCopyClick: backend.track }));
import { SharePage } from "../../src/pages/SharePage";
beforeEach(() => {
  vi.clearAllMocks();
  backend.save.mockResolvedValue({ slug: "example" });
  backend.track.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });
});
afterEach(cleanup);
it("tracks the actual click even when clipboard access fails", async () => {
  render(
    <MemoryRouter>
      <SharePage />
    </MemoryRouter>,
  );
  expect(backend.track).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  expect(backend.track).toHaveBeenCalledTimes(1);
  await screen.findByRole("button", { name: "Copy failed" });
});
it("does not track an autosave, and tracking latency cannot block copying", async () => {
  render(
    <MemoryRouter>
      <SharePage />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Add a custom message (optional)" }), {
    target: { value: "Try my app" },
  });
  await waitFor(() => expect(backend.save).toHaveBeenCalled());
  expect(backend.track).not.toHaveBeenCalled();
  backend.track.mockReturnValue(new Promise(() => {}));
  vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  await screen.findByRole("button", { name: "Copied" });
});
