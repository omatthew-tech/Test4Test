import { deepStrictEqual, equal, rejects, throws } from "node:assert/strict";
import {
  isPublicAddress,
  normalizeSourceUrl,
  resolvePublicAddress,
  followPublicRedirects,
  createPinnedConnector,
} from "./network.ts";
import type { lookup } from "node:dns/promises";
import type { buildConnector } from "undici";

Deno.test(
  "pinned HTTPS uses the validated IP while preserving the original TLS server name",
  () => {
    const connections: buildConnector.Options[] = [];
    const connect: buildConnector.connector = (options, callback) => {
      connections.push(options);
      callback(new Error("test socket"), null);
    };
    let failures = 0;
    for (const address of ["8.8.8.8", "2606:4700:4700::1111"]) {
      const pinned = createPinnedConnector(
        new URL("https://example.com/icon.png"),
        address,
        connect,
      );
      pinned({ hostname: "example.com", protocol: "https:", port: "443" }, (error, socket) => {
        equal(error?.message, "test socket");
        equal(socket, null);
        failures++;
      });
      equal(connections.at(-1)?.hostname, address);
      equal(connections.at(-1)?.servername, "example.com");
      equal(connections.at(-1)?.port, "443");
    }
    equal(failures, 2);
    throws(() => createPinnedConnector(new URL("https://example.com"), "127.0.0.1", connect));
    equal(connections.length, 2);
  },
);

Deno.test("public address checks cover private, encoded, mapped and IPv6 destinations", () => {
  for (const address of [
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2002:7f00:1::",
  ])
    equal(isPublicAddress(address), false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
    equal(isPublicAddress(address), true, address);
  for (const url of [
    "http://2130706433",
    "http://0x7f000001",
    "http://[::1]",
    "http://metadata.internal",
    "https://localhost",
    "https://example.com:8080",
    "https://name:secret@example.com",
    "file:///tmp/icon",
    "data:image/png;base64,AA",
  ])
    throws(() => normalizeSourceUrl(url), url);
  equal(normalizeSourceUrl("vidshare.us"), "https://vidshare.us/");
  equal(normalizeSourceUrl("https://example.com/try?q=1#test"), "https://example.com/try?q=1");
});

Deno.test("DNS rejects mixed public and private answers, pins one validated address", async () => {
  const mixed = (() =>
    Promise.resolve([
      { address: "1.1.1.1", family: 4 },
      { address: "::1", family: 6 },
    ])) as unknown as typeof lookup;
  await rejects(() => resolvePublicAddress("example.com", mixed));
  const safe = (() =>
    Promise.resolve([{ address: "8.8.8.8", family: 4 }])) as unknown as typeof lookup;
  deepStrictEqual(await resolvePublicAddress("example.com", safe), {
    address: "8.8.8.8",
    family: 4,
  });
});

Deno.test(
  "redirects resolve relative URLs and reject downgrade/private targets and fourth hop",
  async () => {
    const seen: string[] = [];
    const result = await followPublicRedirects(
      "https://example.com/old",
      new AbortController().signal,
      (url) => {
        seen.push(url.href);
        return Promise.resolve({
          url: url.href,
          status: seen.length === 1 ? 302 : 200,
          location: "/new",
          contentType: "text/html",
          bytes: new Uint8Array(),
        });
      },
    );
    equal(result.url, "https://example.com/new");
    deepStrictEqual(seen, ["https://example.com/old", "https://example.com/new"]);
    for (const location of [
      "http://example.com/",
      "http://127.0.0.1/",
      "https://[::ffff:127.0.0.1]/",
      "https://user:password@example.com/",
    ]) {
      let calls = 0;
      await rejects(() =>
        followPublicRedirects("https://example.com", new AbortController().signal, (url) => {
          calls++;
          return Promise.resolve({
            url: url.href,
            status: 302,
            location,
            contentType: "",
            bytes: new Uint8Array(),
          });
        }),
      );
      equal(calls, 1);
    }
    let calls = 0;
    await rejects(() =>
      followPublicRedirects("https://example.com", new AbortController().signal, (url) => {
        calls++;
        return Promise.resolve({
          url: url.href,
          status: 302,
          location: "/loop",
          contentType: "",
          bytes: new Uint8Array(),
        });
      }),
    );
    equal(calls, 4);
  },
);
