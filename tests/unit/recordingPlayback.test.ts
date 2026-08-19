import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  supabaseUrl: "https://project.supabase.co",
  supabasePublishableKey: "publishable-key",
  requireSupabase: () => ({ auth: { getSession } }),
}));

describe("recording playback URL loading", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "user-token",
          user: { id: "user-owner" },
        },
      },
      error: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          url: "https://media.example/recording.webm?signature=one",
          fileName: "recording.webm",
          expiresInSeconds: 300,
        }),
      }),
    );
  });

  it("does not request recording media until called and reuses the signed URL", async () => {
    const { requestResponseRecordingUrl } = await import("../../src/lib/recordings");
    const fetchMock = vi.mocked(fetch);

    expect(fetchMock).not.toHaveBeenCalled();
    const first = await requestResponseRecordingUrl("response-playback-test");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/get-response-recording-access",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ responseId: "response-playback-test", download: false }),
      }),
    );

    const second = await requestResponseRecordingUrl("response-playback-test");
    expect(second.url).toBe(first.url);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
