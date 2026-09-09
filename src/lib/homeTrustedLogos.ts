import type { HomeTrustedSubmission } from "./homeTrustedSubmissions";
import { requireSupabase, supabaseUrl } from "./supabase";

export interface HomeTrustedLogo {
  submissionId: string;
  logoUrl: string | null;
}

export function productInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => Array.from(word)[0])
      .join("")
      .toLocaleUpperCase() || "?"
  );
}

function trustedLogoUrl(value: unknown): string | null {
  if (value === "/brand/test4test-mark.svg") return value;
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.origin === new URL(supabaseUrl).origin &&
      url.pathname.startsWith("/storage/v1/object/public/home-trusted-logos/") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export async function loadHomeTrustedLogos(
  submissions: HomeTrustedSubmission[],
  signal: AbortSignal,
): Promise<Record<string, string | null>> {
  if (import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1") {
    const { fixtureHomeTrustedLogos } = await import("../testing/homeTrustedLogos");
    return fixtureHomeTrustedLogos(submissions);
  }
  if (!submissions.length) return {};
  const ids = new Set(submissions.map((submission) => submission.id));
  const { data, error } = await requireSupabase().functions.invoke("get-home-trusted-logos", {
    body: { submissionIds: [...ids] },
    signal,
  });
  if (error) throw error;
  const logos: Record<string, string | null> = {};
  for (const row of (Array.isArray(data?.logos) ? data.logos : []) as HomeTrustedLogo[]) {
    if (row && ids.has(row.submissionId)) logos[row.submissionId] = trustedLogoUrl(row.logoUrl);
  }
  return logos;
}
