import { deepStrictEqual, equal, ok } from "node:assert/strict";
import {
  resolveCachedLogo,
  SUCCESS_TTL_MS,
  FAILURE_TTL_MS,
  selectDestination,
  type CacheRow,
  type CacheStore,
  type SubmissionSource,
} from "./cache.ts";
import type { discoverLogo, LogoAsset } from "./discovery.ts";

const source: SubmissionSource = {
  id: "10000000-0000-0000-0000-000000000001",
  access_url: "https://example.com/",
  access_links: { website: "example.com" },
  product_types: ["website"],
};
const asset: LogoAsset = {
  bytes: new Uint8Array([1]),
  contentType: "image/png",
  extension: "png",
  sourceImageUrl: "https://example.com/icon.png",
};
class MemoryStore implements CacheStore {
  row: CacheRow | null = null;
  claims = 0;
  uploads = 0;
  errors: (string | null)[] = [];
  read() {
    return Promise.resolve(this.row ? { ...this.row } : null);
  }
  claim(id: string, key: string) {
    if (this.row?.source_key === key && this.row.claim_token) return Promise.resolve(null);
    const same = this.row?.source_key === key;
    this.row = {
      submission_id: id,
      source_key: key,
      logo_path: same ? this.row!.logo_path : null,
      source_image_url: same ? this.row!.source_image_url : null,
      refresh_after: "2000-01-01T00:00:00Z",
      claim_token: String(++this.claims),
    };
    return Promise.resolve({ ...this.row });
  }
  upload() {
    this.uploads++;
    return Promise.resolve("stored.png");
  }
  finish(claim: CacheRow, result: Parameters<CacheStore["finish"]>[1]) {
    if (claim.claim_token !== this.row?.claim_token || claim.source_key !== this.row?.source_key)
      return Promise.resolve(false);
    this.row = {
      ...this.row,
      logo_path: result.logoPath,
      source_image_url: result.sourceImageUrl,
      refresh_after: result.refreshAfter,
      claim_token: null,
    };
    this.errors.push(result.error);
    return Promise.resolve(true);
  }
  publicUrl(path: string) {
    return `https://storage.example/${path}`;
  }
}

Deno.test(
  "successful and unsuccessful discovery have distinct TTLs and avoid repeat work",
  async () => {
    for (const result of [asset, null]) {
      const store = new MemoryStore();
      const now = Date.parse("2026-09-08T00:00:00Z");
      let discoveries = 0;
      const discover = (() => {
        discoveries++;
        return Promise.resolve(result);
      }) as typeof discoverLogo;
      const logo = await resolveCachedLogo(
        source,
        store,
        () => {},
        discover,
        () => now,
      );
      equal(logo, result ? "https://storage.example/stored.png" : null);
      equal(Date.parse(store.row!.refresh_after), now + (result ? SUCCESS_TTL_MS : FAILURE_TTL_MS));
      await resolveCachedLogo(
        source,
        store,
        () => {},
        discover,
        () => now + 1000,
      );
      equal(discoveries, 1);
      equal(store.uploads, result ? 1 : 0);
    }
  },
);

Deno.test("stale logos return immediately and survive a failed background refresh", async () => {
  const store = new MemoryStore();
  const now = Date.parse("2026-09-08T00:00:00Z");
  await resolveCachedLogo(
    source,
    store,
    () => {},
    () => Promise.resolve(asset),
    () => now,
  );
  const background: Promise<unknown>[] = [];
  const logo = await resolveCachedLogo(
    source,
    store,
    (task) => background.push(task),
    () => Promise.reject(new Error("timeout")),
    () => now + SUCCESS_TTL_MS + 1,
  );
  equal(logo, "https://storage.example/stored.png");
  equal(background.length, 1);
  await Promise.all(background);
  equal(store.row?.logo_path, "stored.png");
  equal(store.errors.at(-1), "discovery_failed");
});

Deno.test(
  "destination change clears the previous branding and rejects old worker completion",
  async () => {
    const store = new MemoryStore();
    await resolveCachedLogo(
      source,
      store,
      () => {},
      () => Promise.resolve(asset),
    );
    const changed = { ...source, access_links: { website: "https://new.example/" } };
    equal(
      await resolveCachedLogo(
        changed,
        store,
        () => {},
        () => Promise.resolve(null),
      ),
      null,
    );
    equal(store.row?.logo_path, null);
    const old = await store.claim(source.id, "old");
    await store.claim(source.id, "new");
    equal(
      await store.finish(old!, {
        logoPath: "old.png",
        sourceImageUrl: null,
        refreshAfter: "2099-01-01",
        error: null,
      }),
      false,
    );
  },
);

Deno.test("a concurrent cache miss claims discovery only once", async () => {
  const store = new MemoryStore();
  let release!: (value: LogoAsset) => void;
  let discoveries = 0;
  const pending = new Promise<LogoAsset>((resolve) => {
    release = resolve;
  });
  const discover = () => {
    discoveries++;
    return pending;
  };
  const first = resolveCachedLogo(source, store, () => {}, discover);
  const second = resolveCachedLogo(source, store, () => {}, discover);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  release(asset);
  const results = await Promise.all([first, second]);
  equal(discoveries, 1);
  equal(store.claims, 1);
  ok(results.includes("https://storage.example/stored.png"));
});

Deno.test(
  "source selection and verified overrides require the matching submission destination",
  async () => {
    deepStrictEqual(selectDestination(source), {
      url: "https://example.com/",
      appStoreOnly: false,
    });
    deepStrictEqual(
      selectDestination({ ...source, access_links: { ios: "https://apps.apple.com/app/id123" } }),
      { url: "https://apps.apple.com/app/id123", appStoreOnly: true },
    );
    const own = {
      ...source,
      id: "f4afe8df-d3cb-48cf-b894-c4061fad86f9",
      access_links: { website: "https://test4test.io" },
    };
    const store = new MemoryStore();
    equal(await resolveCachedLogo(own, store, () => {}), "/brand/test4test-mark.svg");
    equal(store.claims, 0);
    equal(
      await resolveCachedLogo(
        { ...own, access_links: { website: "https://changed.example/" } },
        store,
        () => {},
        () => Promise.resolve(null),
      ),
      null,
    );
  },
);
