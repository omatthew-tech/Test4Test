/**
 * Validate quote → screenshot matching against frames stored in Cloudflare R2.
 * URLs are NOT required — only id, testResponseId, and timestampMs matter.
 *
 * Usage (from services/video-processor):
 *   npm run validate:quotes
 *   npm run validate:quotes -- reports/demo-1/test-1/ test-1
 */

import { ListObjectsV2Command } from "@aws-sdk/client-s3";

import { config } from "../src/config.js";
import { r2 } from "../src/r2Client.js";
import {
  buildFrameRanges,
  linkQuotesToFrames,
  matchQuoteToFrame,
} from "../../../src/lib/quoteMatching.js";

const prefixArg = process.argv[2]?.trim();
const responseIdArg = process.argv[3]?.trim();
const normalizedPrefix = (prefixArg || "reports/demo-1/test-1/").replace(/\/?$/, "/");
const testResponseId = responseIdArg || "test-1";

function parseFrameKey(objectKey: string) {
  const fileName = objectKey.split("/").pop() ?? objectKey;
  const match = fileName.match(/^(\d+)-(\d+)ms\.webp$/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    frameIndex: Number.parseInt(match[1], 10),
    timestampMs: Number.parseInt(match[2], 10),
  };
}

async function listR2Frames(prefix: string) {
  const frames: Array<{
    id: string;
    testResponseId: string;
    timestampMs: number;
    frameIndex: number;
    storageKey: string;
  }> = [];

  let continuationToken: string | undefined;

  do {
    const response = await r2.send(
      new ListObjectsV2Command({
        Bucket: config.r2.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key || object.Key.endsWith("/")) {
        continue;
      }

      const parsed = parseFrameKey(object.Key);
      if (!parsed) {
        continue;
      }

      frames.push({
        id: object.Key,
        testResponseId,
        timestampMs: parsed.timestampMs,
        frameIndex: parsed.frameIndex,
        storageKey: object.Key,
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  frames.sort((a, b) => a.timestampMs - b.timestampMs);
  return frames;
}

function formatMs(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

async function main() {
  console.log(`Listing R2 frames in s3://${config.r2.bucketName}/${normalizedPrefix}`);

  const frames = await listR2Frames(normalizedPrefix);
  if (frames.length === 0) {
    throw new Error("No .webp frames found. Check the prefix and CLOUDFLARE_BUCKET_NAME.");
  }

  console.log(`Found ${frames.length} frame(s):\n`);
  for (const frame of frames) {
    console.log(
      `  [${frame.frameIndex}] ${formatMs(frame.timestampMs)} (${frame.timestampMs} ms)  ${frame.storageKey}`,
    );
  }

  const ranges = buildFrameRanges(frames);
  console.log("\nDerived display windows [startMs, endMs):");
  for (const range of ranges) {
    const end =
      range.endMs === Number.POSITIVE_INFINITY
        ? "∞"
        : `${formatMs(range.endMs)} (${range.endMs} ms)`;
    console.log(
      `  ${range.frame.storageKey.split("/").pop()}  [${formatMs(range.startMs)}, ${end})`,
    );
  }

  const sampleQuoteTimes: number[] = [];
  for (let index = 0; index < frames.length; index += 1) {
    const current = frames[index]!;
    const next = frames[index + 1];
    sampleQuoteTimes.push(
      next ? Math.floor((current.timestampMs + next.timestampMs) / 2) : current.timestampMs + 5000,
    );
  }

  console.log("\nMatching sample quotes (midpoints between frames):\n");
  let passed = 0;

  for (const timestampMs of sampleQuoteTimes) {
    const expected = frames.find((frame, index) => {
      const next = frames[index + 1];
      const endMs = next?.timestampMs ?? Number.POSITIVE_INFINITY;
      return timestampMs >= frame.timestampMs && timestampMs < endMs;
    });

    const matched = matchQuoteToFrame({ timestampMs, testResponseId }, frames);
    const ok = matched?.id === expected?.id;
    if (ok) {
      passed += 1;
    }

    console.log(
      `${ok ? "✓" : "✗"} quote @ ${formatMs(timestampMs)} (${timestampMs} ms) → ${matched?.storageKey ?? "null"}`,
    );
    if (!ok) {
      console.log(`    expected → ${expected?.storageKey ?? "null"}`);
    }
  }

  const linked = linkQuotesToFrames(
    sampleQuoteTimes.map((timestampMs, index) => ({
      timestampMs,
      testResponseId,
      text: `Sample quote ${index + 1} at ${formatMs(timestampMs)}`,
    })),
    frames,
  );

  console.log("\nLinked quotes (linkedFrameId = R2 object key):");
  console.log(JSON.stringify(linked, null, 2));
  console.log(`\nResult: ${passed}/${sampleQuoteTimes.length} sample matches passed.`);

  if (passed !== sampleQuoteTimes.length) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
