import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

interface SharedRecording {
  url: string;
  fileName: string;
  productName: string;
}

const fixtureMode = import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1";

async function recordingShareRequest(body: Record<string, string>, accessToken?: string) {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Recording sharing is not available in the current environment.");
  }
  const response = await fetch(`${supabaseUrl}/functions/v1/get-response-recording-access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabasePublishableKey,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error ?? "The recording link could not be loaded. Try again.");
  }
  return result;
}

export async function createRecordingShareUrl(responseId: string) {
  let token: string;
  if (fixtureMode) {
    token = `demo-${responseId}`;
  } else {
    const {
      data: { session },
      error,
    } = await requireSupabase().auth.getSession();
    if (error || !session?.access_token) throw new Error("Sign in again to share this recording.");
    const result = await recordingShareRequest(
      { responseId, action: "share" },
      session.access_token,
    );
    if (typeof result.shareToken !== "string" || !result.shareToken) {
      throw new Error("The recording link could not be created. Try again.");
    }
    token = result.shareToken;
  }
  // A fragment keeps the capability out of HTTP referrers and server access logs.
  return `${window.location.origin}/recordings/shared#${encodeURIComponent(token)}`;
}

export async function loadSharedRecording(shareToken: string): Promise<SharedRecording> {
  if (!shareToken) throw new Error("This recording link is invalid.");
  if (fixtureMode && shareToken.startsWith("demo-")) {
    const { createDesignSystemFixtureState } = await import("../testing/designSystemFixtures");
    const fixture = createDesignSystemFixtureState("ds-recordings=2");
    const response = fixture.responses.find((item) => item.id === shareToken.slice(5));
    const submission = fixture.submissions.find((item) => item.id === response?.submissionId);
    if (!submission) throw new Error("This recording link is invalid or unavailable.");
    return { url: "", fileName: "fixture-recording.webm", productName: submission.productName };
  }
  const result = await recordingShareRequest({ shareToken });
  if (typeof result.url !== "string" || !result.url) {
    throw new Error("This recording is unavailable.");
  }
  return {
    url: result.url,
    fileName: result.fileName ?? "screen-recording.mp4",
    productName: result.productName ?? "Shared recording",
  };
}
