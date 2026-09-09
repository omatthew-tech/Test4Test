import { equal, deepStrictEqual } from "node:assert/strict";
import { createHandler } from "./handler.ts";

const id = "10000000-0000-0000-0000-000000000001";
const other = "10000000-0000-0000-0000-000000000002";
const request = (body: unknown) =>
  new Request("https://test.example/", { method: "POST", body: JSON.stringify(body) });

Deno.test(
  "public endpoint validates IDs before reading destinations or fetching images",
  async () => {
    let sourceReads = 0;
    const handler = createHandler({
      eligibleIds: () => Promise.resolve([id]),
      sources: () => {
        sourceReads++;
        return Promise.resolve([]);
      },
      resolve: () => Promise.resolve(null),
    });
    for (const body of [{ submissionIds: [id, other] }, { submissionIds: [other] }])
      equal((await handler(request(body))).status, 403);
    for (const body of [
      { submissionIds: Array(7).fill(id) },
      { submissionIds: ["https://example.com"] },
      { submissionIds: [id], url: "https://example.com" },
      null,
      { submissionIds: "bad" },
      { submissionIds: [id.repeat(200)] },
    ])
      equal((await handler(request(body))).status, 400);
    equal(sourceReads, 0);
    equal((await handler(new Request("https://test.example/", { method: "OPTIONS" }))).status, 204);
    equal((await handler(new Request("https://test.example/"))).status, 405);
  },
);

Deno.test(
  "returns only requested IDs and image URLs, tolerates individual failures and deduplicates",
  async () => {
    const handler = createHandler({
      eligibleIds: () => Promise.resolve([id, other]),
      sources: (ids) =>
        Promise.resolve(
          ids.map((id) => ({
            id,
            access_url: "https://example.com/private-path",
            access_links: {},
            product_types: ["website"],
          })),
        ),
      resolve: (source) =>
        source.id === id
          ? Promise.resolve("https://storage.example/logo.png")
          : Promise.reject(new Error("private backend details")),
    });
    const response = await handler(request({ submissionIds: [id, other, id] }));
    equal(response.status, 200);
    deepStrictEqual(await response.json(), {
      logos: [
        { submissionId: id, logoUrl: "https://storage.example/logo.png" },
        { submissionId: other, logoUrl: null },
      ],
    });
  },
);
