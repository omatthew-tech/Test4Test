import { createClient } from "@supabase/supabase-js";
import {
  resolveCachedLogo,
  primeCacheReads,
  type CacheRow,
  type CacheStore,
  type SubmissionSource,
} from "./cache.ts";
import { createHandler } from "./handler.ts";

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };
const bucket = "home-trusted-logos";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const cache: CacheStore = {
  async read(id) {
    const { data, error } = await admin
      .from("home_trusted_logo_cache")
      .select("submission_id,source_key,logo_path,source_image_url,refresh_after,claim_token")
      .eq("submission_id", id)
      .maybeSingle();
    if (error) throw error;
    return data as CacheRow | null;
  },
  async claim(id, sourceKey) {
    const { data, error } = await admin.rpc("claim_home_trusted_logo", {
      p_submission_id: id,
      p_source_key: sourceKey,
    });
    if (error) throw error;
    return (data?.[0] as CacheRow) ?? null;
  },
  async upload(id, asset) {
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(asset.bytes))),
    )
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const path = `${id}/${hash}.${asset.extension}`;
    const { error } = await admin.storage.from(bucket).upload(path, asset.bytes, {
      contentType: asset.contentType,
      cacheControl: "604800",
      upsert: true,
    });
    if (error) throw error;
    return path;
  },
  async finish(claim, result) {
    const { data, error } = await admin
      .from("home_trusted_logo_cache")
      .update({
        logo_path: result.logoPath,
        source_image_url: result.sourceImageUrl,
        refresh_after: result.refreshAfter,
        last_error: result.error,
        claim_token: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("submission_id", claim.submission_id)
      .eq("source_key", claim.source_key)
      .eq("claim_token", claim.claim_token)
      .select("submission_id");
    if (error) throw error;
    return Boolean(data?.length);
  },
  publicUrl(path) {
    return admin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },
};

Deno.serve(
  createHandler({
    async eligibleIds() {
      const { data, error } = await admin.rpc("list_home_trusted_submissions");
      if (error) throw error;
      return (data ?? []).map((row: { id: string }) => row.id);
    },
    async sources(ids) {
      const { data, error } = await admin
        .from("submissions")
        .select("id,access_url,access_links,product_types")
        .in("id", ids);
      if (error) throw error;
      return (data ?? []) as SubmissionSource[];
    },
    resolve(source) {
      return resolveCachedLogo(source, cache, (task) => EdgeRuntime.waitUntil(task));
    },
    async prepare(sources) {
      const ids = sources.map((source) => source.id);
      const { data, error } = ids.length
        ? await admin
            .from("home_trusted_logo_cache")
            .select("submission_id,source_key,logo_path,source_image_url,refresh_after,claim_token")
            .in("submission_id", ids)
        : { data: [], error: null };
      // Preserve the individual fallback behavior during a failed batch read.
      const requestCache = error ? cache : primeCacheReads(cache, ids, (data ?? []) as CacheRow[]);
      return (source) =>
        resolveCachedLogo(source, requestCache, (task) => EdgeRuntime.waitUntil(task));
    },
  }),
);
