import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve, sep } from "node:path";

// Keep source/development URLs and the asset bytes unchanged. Only production
// references receive content hashes, covered by the existing immutable /assets rule.
export function versionStaticAssets() {
  let publicRoot;
  const emitted = new Map();
  const rewrite = (code, emit) =>
    code.replace(/(["'])\/(?:fonts|images|videos)\/[^"'\r\n]+\1/g, (match) => {
      const url = match.slice(1, -1);
      const path = resolve(publicRoot, `.${url}`);
      if (!path.startsWith(`${publicRoot}${sep}`) || !existsSync(path)) return match;
      let target = emitted.get(url);
      if (!target && emit) {
        const source = readFileSync(path);
        const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
        const fileName = `assets/static/${hash}-${basename(path)}`;
        emit({ type: "asset", fileName, source });
        target = `/${fileName}`;
        emitted.set(url, target);
      }
      return target ? `${match[0]}${target}${match[0]}` : match;
    });
  return {
    name: "test4test-version-static-assets",
    apply: "build",
    enforce: "pre",
    configResolved(config) {
      publicRoot = resolve(config.publicDir);
    },
    buildStart() {
      emitted.clear();
    },
    transform(code, id) {
      if (id.includes("node_modules") || !/\.(?:[cm]?[jt]sx?|css|json)(?:\?|$)/.test(id)) return;
      const transformed = rewrite(code, (asset) => this.emitFile(asset));
      if (transformed !== code) return { code: transformed, map: null };
    },
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return rewrite(html);
      },
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "assets/static-asset-manifest.json",
        source: JSON.stringify(Object.fromEntries(emitted)),
      });
    },
  };
}
