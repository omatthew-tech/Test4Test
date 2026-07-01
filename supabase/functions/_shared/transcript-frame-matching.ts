export interface TranscriptFrameWindow {
  id: string;
  test_response_id: string;
  frame_index: number;
  timestamp_ms: number;
}

export interface TranscriptSegmentWindow {
  start_ms: number;
  end_ms: number;
}

export function groupTranscriptFramesByResponse(frames: TranscriptFrameWindow[]) {
  const groups = new Map<string, TranscriptFrameWindow[]>();

  for (const frame of frames) {
    const existing = groups.get(frame.test_response_id);
    if (existing) {
      existing.push(frame);
    } else {
      groups.set(frame.test_response_id, [frame]);
    }
  }

  for (const group of groups.values()) {
    group.sort((first, second) => first.timestamp_ms - second.timestamp_ms);
  }

  return groups;
}

export function matchTranscriptSegmentToFrame<TFrame extends TranscriptFrameWindow>(
  segment: TranscriptSegmentWindow,
  frames: TFrame[],
) {
  if (frames.length === 0) {
    return null;
  }

  const segmentStart = segment.start_ms;
  const segmentEnd = Math.max(segment.end_ms, segment.start_ms + 1);
  let bestFrame: TFrame | null = null;
  let bestOverlap = 0;

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]!;
    const nextFrame = frames[index + 1];
    const frameStart = frame.timestamp_ms;
    const frameEnd = nextFrame?.timestamp_ms ?? Number.POSITIVE_INFINITY;
    const overlap = Math.max(0, Math.min(segmentEnd, frameEnd) - Math.max(segmentStart, frameStart));

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestFrame = frame;
    }
  }

  if (bestFrame) {
    return bestFrame;
  }

  const firstFrame = frames[0]!;
  if (segmentEnd <= firstFrame.timestamp_ms) {
    return firstFrame;
  }

  let latestFrame = firstFrame;
  for (const frame of frames) {
    if (frame.timestamp_ms <= segmentStart) {
      latestFrame = frame;
    } else {
      break;
    }
  }

  return latestFrame;
}
