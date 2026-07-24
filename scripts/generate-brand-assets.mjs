import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mark = resolve(root, "public", "brand", "test4test-mark.svg");
const socialCard = resolve(root, "public", "brand", "test4test-social-card.svg");
const outputRoot = process.env.TEST4TEST_BRAND_OUTPUT_DIR
  ? resolve(process.env.TEST4TEST_BRAND_OUTPUT_DIR)
  : resolve(root, "public");

const outputs = [
  [mark, resolve(outputRoot, "favicon-16x16.png"), 16, 16],
  [mark, resolve(outputRoot, "favicon-32x32.png"), 32, 32],
  [mark, resolve(outputRoot, "favicon-192x192.png"), 192, 192],
  [mark, resolve(outputRoot, "favicon-512x512.png"), 512, 512],
  [mark, resolve(outputRoot, "apple-touch-icon.png"), 180, 180],
  [socialCard, resolve(outputRoot, "brand", "test4test-social-card.png"), 1200, 630],
];

await Promise.all(
  [...new Set(outputs.map(([, output]) => dirname(output)))].map((directory) =>
    mkdir(directory, { recursive: true }),
  ),
);

await Promise.all(
  outputs.map(([input, output, width, height]) =>
    sharp(input).resize({ width, height }).png().toFile(output),
  ),
);

console.log(`Generated ${outputs.length} Test4Test brand assets.`);
