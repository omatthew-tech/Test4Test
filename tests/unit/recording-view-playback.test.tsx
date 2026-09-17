import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seededState } from "../../src/data/seeds";
import { invalidateResponseRecordingUrl } from "../../src/lib/recordings";
import { RecordingViewPage } from "../../src/pages/RecordingViewPage";
import type { AppState, ResponseRecording } from "../../src/types";

const backend = vi.hoisted(() => ({ history: vi.fn(), state: null as AppState | null }));
vi.mock("../../src/context/AppStateContext", () => ({
  useAppState: () => ({ state: backend.state }),
}));
vi.mock("../../src/components/Layout", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("../../src/lib/supabase", () => ({
  supabaseUrl: "https://project.supabase.co",
  supabasePublishableKey: "publishable-key",
  requireSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "user-token" } }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ order: backend.history }) }) }),
  }),
}));

const recording: ResponseRecording = {
  bucket: "r2:test-response-recordings",
  path: "recordings/current.webm",
  fileName: "current.webm",
  mimeType: "video/webm",
  fileSizeBytes: 1200,
  uploadedAt: "2026-09-17T12:00:00Z",
  expiresAt: null,
};
const response = { ...seededState.responses[0], recording };
const original = {
  id: "b181493f-c044-41ce-a6b6-5c00bc302c11",
  response_id: response.id,
  version_number: 1,
  submitted_at: response.submittedAt,
  duration_seconds: response.durationSeconds,
  answers: [],
  recording_bucket: recording.bucket,
  recording_path: "recordings/original.webm",
  recording_file_name: "original.webm",
  recording_deleted_at: null as string | null,
};
const latest = { ...original, id: "cc912c45-15b2-4ae9-a97c-681d32b2ef91", version_number: 2 };

function mount(query = "") {
  return render(
    <MemoryRouter initialEntries={[`/recordings${query}`]}>
      <RecordingViewPage />
    </MemoryRouter>,
  );
}

function requestedMedia() {
  return vi.mocked(fetch).mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
}

function signedUrl(url = "https://media.example/current.webm") {
  return {
    ok: true,
    json: async () => ({ ok: true, url, fileName: "current.webm", expiresInSeconds: 300 }),
  };
}

beforeEach(() => {
  vi.stubEnv("VITE_DS_FIXTURES", "0");
  backend.state = { ...seededState, currentUserId: "user-mateo", responses: [response] };
  backend.history.mockReset().mockResolvedValue({ data: [], error: null });
  invalidateResponseRecordingUrl(response.id);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(signedUrl()));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each(["PGRST205", "42P01"])(
  "plays the current video when the history table is absent (%s)",
  async (code) => {
    backend.history.mockResolvedValue({ data: null, error: { code } });
    const { container } = mount();
    await waitFor(() =>
      expect(container.querySelector("video")?.getAttribute("src")).toBe(
        "https://media.example/current.webm",
      ),
    );
    expect(requestedMedia()).toEqual([{ responseId: response.id, download: false }]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Recording history could not be loaded/)).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  },
);

it("plays without waiting for history and keeps the video mounted when history arrives", async () => {
  let finishHistory!: (result: { data: (typeof original)[]; error: null }) => void;
  backend.history.mockReturnValue(
    new Promise((resolve) => {
      finishHistory = resolve;
    }),
  );
  const { container } = mount();
  await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
  const video = container.querySelector("video");
  await act(async () => finishHistory({ data: [latest, original], error: null }));
  expect(container.querySelector("video")).toBe(video);
  expect(requestedMedia()).toEqual([{ responseId: response.id, download: false }]);
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(latest.id);
});

it.each(["42501", "PGRST003"])(
  "history failures stay retryable without blocking video (%s)",
  async (code) => {
    backend.history.mockResolvedValueOnce({ data: null, error: { code } });
    const { container } = mount();
    await screen.findByText(/Recording history could not be loaded/);
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const video = container.querySelector("video");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.queryByText(/Recording history could not be loaded/)).toBeNull(),
    );
    expect(container.querySelector("video")).toBe(video);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(backend.history).toHaveBeenCalledTimes(2);
  },
);

it("plays the current video when history is empty", async () => {
  const { container } = mount();
  await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
  expect(screen.queryByText("This recording version is unavailable.")).toBeNull();
});

it("plays an explicitly selected revision with its real version ID", async () => {
  backend.history.mockResolvedValue({ data: [latest, original], error: null });
  const { container } = mount(`?version=${original.id}`);
  await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
  expect(requestedMedia()).toEqual([
    { responseId: response.id, versionId: original.id, download: false },
  ]);
});

it.each(["missing-table", "failed", "empty", "missing-version", "deleted"])(
  "never substitutes the current recording for an unavailable explicit revision (%s)",
  async (reason) => {
    backend.history.mockResolvedValue({
      data:
        reason === "deleted"
          ? [{ ...original, recording_deleted_at: "2026-09-17T13:00:00Z" }]
          : reason === "missing-version"
            ? [latest]
            : [],
      error:
        reason === "missing-table"
          ? { code: "PGRST205" }
          : reason === "failed"
            ? { code: "42501" }
            : null,
    });
    const { container } = mount(`?version=${original.id}`);
    await screen.findAllByText("This recording version is unavailable.");
    expect(container.querySelector("video")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("Loading recording")).toBeNull();
  },
);

it("reloads a failed video with a fresh signed URL, including a cached revision", async () => {
  backend.history.mockResolvedValue({ data: [original], error: null });
  const { container } = mount(`?version=${original.id}`);
  await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
  fireEvent.error(container.querySelector("video")!);
  vi.mocked(fetch).mockResolvedValueOnce(
    signedUrl("https://media.example/refreshed.webm") as Response,
  );
  fireEvent.click(screen.getByRole("button", { name: "Reload video" }));
  await waitFor(() =>
    expect(container.querySelector("video")?.getAttribute("src")).toBe(
      "https://media.example/refreshed.webm",
    ),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(backend.history).toHaveBeenCalledTimes(1);
});

it("shows access failures and retries playback even without history", async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: "You do not have permission to access this recording." }),
  } as Response);
  const { container } = mount();
  await screen.findByText("You do not have permission to access this recording.");
  expect(container.querySelector("video")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reload video" }));
  await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
});

it("ignores a late playback response after navigating to another recording", async () => {
  const nextResponse = { ...response, id: "response-next", submittedAt: "2026-03-24T13:20:00Z" };
  backend.state!.responses.push(nextResponse);
  let finishFirst!: (result: Response) => void;
  vi.mocked(fetch).mockReturnValueOnce(
    new Promise((resolve) => {
      finishFirst = resolve;
    }),
  );
  const { container } = mount();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Next recording" }));
  await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
  const video = container.querySelector("video");
  await act(async () => finishFirst(signedUrl("https://media.example/old.webm") as Response));
  expect(container.querySelector("video")).toBe(video);
  expect(video?.getAttribute("src")).toBe("https://media.example/current.webm");
  expect(requestedMedia().map((request) => request.responseId)).toEqual([
    response.id,
    nextResponse.id,
  ]);
});

it("refreshes current playback when the recording is replaced with the same file name", async () => {
  const { container, rerender } = mount();
  await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
  backend.state = {
    ...backend.state!,
    responses: [{ ...response, recording: { ...recording, path: "recordings/replaced.webm" } }],
  };
  vi.mocked(fetch).mockResolvedValueOnce(
    signedUrl("https://media.example/replaced.webm") as Response,
  );
  rerender(
    <MemoryRouter>
      <RecordingViewPage />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(container.querySelector("video")?.getAttribute("src")).toBe(
      "https://media.example/replaced.webm",
    ),
  );
  expect(requestedMedia()).toEqual([
    { responseId: response.id, download: false },
    { responseId: response.id, download: false },
  ]);
});
