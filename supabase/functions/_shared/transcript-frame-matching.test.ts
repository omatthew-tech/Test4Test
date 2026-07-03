import {
  matchTranscriptSegmentToFrame,
  type TranscriptFrameWindow,
} from "./transcript-frame-matching.ts";

function assertMatchedFrame(
  name: string,
  frames: TranscriptFrameWindow[],
  segment: { start_ms: number; end_ms: number },
  expectedId: string,
) {
  const actual = matchTranscriptSegmentToFrame(segment, frames);

  if (actual?.id !== expectedId) {
    throw new Error(`${name}: expected ${expectedId}, got ${actual?.id ?? "null"}`);
  }
}

Deno.test("matches transcript segments to screenshot frame windows", () => {
  const frames: TranscriptFrameWindow[] = [
    { id: "frame-1", test_response_id: "response-1", frame_index: 0, timestamp_ms: 1000 },
    { id: "frame-2", test_response_id: "response-1", frame_index: 1, timestamp_ms: 5000 },
    { id: "frame-3", test_response_id: "response-1", frame_index: 2, timestamp_ms: 10000 },
  ];

  assertMatchedFrame("segment fully inside one frame", frames, { start_ms: 2000, end_ms: 3000 }, "frame-1");
  assertMatchedFrame("segment crosses two frame windows", frames, { start_ms: 4500, end_ms: 6500 }, "frame-2");
  assertMatchedFrame("segment occurs before first frame", frames, { start_ms: 0, end_ms: 500 }, "frame-1");
  assertMatchedFrame("segment occurs after last frame", frames, { start_ms: 12000, end_ms: 13000 }, "frame-3");
});
