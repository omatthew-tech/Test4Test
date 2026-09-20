import { requireSupabase, supabasePublishableKey, supabaseUrl } from "./supabase";

export type ClipStatus = "pending" | "processing" | "ready" | "failed";
export interface ClipRequest {
  id: string;
  token: string;
  responseId: string;
  versionId?: string;
  startMs: number;
  endMs: number;
}
export interface PublicClip {
  status: ClipStatus;
  productName: string;
  durationMs: number;
  url?: string;
  downloadUrl?: string;
}
const fixtures = import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1";
const fixtureJobs = new Map<string, number>();

export function newClipRequest(
  responseId: string,
  versionId: string | undefined,
  start: number,
  end: number,
): ClipRequest {
  return {
    id: crypto.randomUUID(),
    token: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
    responseId,
    ...(versionId ? { versionId } : {}),
    startMs: Math.round(start * 1000),
    endMs: Math.round(end * 1000),
  };
}
export function clipShareUrl(token: string) {
  return `${window.location.origin}/clips/shared#${token}`;
}
async function request(body: Record<string, unknown>, guest = false) {
  if (!supabaseUrl || !supabasePublishableKey)
    throw new Error("Clip sharing is unavailable in this environment.");
  let accessToken: string | undefined;
  if (!guest) {
    const {
      data: { session },
      error,
    } = await requireSupabase().auth.getSession();
    if (error || !session?.access_token)
      throw new Error("Sign in again to create or manage clips.");
    accessToken = session.access_token;
  }
  const response = await fetch(`${supabaseUrl}/functions/v1/recording-clips`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabasePublishableKey,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok)
    throw new Error(payload?.error ?? "The clip could not be loaded. Please try again.");
  return payload;
}
function status(value: unknown): ClipStatus {
  if (!["pending", "processing", "ready", "failed"].includes(String(value)))
    throw new Error("The clip status could not be loaded.");
  return value as ClipStatus;
}
export async function saveRecordingClip(input: ClipRequest): Promise<ClipStatus> {
  if (fixtures) {
    fixtureJobs.set(input.id, Date.now());
    return "pending";
  }
  return status((await request({ action: "create", ...input })).status);
}
export async function getRecordingClipStatus(id: string): Promise<ClipStatus> {
  if (fixtures) return Date.now() - (fixtureJobs.get(id) ?? 0) > 1000 ? "ready" : "processing";
  return status((await request({ action: "status", id })).status);
}
export async function retryRecordingClip(id: string): Promise<ClipStatus> {
  if (fixtures) {
    fixtureJobs.set(id, Date.now());
    return "pending";
  }
  return status((await request({ action: "retry", id })).status);
}
export async function deleteRecordingClip(id: string) {
  if (!fixtures) await request({ action: "delete", id });
}
export async function loadPublicClip(token: string): Promise<PublicClip> {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("This clip link is invalid or unavailable.");
  if (fixtures) return { status: "ready", productName: "MastoMetrics", durationMs: 30000, url: "" };
  const payload = await request({ action: "public", token }, true);
  return {
    status: status(payload.status),
    productName: payload.productName,
    durationMs: payload.durationMs,
    ...(payload.url ? { url: payload.url, downloadUrl: payload.downloadUrl } : {}),
  };
}
