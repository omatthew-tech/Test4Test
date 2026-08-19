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

// Rasterise the source vectors well above every target size, then downsample, so
// small icons are resolved from a high-resolution render instead of a hinted one.
const density = 576;
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
// semantic.color.background.canvas; iOS and Android composite icon transparency
// against black, so launcher icons ship flattened.
const canvas = "#FFFFFF";

// The mark is wider than it is tall, so square targets letterbox it rather than
// cropping, with padding reserved for the icons that platforms mask.
const icons = [
  { name: "favicon-16x16.png", size: 16, padding: 0, background: transparent },
  { name: "favicon-32x32.png", size: 32, padding: 0, background: transparent },
  { name: "favicon-192x192.png", size: 192, padding: 0.08, background: canvas },
  { name: "favicon-512x512.png", size: 512, padding: 0.08, background: canvas },
  { name: "apple-touch-icon.png", size: 180, padding: 0.1, background: canvas },
];

await mkdir(resolve(outputRoot, "brand"), { recursive: true });

const png = { compressionLevel: 9, effort: 10, palette: true };

await Promise.all([
  ...icons.map(async ({ name, size, padding, background }) => {
    const inner = Math.round(size * (1 - padding * 2));
    const leading = Math.round((size - inner) / 2);
    const trailing = size - inner - leading;
    const pipeline = sharp(mark, { density })
      .resize({
        width: inner,
        height: inner,
        fit: "contain",
        background: transparent,
        kernel: "lanczos3",
      })
      .extend({
        top: leading,
        bottom: trailing,
        left: leading,
        right: trailing,
        background: transparent,
      });

    if (background !== transparent) pipeline.flatten({ background });

    return pipeline.png(png).toFile(resolve(outputRoot, name));
  }),
  sharp(socialCard, { density })
    .resize({ width: 1200, height: 630, kernel: "lanczos3" })
    .flatten({ background: canvas })
    .png(png)
    .toFile(resolve(outputRoot, "brand", "test4test-social-card.png")),
]);

console.log(`Generated ${icons.length + 1} Test4Test brand assets.`);
