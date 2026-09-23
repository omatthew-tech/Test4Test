import sharp from "sharp";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

const directory = resolve("output/share-onboarding");
const frames = await Promise.all(
  ["01-start", "02-nav-hover", "03-share", "04-copy-hover", "05-copied"].map((name) =>
    sharp(resolve(directory, `${name}.png`))
      .resize(1440, 900)
      .extract({ left: 210, top: 0, width: 1000, height: 560 })
      .png()
      .toBuffer(),
  ),
);
const cursor = await sharp(resolve(directory, "cursor.png")).trim().png().toBuffer();
const smallCursor = await sharp(cursor).resize({ height: 27 }).png().toBuffer();
const output = resolve("public/videos/onboarding-share-test.mp4");
const ffmpeg = spawn(
  "ffmpeg",
  [
    "-y",
    "-v",
    "error",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgb24",
    "-video_size",
    "1000x560",
    "-framerate",
    "30",
    "-i",
    "pipe:0",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
const finished = once(ffmpeg, "close");

const ease = (value) => value * value * (3 - 2 * value);
function travel(t, start, duration, from, to, bend) {
  const p = ease(Math.max(0, Math.min(1, (t - start) / duration)));
  return {
    x: from.x + (to.x - from.x) * p,
    y: from.y + (to.y - from.y) * p + Math.sin(p * Math.PI) * bend,
  };
}
// Start at the first Share-page frame; keep the original pointer and camera timing.
for (let frame = 42; frame < 186; frame++) {
  const t = frame / 30;
  const state = t < 1.12 ? 0 : t < 1.4 ? 1 : t < 3.5 ? 2 : t < 3.9 ? 3 : 4;
  const mouse =
    t < 2.5
      ? travel(t, 0.25, 0.87, { x: 948, y: 164 }, { x: 752, y: 40 }, -22)
      : t < 4.25
        ? travel(t, 2.5, 1.0, { x: 752, y: 40 }, { x: 1107, y: 290 }, 35)
        : travel(t, 4.25, 0.5, { x: 1107, y: 290 }, { x: 1132, y: 323 }, 0);
  const pressing = (t >= 1.3 && t < 1.4) || (t >= 3.8 && t < 3.9);
  const scene = await sharp(frames[state])
    .composite([
      {
        input: pressing ? smallCursor : cursor,
        left: Math.round(mouse.x - 210),
        top: Math.round(mouse.y),
      },
    ])
    .png()
    .toBuffer();
  // Follow the pointer into Copy link, then return to the full confirmation card.
  const zoom =
    t < 4.65
      ? ease(Math.max(0, Math.min(1, (t - 2.5) / 1.05)))
      : 1 - ease(Math.max(0, Math.min(1, (t - 4.65) / 0.85)));
  const width = Math.round(1000 - 556 * zoom);
  const height = Math.round(width * 0.56);
  const pixels = await sharp(scene)
    .extract({
      left: Math.round(550 * zoom),
      top: Math.round(184 * zoom),
      width,
      height,
    })
    .resize(1000, 560)
    .removeAlpha()
    .raw()
    .toBuffer();
  if (!ffmpeg.stdin.write(pixels)) await once(ffmpeg.stdin, "drain");
}
ffmpeg.stdin.end();
const [exitCode] = await finished;
if (exitCode !== 0) throw new Error(`FFmpeg failed: ${exitCode}`);
await sharp(frames[4])
  .webp({ quality: 92 })
  .toFile(resolve("public/videos/onboarding-share-test-poster.webp"));
await sharp(frames[4]).png().toFile(resolve(directory, "confirmation.png"));
console.log(output);
