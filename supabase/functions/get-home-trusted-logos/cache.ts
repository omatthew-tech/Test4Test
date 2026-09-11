import { DISCOVERY_TIMEOUT_MS, normalizeSourceUrl } from "./network.ts";
import { discoverLogo, type LogoAsset } from "./discovery.ts";
import { verifiedSources } from "./sources.ts";

export const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const FAILURE_TTL_MS = 24 * 60 * 60 * 1000;
export interface SubmissionSource {
  id: string;
  access_url: string;
  access_links: Record<string, unknown> | null;
  product_types: string[] | null;
}
export interface CacheRow {
  submission_id: string;
  source_key: string;
  logo_path: string | null;
  source_image_url: string | null;
  refresh_after: string;
  claim_token: string | null;
}
export interface CacheStore {
  read(id: string): Promise<CacheRow | null>;
  claim(id: string, key: string): Promise<CacheRow | null>;
  upload(id: string, asset: LogoAsset): Promise<string>;
  finish(
    claim: CacheRow,
    result: {
      logoPath: string | null;
      sourceImageUrl: string | null;
      refreshAfter: string;
      error: string | null;
    },
  ): Promise<boolean>;
  publicUrl(path: string): string;
}

/** Batch the first lookup only; lease-recovery reads must still see fresh rows. */
export function primeCacheReads(store: CacheStore, ids: string[], rows: CacheRow[]): CacheStore {
  const initial = new Map<string, CacheRow | null>(ids.map((id) => [id, null]));
  for (const row of rows) initial.set(row.submission_id, row);
  return {
    claim: (...args) => store.claim(...args),
    upload: (...args) => store.upload(...args),
    finish: (...args) => store.finish(...args),
    publicUrl: (...args) => store.publicUrl(...args),
    read(id) {
      if (!initial.has(id)) return store.read(id);
      const row = initial.get(id) ?? null;
      initial.delete(id);
      return Promise.resolve(row);
    },
  };
}

export function selectDestination(
  submission: SubmissionSource,
): { url: string; appStoreOnly: boolean } | null {
  const links = submission.access_links ?? {};
  if (typeof links.website === "string" && links.website.trim())
    return { url: normalizeSourceUrl(links.website), appStoreOnly: false };
  for (const platform of ["ios", "android"]) {
    if (typeof links[platform] === "string" && links[platform].trim())
      return { url: normalizeSourceUrl(links[platform]), appStoreOnly: true };
  }
  if (submission.access_url?.trim()) {
    return {
      url: normalizeSourceUrl(submission.access_url),
      appStoreOnly: !(submission.product_types ?? []).includes("website"),
    };
  }
  return null;
}

export async function resolveCachedLogo(
  submission: SubmissionSource,
  store: CacheStore,
  background: (task: Promise<unknown>) => void,
  discover = discoverLogo,
  now = Date.now,
): Promise<string | null> {
  let destination;
  try {
    destination = selectDestination(submission);
  } catch {
    return null;
  }
  if (!destination) return null;
  const override = verifiedSources.find(
    (source) =>
      source.submissionId === submission.id && source.expectedDestination === destination.url,
  );
  if (override?.local) return override.imageUrl;
  const sourceKey = JSON.stringify([
    destination.url,
    destination.appStoreOnly,
    override?.imageUrl ?? null,
    1,
  ]);
  const cached = await store.read(submission.id);
  const current = cached?.source_key === sourceKey ? cached : null;
  if (current && Date.parse(current.refresh_after) > now())
    return current.logo_path ? store.publicUrl(current.logo_path) : null;
  const claim = await store.claim(submission.id, sourceKey);
  if (!claim) {
    const active = await store.read(submission.id);
    return active?.source_key === sourceKey && active.logo_path
      ? store.publicUrl(active.logo_path)
      : null;
  }
  const refresh = async () => {
    let asset: LogoAsset | null = null;
    let path = claim.logo_path;
    let error: string | null = null;
    try {
      asset = await discover(destination.url, AbortSignal.timeout(DISCOVERY_TIMEOUT_MS), {
        overrideUrl: override?.imageUrl,
        appStoreOnly: destination.appStoreOnly,
      });
      if (asset) path = await store.upload(submission.id, asset);
      else error = "no_usable_icon";
    } catch {
      asset = null;
      error = "discovery_failed";
    }
    const accepted = await store.finish(claim, {
      logoPath: path,
      sourceImageUrl: asset?.sourceImageUrl ?? claim.source_image_url,
      refreshAfter: new Date(now() + (asset ? SUCCESS_TTL_MS : FAILURE_TTL_MS)).toISOString(),
      error,
    });
    if (error)
      console.info(
        JSON.stringify({
          event: "home_logo_discovery",
          submissionId: submission.id,
          outcome: error,
        }),
      );
    return accepted && path ? store.publicUrl(path) : null;
  };
  if (claim.logo_path) {
    background(
      refresh().catch(() => {
        console.error("Home logo cache refresh failed.");
      }),
    );
    return store.publicUrl(claim.logo_path);
  }
  return await refresh();
}
