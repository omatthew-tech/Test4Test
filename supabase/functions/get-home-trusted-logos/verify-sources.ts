// Explicit manual verification only. Automated tests use the saved image fixtures.
import { fetchPublicResource } from "./network.ts";
import { validateLogo } from "./discovery.ts";
import { verifiedSources } from "./sources.ts";

const names = ["test4test", "vidsyndicate", "pinch", "akari", "mytinerary", "loventro"];
await Deno.mkdir("public/images/trusted-by", { recursive: true });
for (const [index, source] of verifiedSources.entries()) {
  if (source.local) continue;
  const asset = validateLogo(
    await fetchPublicResource(source.imageUrl, AbortSignal.timeout(15_000)),
  );
  const path = `public/images/trusted-by/${names[index]}.${asset.extension}`;
  await Deno.writeFile(path, asset.bytes);
  console.log(`${names[index]}: ${asset.contentType}, ${asset.bytes.length} bytes, saved ${path}`);
}
