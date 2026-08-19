import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const relativePath = (path) => relative(root, path).replaceAll("\\", "/");

function fail(message) {
  failures.push(message);
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function validateJson(name, validator, value) {
  if (validator(value)) return;
  const details = (validator.errors ?? [])
    .slice(0, 24)
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  fail(`${name} does not match its JSON Schema: ${details}`);
}

function storybookId(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function parseCoverageValues(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sameOrderedValues(actual, expected) {
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}

const designSystemRoot = join(root, "design-system");
const tokensPath = join(designSystemRoot, "tokens", "source", "tokens.json");
const catalogPath = join(designSystemRoot, "components", "catalog.json");
const exceptionsPath = join(designSystemRoot, "exceptions.json");
const provenancePath = join(designSystemRoot, "provenance.json");
const routeStatesPath = join(root, "tests", "playwright", "route-states.json");

const tokens = readJson(tokensPath);
const catalog = readJson(catalogPath);
const exceptions = readJson(exceptionsPath);
const provenance = readJson(provenancePath);
const routeStates = readJson(routeStatesPath);
const tokenMetadata = tokens.$extensions?.["com.test4test.metadata"];

const schemaPaths = {
  tokens: join(designSystemRoot, "tokens", "schema", "tokens.schema.json"),
  component: join(designSystemRoot, "contracts", "component.schema.json"),
  catalog: join(designSystemRoot, "contracts", "catalog.schema.json"),
  exception: join(designSystemRoot, "contracts", "exception.schema.json"),
  provenance: join(designSystemRoot, "contracts", "provenance.schema.json"),
};
const schemas = Object.fromEntries(
  Object.entries(schemaPaths).map(([name, path]) => [name, readJson(path)]),
);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const schema of Object.values(schemas)) ajv.addSchema(schema);

validateJson("tokens/source/tokens.json", ajv.getSchema(schemas.tokens.$id), tokens);
validateJson("components/catalog.json", ajv.getSchema(schemas.catalog.$id), catalog);
validateJson("exceptions.json", ajv.getSchema(schemas.exception.$id), exceptions);
validateJson("provenance.json", ajv.getSchema(schemas.provenance.$id), provenance);

const versions = new Map([
  ["tokens", tokenMetadata?.version],
  ["catalog", catalog.version],
  ["exceptions", exceptions.version],
  ["provenance", provenance.version],
]);
if (new Set(versions.values()).size !== 1) {
  fail(
    `Design-system versions must match: ${[...versions].map(([name, version]) => `${name}=${version}`).join(", ")}.`,
  );
}
if (tokenMetadata?.version !== "1.0.0") {
  fail(`The fully migrated design-system release must be 1.0.0, found ${tokenMetadata?.version}.`);
}
if (tokenMetadata?.format !== "DTCG 2025.10") {
  fail(`Token metadata must identify the stable DTCG 2025.10 format.`);
}

const leaves = new Map();
function collect(node, path = []) {
  if (node && typeof node === "object" && "$value" in node) {
    const id = path.join(".");
    if (leaves.has(id)) fail(`Duplicate token ID: ${id}`);
    leaves.set(id, node);
    return;
  }
  for (const [key, value] of Object.entries(node ?? {})) {
    if (!key.startsWith("$") && key !== "version") collect(value, [...path, key]);
  }
}
collect(tokens);

function isAlias(value) {
  return typeof value === "string" && /^\{[^}]+\}$/.test(value);
}

function isUnitValue(value, allowedUnits) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.value === "number" &&
    allowedUnits.includes(value.unit)
  );
}

function validateDtcgValue(id, token) {
  const value = token.$value;
  if (isAlias(value)) return;
  switch (token.$type) {
    case "color":
      if (
        !value ||
        typeof value !== "object" ||
        value.colorSpace !== "srgb" ||
        !Array.isArray(value.components) ||
        value.components.length !== 3 ||
        value.components.some(
          (component) => typeof component !== "number" || component < 0 || component > 1,
        ) ||
        (value.alpha !== undefined &&
          (typeof value.alpha !== "number" || value.alpha < 0 || value.alpha > 1))
      ) {
        fail(`${id} is not a DTCG sRGB color value.`);
      }
      break;
    case "dimension":
      if (!isUnitValue(value, ["px", "rem"])) {
        fail(`${id} is not a DTCG dimension value.`);
      }
      break;
    case "duration":
      if (!isUnitValue(value, ["ms", "s"])) {
        fail(`${id} is not a DTCG duration value.`);
      }
      break;
    case "fontFamily":
      if (!(
        (typeof value === "string" && value.length > 0) ||
        (Array.isArray(value) &&
          value.length > 0 &&
          value.every((family) => typeof family === "string" && family.length > 0))
      )) {
        fail(`${id} is not a DTCG font-family value.`);
      }
      break;
    case "fontWeight":
      if (!(
        (typeof value === "number" && value >= 1 && value <= 1000) ||
        typeof value === "string"
      )) {
        fail(`${id} is not a DTCG font-weight value.`);
      }
      break;
    case "cubicBezier":
      if (
        !Array.isArray(value) ||
        value.length !== 4 ||
        value.some((coordinate) => typeof coordinate !== "number") ||
        value[0] < 0 ||
        value[0] > 1 ||
        value[2] < 0 ||
        value[2] > 1
      ) {
        fail(`${id} is not a DTCG cubic-Bézier value.`);
      }
      break;
    case "number":
      if (typeof value !== "number") fail(`${id} is not a DTCG number value.`);
      break;
    case "shadow": {
      const shadows = Array.isArray(value) ? value : [value];
      for (const shadow of shadows) {
        if (
          !shadow ||
          typeof shadow !== "object" ||
          !shadow.color ||
          !isUnitValue(shadow.offsetX, ["px", "rem"]) ||
          !isUnitValue(shadow.offsetY, ["px", "rem"]) ||
          !isUnitValue(shadow.blur, ["px", "rem"]) ||
          !isUnitValue(shadow.spread, ["px", "rem"])
        ) {
          fail(`${id} is not a DTCG shadow value.`);
          break;
        }
      }
      break;
    }
    default:
      fail(`${id} uses unsupported DTCG type ${token.$type}.`);
  }
}

for (const [id, token] of leaves) validateDtcgValue(id, token);

function resolveToken(id, chain = []) {
  if (chain.includes(id)) {
    fail(`Circular token alias: ${[...chain, id].join(" -> ")}`);
    return undefined;
  }
  const token = leaves.get(id);
  if (!token) return undefined;
  const alias = typeof token.$value === "string" ? token.$value.match(/^\{([^}]+)\}$/) : null;
  return alias ? resolveToken(alias[1], [...chain, id]) : token.$value;
}

function resolveTokenDefinition(id, chain = []) {
  if (chain.includes(id)) return undefined;
  const token = leaves.get(id);
  if (!token) return undefined;
  const alias = isAlias(token.$value) ? token.$value.match(/^\{([^}]+)\}$/) : null;
  if (alias) return resolveTokenDefinition(alias[1], [...chain, id]);
  return token;
}

function tokenToCss(id) {
  const token = resolveTokenDefinition(id);
  if (!token) return undefined;
  const value = token.$value;
  switch (token.$type) {
    case "color":
      return value.hex;
    case "dimension":
    case "duration":
      return `${value.value}${value.unit}`;
    case "number":
      return `${value}${token.$extensions?.["com.test4test.css"]?.unit ?? ""}`;
    default:
      return undefined;
  }
}

for (const [id, token] of leaves) {
  const alias = typeof token.$value === "string" ? token.$value.match(/^\{([^}]+)\}$/) : null;
  if (!alias) continue;
  const target = leaves.get(alias[1]);
  if (!target) {
    fail(`Token ${id} references unknown alias ${alias[1]}.`);
  } else if (target.$type !== token.$type) {
    fail(`Token ${id} (${token.$type}) aliases ${alias[1]} (${target.$type}).`);
  }
  resolveToken(id);
}

const allowedFamilies = new Set([
  "actions",
  "inputs",
  "navigation",
  "feedback",
  "overlays",
  "data-display",
  "layout",
  "product",
]);
const componentIds = new Set();
const componentValidator = ajv.getSchema(schemas.component.$id);
const publicIndex = readFileSync(join(designSystemRoot, "index.ts"), "utf8");
const storyPaths = new Set();
const visualSpec = readFileSync(join(root, "tests", "playwright", "visual.spec.ts"), "utf8");

for (const component of catalog.components) {
  if (componentIds.has(component.id)) fail(`Duplicate component ID: ${component.id}`);
  componentIds.add(component.id);
  if (!allowedFamilies.has(component.family)) fail(`Unknown family for ${component.id}.`);
  if (component.version !== catalog.version) {
    fail(`${component.id} version ${component.version} does not match catalog ${catalog.version}.`);
  }
  if (component.targetSize < 44) fail(`${component.id} target size is below 44px.`);
  for (const referencedPath of [component.source, component.story]) {
    if (!existsSync(join(root, referencedPath))) {
      fail(`${component.id} references missing file: ${referencedPath}`);
    }
  }

  if (existsSync(join(root, component.source))) {
    const sourceText = readFileSync(join(root, component.source), "utf8");
    const exportPattern = new RegExp(
      `export\\s+(?:function|const|class)\\s+${component.exportName}\\b`,
    );
    if (!exportPattern.test(sourceText)) {
      fail(`${component.id} has no public source export named ${component.exportName}.`);
    }
  }

  const sourceExport = `./${component.source
    .replace(/^design-system\//, "")
    .replace(/\.(?:ts|tsx)$/, "")}`;
  if (!publicIndex.includes(JSON.stringify(sourceExport))) {
    fail(`${component.id} source is not exported by @test4test/design-system: ${sourceExport}`);
  }

  const contractPath = join(designSystemRoot, "components", component.id, "contract.json");
  const guidePath = join(designSystemRoot, "components", component.id, "README.md");
  if (!existsSync(contractPath)) {
    fail(`Missing generated contract for ${component.id}.`);
  } else {
    validateJson(
      `components/${component.id}/contract.json`,
      componentValidator,
      readJson(contractPath),
    );
  }
  if (!existsSync(guidePath)) fail(`Missing generated guide for ${component.id}.`);
  for (const example of component.examples) {
    const examplePath = example.split("#")[0];
    if (!existsSync(join(root, examplePath))) {
      fail(`${component.id} references missing example: ${example}.`);
    }
  }
  storyPaths.add(component.story);
}

for (const component of catalog.components) {
  for (const dependency of component.dependencies ?? []) {
    if (!componentIds.has(dependency))
      fail(`${component.id} has unknown dependency ${dependency}.`);
  }
}

for (const storyPath of storyPaths) {
  if (!existsSync(join(root, storyPath))) continue;
  const story = readFileSync(join(root, storyPath), "utf8");
  if (!/\bplay\s*:/.test(story)) {
    fail(`${storyPath} has no interaction test (Storybook play function).`);
  }
}

for (const component of catalog.components) {
  const storyPath = join(root, component.story);
  if (!existsSync(storyPath)) continue;
  const story = readFileSync(storyPath, "utf8");
  const exportPattern = new RegExp(`export\\s+const\\s+${component.storyExport}\\b`);
  const match = exportPattern.exec(story);
  if (!match) {
    fail(`${component.id} has no story export named ${component.storyExport}.`);
    continue;
  }
  const nextExportIndex = story.indexOf("\nexport const ", match.index + match[0].length);
  const storyBlock = story.slice(match.index, nextExportIndex < 0 ? undefined : nextExportIndex);
  if (!/\bplay\s*:/.test(storyBlock)) {
    fail(`${component.id} story ${component.storyExport} has no interaction test.`);
  }

  const coveragePattern = new RegExp(
    `// @test4test-coverage ${component.id.replaceAll("-", "\\-")} \\| sizes: ([^|]+?) \\| variants: ([^|]+?) \\| states: ([^\\r\\n]+)\\r?\\nexport\\s+const\\s+${component.storyExport}\\b`,
  );
  const coverage = coveragePattern.exec(story);
  if (!coverage) {
    fail(`${component.id} story ${component.storyExport} has no explicit coverage annotation.`);
  } else {
    const dimensions = [
      ["sizes", parseCoverageValues(coverage[1]), component.sizes],
      ["variants", parseCoverageValues(coverage[2]), component.variants],
      ["states", parseCoverageValues(coverage[3]), component.states],
    ];
    for (const [dimension, actual, expected] of dimensions) {
      if (!sameOrderedValues(actual, expected)) {
        fail(
          `${component.id} Storybook ${dimension} coverage does not match its catalog contract: expected ${expected.join(", ")}; found ${actual.join(", ")}.`,
        );
      }
    }
  }

  const title = story.match(/\btitle:\s*"([^"]+)"/)?.[1];
  if (!title) {
    fail(`${component.story} has no static Storybook title.`);
  } else {
    const visualStoryId = `${storybookId(title)}--${storybookId(component.storyExport)}`;
    if (!visualSpec.includes(JSON.stringify(visualStoryId))) {
      fail(
        `${component.id} contract story ${visualStoryId} is not included in visual regression coverage.`,
      );
    }
  }
}

const today = new Date().toISOString().slice(0, 10);
const exceptionIds = new Set(exceptions.exceptions.map((exception) => exception.id));
for (const exception of exceptions.exceptions) {
  if (exception.expires < today) {
    fail(`Expired design-system exception: ${exception.id}`);
  }
}
if (!exceptionIds.has("static-brand-platform-formats")) {
  fail("Static browser and SVG brand formats require the static-brand-platform-formats exception.");
}

const requiredArtifacts = [
  "README.md",
  "CHANGELOG.md",
  "specification.md",
  "foundations/color.md",
  "foundations/typography.md",
  "foundations/layout.md",
  "foundations/motion.md",
  "foundations/iconography.md",
  "foundations/accessibility.md",
  "foundations/content.md",
  "foundations/release-audit.md",
  "patterns/application-shell.md",
  "patterns/forms.md",
  "patterns/async-states.md",
  "patterns/product-workflows.md",
  "decisions/0001-adopt-test4test-design-system.md",
  "decisions/0002-runtime-architecture.md",
  "examples/page-composition.md",
  "visual-baselines/README.md",
  "provenance.json",
  "exceptions.json",
];
for (const artifact of requiredArtifacts) {
  if (!existsSync(join(designSystemRoot, artifact))) {
    fail(`Missing required design-system artifact: design-system/${artifact}`);
  }
}

for (const markdownPath of walk(designSystemRoot).filter((path) => extname(path) === ".md")) {
  const source = readFileSync(markdownPath, "utf8");
  const links = source.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g);
  for (const match of links) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    if (!rawTarget || rawTarget.startsWith("#") || /^(?:https?:|mailto:|tel:)/i.test(rawTarget)) {
      continue;
    }
    const fileTarget = decodeURIComponent(rawTarget.split("#")[0]);
    const resolvedTarget = fileTarget.startsWith("/")
      ? join(root, fileTarget.slice(1))
      : resolve(dirname(markdownPath), fileTarget);
    if (!existsSync(resolvedTarget)) {
      fail(`${relativePath(markdownPath)} links to missing file: ${rawTarget}`);
    }
  }
}

const specificationHash = createHash("sha256")
  .update(readFileSync(join(designSystemRoot, "specification.md")))
  .digest("hex");
if (provenance.sourceSha256 !== specificationHash) {
  fail("provenance.json does not match the canonical specification SHA-256.");
}

const generatedCheck = spawnSync(
  process.execPath,
  [join(root, "scripts", "generate-design-system.mjs"), "--check"],
  { cwd: root, encoding: "utf8" },
);
if (generatedCheck.status !== 0) {
  fail(
    generatedCheck.stderr.trim() ||
      generatedCheck.stdout.trim() ||
      "Generated artifacts are stale.",
  );
}

const officialGeistArtifacts = [
  [
    join(root, "public", "fonts", "geist", "GeistVF.woff2"),
    join(root, "node_modules", "geist", "dist", "fonts", "geist-sans", "Geist-Variable.woff2"),
  ],
  [
    join(root, "public", "fonts", "geist", "GeistMonoVF.woff2"),
    join(root, "node_modules", "geist", "dist", "fonts", "geist-mono", "GeistMono-Variable.woff2"),
  ],
  [
    join(root, "public", "fonts", "geist", "LICENSE.txt"),
    join(root, "node_modules", "geist", "LICENSE.txt"),
  ],
];
for (const [repositoryArtifact, officialArtifact] of officialGeistArtifacts) {
  if (!existsSync(repositoryArtifact) || !existsSync(officialArtifact)) {
    fail(`Missing official Geist artifact pair: ${relativePath(repositoryArtifact)}.`);
    continue;
  }
  const repositoryHash = createHash("sha256")
    .update(readFileSync(repositoryArtifact))
    .digest("hex");
  const officialHash = createHash("sha256").update(readFileSync(officialArtifact)).digest("hex");
  if (repositoryHash !== officialHash) {
    fail(`${relativePath(repositoryArtifact)} does not match the installed official Geist asset.`);
  }
}
const baseStyles = readFileSync(join(designSystemRoot, "styles", "base.css"), "utf8");
if ((baseStyles.match(/font-display:\s*swap/g) ?? []).length !== 2) {
  fail("Both self-hosted Geist variable faces must use font-display: swap.");
}

const routeStateNames = new Set();
const routeStatePaths = new Set();
const registeredRoutePatterns = new Set();
for (const routeState of routeStates) {
  if (
    !routeState ||
    typeof routeState.name !== "string" ||
    typeof routeState.routePattern !== "string" ||
    typeof routeState.path !== "string" ||
    !routeState.path.startsWith("/") ||
    (routeState.redirectOnly !== undefined && typeof routeState.redirectOnly !== "boolean")
  ) {
    fail(
      "Each tests/playwright/route-states.json entry requires name, routePattern, path, and an optional boolean redirectOnly flag.",
    );
    continue;
  }
  if (routeStateNames.has(routeState.name)) {
    fail(`Duplicate route-state name: ${routeState.name}.`);
  }
  if (routeStatePaths.has(routeState.path)) {
    fail(`Duplicate route-state path: ${routeState.path}.`);
  }
  routeStateNames.add(routeState.name);
  routeStatePaths.add(routeState.path);
  registeredRoutePatterns.add(routeState.routePattern);
}

const appSource = readFileSync(join(root, "src", "App.tsx"), "utf8");
const applicationRoutePatterns = new Set(
  [...appSource.matchAll(/<Route\b[^>]*?\bpath="([^"]+)"/g)].map((match) => match[1]),
);
for (const routePattern of applicationRoutePatterns) {
  if (!registeredRoutePatterns.has(routePattern)) {
    fail(`Application route ${routePattern} has no deterministic route state.`);
  }
}
for (const routePattern of registeredRoutePatterns) {
  if (!applicationRoutePatterns.has(routePattern)) {
    fail(`Route state references unknown application route ${routePattern}.`);
  }
}
for (const suite of ["a11y.spec.ts", "visual.spec.ts"]) {
  const suiteSource = readFileSync(join(root, "tests", "playwright", suite), "utf8");
  if (!suiteSource.includes('from "./route-states.json" with { type: "json" }')) {
    fail(`tests/playwright/${suite} must consume the canonical route-state registry.`);
  }
}

const consumerFiles = [
  ...walk(join(root, "src")),
  ...walk(join(root, "tests")),
  ...walk(join(root, ".storybook")),
  ...walk(join(designSystemRoot, "stories")),
].filter((path) => [".ts", ".tsx", ".css"].includes(extname(path)));

for (const path of consumerFiles) {
  const source = readFileSync(path, "utf8");
  if (/from\s+["']@test4test\/design-system\//.test(source)) {
    fail(`${relativePath(path)} deep-imports @test4test/design-system internals.`);
  }
  if (
    /(?:from\s+|import\s+(?:\(\s*)?|@import\s+)["'][^"']*design-system[\\/](?:components|tokens|styles)(?:[\\/][^"']*)?["']/.test(
      source,
    )
  ) {
    fail(`${relativePath(path)} imports design-system internals instead of the public barrel.`);
  }
}

const styleFiles = [
  ...walk(join(designSystemRoot, "components")),
  ...walk(join(designSystemRoot, "styles")),
  ...walk(join(root, "src")),
].filter((path) => [".css", ".tsx"].includes(extname(path)));

const ignoredFiles = new Set([join(designSystemRoot, "tokens", "generated", "tokens.css")]);
const rawColorPattern = /(?<![\w-])#[0-9a-fA-F]{3,8}\b|rgba?\s*\(|hsla?\s*\(/g;
const rawDimensionPattern = /(?<![\w-])-?\d*\.?\d+(?:px|rem|em|ms|s|vh|vw|dvh|dvw)\b/g;
const tokenColorValues = new Set(
  [...leaves]
    .filter(([, token]) => token.$type === "color")
    .map(([id]) => tokenToCss(id)?.toUpperCase())
    .filter(Boolean),
);
const staticBrandFiles = [
  join(root, "index.html"),
  join(root, "public", "site.webmanifest"),
  join(root, "public", "favicon.svg"),
  join(root, "public", "brand", "test4test-mark.svg"),
  join(root, "public", "brand", "test4test-social-card.svg"),
];
for (const path of staticBrandFiles) {
  if (!existsSync(path)) {
    fail(`Missing static brand artifact: ${relativePath(path)}.`);
    continue;
  }
  const source = readFileSync(path, "utf8");
  const unrecognizedColors = [...new Set(source.match(rawColorPattern) ?? [])].filter(
    (color) => !tokenColorValues.has(color.toUpperCase()),
  );
  if (unrecognizedColors.length) {
    fail(
      `${relativePath(path)} serializes colors that are not design tokens: ${unrecognizedColors.join(", ")}.`,
    );
  }
}

const primaryBrandColor = tokenToCss("semantic.color.action.primary");
const canvasColor = tokenToCss("semantic.color.background.canvas");
const manifest = readJson(join(root, "public", "site.webmanifest"));
if (manifest.theme_color !== primaryBrandColor) {
  fail(`site.webmanifest theme_color must equal semantic.color.action.primary.`);
}
if (manifest.background_color !== canvasColor) {
  fail(`site.webmanifest background_color must equal semantic.color.background.canvas.`);
}
const themeColorMatch = readFileSync(join(root, "index.html"), "utf8").match(
  /<meta\s+name="theme-color"\s+content="([^"]+)"\s*\/?>/,
);
if (themeColorMatch?.[1] !== primaryBrandColor) {
  fail(`index.html theme-color must equal semantic.color.action.primary.`);
}

const approvedBreakpoints = new Set(
  [...leaves.entries()]
    .filter(([id]) => id.startsWith("primitive.breakpoint."))
    .map(([id]) => tokenToCss(id)),
);
const approvedIconSizes = new Set(
  ["small", "medium", "large"].map((size) =>
    tokenToCss(`semantic.size.icon.${size}`)?.replace(/px$/, ""),
  ),
);

for (const path of styleFiles) {
  if (ignoredFiles.has(path)) continue;
  const source = readFileSync(path, "utf8");
  const colorMatches = source.match(rawColorPattern);
  if (colorMatches?.length) {
    fail(
      `${relativePath(path)} contains raw color values: ${[...new Set(colorMatches)]
        .slice(0, 5)
        .join(", ")}`,
    );
  }

  if (extname(path) === ".css") {
    const rawDimensions = [];
    for (const line of source.split(/\r?\n/)) {
      for (const match of line.matchAll(rawDimensionPattern)) {
        if (line.includes("@media") && approvedBreakpoints.has(match[0])) continue;
        rawDimensions.push(match[0]);
      }
    }
    if (rawDimensions.length) {
      fail(
        `${relativePath(path)} contains raw visual dimensions: ${[...new Set(rawDimensions)]
          .slice(0, 8)
          .join(", ")}`,
      );
    }
    if (/(?:linear|radial|conic)-gradient\s*\(/.test(source)) {
      fail(`${relativePath(path)} contains a prohibited decorative gradient.`);
    }
  }

  if (extname(path) === ".css" && source.includes("--ds-primitive-")) {
    fail(
      `${relativePath(path)} consumes primitive tokens; React UI must use semantic or component tokens.`,
    );
  }

  if (extname(path) === ".tsx") {
    for (const match of source.matchAll(/\bsize=\{(\d+(?:\.\d+)?)\}/g)) {
      if (!approvedIconSizes.has(match[1])) {
        fail(
          `${relativePath(path)} uses unsupported icon size ${match[1]}; use the 16, 20, or 24 px semantic icon tokens.`,
        );
      }
    }
    if (/\bstrokeWidth=\{\d+(?:\.\d+)?\}/.test(source)) {
      fail(
        `${relativePath(path)} overrides Lucide's canonical 2 px stroke; use the standard icon style.`,
      );
    }

    const lines = source.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!/\bstyle\s*=\s*(?:\{|["'])/.test(lines[index])) continue;
      const context = lines.slice(Math.max(0, index - 6), index + 1).join("\n");
      const marker = context.match(/ds-exception:\s*([a-z0-9-]+)/);
      if (!marker) {
        fail(
          `${relativePath(path)}:${index + 1} has an inline style without a registered ds-exception marker.`,
        );
      } else if (!exceptionIds.has(marker[1])) {
        fail(
          `${relativePath(path)}:${index + 1} references unknown design-system exception ${marker[1]}.`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Design-system validation failed with ${failures.length} issue(s):`);
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(
  `Validated ${leaves.size} tokens, ${componentIds.size} components and Storybook coverage contracts, ${styleFiles.length} UI files, ${routeStates.length} route states, schemas, documentation, static brand artifacts, exceptions, and public imports.`,
);
