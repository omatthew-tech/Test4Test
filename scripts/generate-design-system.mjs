import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tokensPath = join(root, "design-system", "tokens", "source", "tokens.json");
const catalogPath = join(root, "design-system", "components", "catalog.json");
const checkOnly = process.argv.includes("--check");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const tokens = readJson(tokensPath);
const catalog = readJson(catalogPath);
const tokenVersion = tokens.$extensions["com.test4test.metadata"].version;

function collectTokenLeaves(node, path = [], leaves = new Map()) {
  if (node && typeof node === "object" && "$value" in node) {
    leaves.set(path.join("."), { type: node.$type, value: node.$value });
    return leaves;
  }

  for (const [key, value] of Object.entries(node ?? {})) {
    if (!key.startsWith("$") && key !== "version") {
      collectTokenLeaves(value, [...path, key], leaves);
    }
  }

  return leaves;
}

const leaves = collectTokenLeaves(tokens);

function resolveValue(path, chain = []) {
  if (chain.includes(path)) {
    throw new Error(`Circular token alias: ${[...chain, path].join(" -> ")}`);
  }

  const token = leaves.get(path);
  if (!token) {
    throw new Error(`Unknown token alias: ${path}`);
  }

  const aliasMatch = typeof token.value === "string" ? token.value.match(/^\{([^}]+)\}$/) : null;
  return aliasMatch ? resolveValue(aliasMatch[1], [...chain, path]) : token.value;
}

function resolveDefinition(path, chain = []) {
  if (chain.includes(path)) {
    throw new Error(`Circular token alias: ${[...chain, path].join(" -> ")}`);
  }

  const token = leaves.get(path);
  if (!token) {
    throw new Error(`Unknown token alias: ${path}`);
  }

  const aliasMatch = typeof token.value === "string" ? token.value.match(/^\{([^}]+)\}$/) : null;
  if (aliasMatch) return resolveDefinition(aliasMatch[1], [...chain, path]);
  const sourceToken = path.split(".").reduce((node, segment) => node?.[segment], tokens);
  return {
    type: token.type,
    value: token.value,
    extensions: sourceToken?.$extensions,
  };
}

function formatColor(value) {
  if (value.hex) return value.hex;
  const channels = value.components.map((channel) => Math.round(channel * 255));
  if (value.alpha === undefined || value.alpha === 1) {
    return `rgb(${channels.join(", ")})`;
  }
  return `rgba(${channels.join(", ")}, ${value.alpha})`;
}

function formatCssValue(definition) {
  const { type, value, extensions } = definition;
  switch (type) {
    case "color":
      return formatColor(value);
    case "dimension":
    case "duration":
      return `${value.value}${value.unit}`;
    case "number": {
      const unit = extensions?.["com.test4test.css"]?.unit ?? "";
      return `${value}${unit}`;
    }
    case "fontFamily":
      return value
        .map((family) =>
          ["serif", "sans-serif", "monospace", "system-ui", "cursive", "fantasy"].includes(family)
            ? family
            : JSON.stringify(family),
        )
        .join(", ");
    case "fontWeight":
      return String(value);
    case "cubicBezier":
      return `cubic-bezier(${value.join(", ")})`;
    case "shadow": {
      const shadows = Array.isArray(value) ? value : [value];
      return shadows
        .map(
          (shadow) =>
            `${shadow.inset ? "inset " : ""}${formatCssValue({
              type: "dimension",
              value: shadow.offsetX,
            })} ${formatCssValue({
              type: "dimension",
              value: shadow.offsetY,
            })} ${formatCssValue({
              type: "dimension",
              value: shadow.blur,
            })} ${formatCssValue({
              type: "dimension",
              value: shadow.spread,
            })} ${formatColor(shadow.color)}`,
        )
        .join(", ");
    }
    default:
      throw new Error(`Cannot format token type ${type} for CSS.`);
  }
}

const flatTokens = [...leaves.entries()]
  .map(([path, token]) => {
    const definition = resolveDefinition(path);
    return {
      path,
      type: token.type,
      value: formatCssValue(definition),
      dtcgValue: resolveValue(path),
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const tokenHash = createHash("sha256").update(JSON.stringify(tokens)).digest("hex");

const figmaSupportedTypes = new Set([
  "color",
  "dimension",
  "duration",
  "fontFamily",
  "fontWeight",
  "number",
  "string",
]);

function convertTokenForFigma(token, path) {
  if (!figmaSupportedTypes.has(token.$type)) return undefined;

  const alias = typeof token.$value === "string" && /^\{[^}]+\}$/.test(token.$value);
  const converted = { ...token };

  if (token.$type === "fontWeight") {
    if (!alias && typeof token.$value !== "number") {
      throw new Error(`Figma requires numeric font weights: ${path}`);
    }
    converted.$type = "number";
    return converted;
  }

  if (token.$type === "fontFamily" && !alias) {
    const family = Array.isArray(token.$value) ? token.$value[0] : token.$value;
    if (typeof family !== "string" || family.length === 0) {
      throw new Error(`Figma requires one font family name: ${path}`);
    }
    converted.$value = family;
    return converted;
  }

  if (token.$type === "dimension") {
    const definition = resolveDefinition(path);
    if (definition.value.unit !== "px") {
      throw new Error(`Figma only imports px dimensions: ${path}`);
    }
    return converted;
  }

  if (token.$type === "duration" && !alias) {
    if (token.$value.unit === "ms") {
      converted.$value = { value: token.$value.value / 1000, unit: "s" };
    } else if (token.$value.unit !== "s") {
      throw new Error(`Figma only imports second-based durations: ${path}`);
    }
  }

  return converted;
}

function createFigmaTokenDocument(node, path = []) {
  if (node && typeof node === "object" && "$value" in node) {
    return convertTokenForFigma(node, path.join("."));
  }

  const converted = {};
  for (const [key, value] of Object.entries(node ?? {})) {
    if (key.startsWith("$")) {
      converted[key] = value;
      continue;
    }

    const child = createFigmaTokenDocument(value, [...path, key]);
    if (child !== undefined && Object.keys(child).length > 0) converted[key] = child;
  }
  return converted;
}

const figmaTokens = createFigmaTokenDocument(tokens);
figmaTokens.$description =
  "Generated Test4Test tokens for Figma's native DTCG variable importer. Do not edit manually.";
figmaTokens.$extensions = {
  ...figmaTokens.$extensions,
  "com.test4test.figma": {
    collection: "Test4Test Design System",
    mode: "Default",
    source: "design-system/tokens/source/tokens.json",
    sourceSha256: tokenHash,
    conversions: {
      fontFamily: "First family in the canonical fallback stack",
      fontWeight: "DTCG fontWeight converted to a Figma number variable",
      duration: "Milliseconds converted to seconds",
    },
    excludedSourceTypes: ["cubicBezier", "shadow"],
  },
};
const figmaJson = `${JSON.stringify(figmaTokens, null, 2)}\n`;

const generatedHeader = `/* Generated from design-system/tokens/source/tokens.json.\n * Source SHA-256: ${tokenHash}\n * Do not edit manually.\n */`;

const css = `${generatedHeader}\n:root {\n${flatTokens
  .map(({ path, value }) => `  --ds-${path.replaceAll(".", "-")}: ${value};`)
  .join("\n")}\n}\n`;

const ts = `${generatedHeader}\nexport const tokenSourceHash = ${JSON.stringify(tokenHash)} as const;\n\nexport const tokens = ${JSON.stringify(
  Object.fromEntries(
    flatTokens.map(({ path, type, value, dtcgValue }) => [path, { type, value, dtcgValue }]),
  ),
  null,
  2,
)} as const;\n\nexport type TokenPath = keyof typeof tokens;\nexport type TokenValue<Path extends TokenPath> = (typeof tokens)[Path]["value"];\n`;

const manifest = `${JSON.stringify(
  {
    name: "Test4Test Design System",
    version: tokenVersion,
    format: "DTCG 2025.10",
    source: relative(root, tokensPath).replaceAll("\\", "/"),
    sourceSha256: tokenHash,
    outputs: [
      "design-system/tokens/generated/tokens.css",
      "design-system/tokens/generated/tokens.ts",
      "design-system/tokens/generated/figma/default.json",
    ],
  },
  null,
  2,
)}\n`;

const outputs = new Map([
  [join(root, "design-system", "tokens", "generated", "tokens.css"), css],
  [join(root, "design-system", "tokens", "generated", "tokens.ts"), ts],
  [join(root, "design-system", "tokens", "generated", "figma", "default.json"), figmaJson],
  [join(root, "design-system", "tokens", "generated", "manifest.json"), manifest],
]);

for (const component of catalog.components) {
  const componentDirectory = join(root, "design-system", "components", component.id);
  const contractPath = join(componentDirectory, "contract.json");
  const readmePath = join(componentDirectory, "README.md");
  const contract = {
    ...component,
    $schema: "../../contracts/component.schema.json",
  };
  const readme = `# ${component.name}\n\n${component.description}\n\n- Family: ${component.family}\n- Lifecycle: ${component.lifecycle}\n- Version: ${component.version}\n- Public export: \`${component.exportName}\`\n- Source: \`${component.source}\`\n- Story: \`${component.story}#${component.storyExport}\`\n- Control mode: ${component.controlMode}\n\n## Public API\n\n- Sizes: ${component.sizes.map((item) => `\`${item}\``).join(", ")}\n- Variants: ${component.variants.map((item) => `\`${item}\``).join(", ")}\n- States: ${component.states.map((item) => `\`${item}\``).join(", ")}\n- Accessible name: ${component.accessibleName}\n\n## Accessibility contract\n\n${component.semantics.map((item) => `- ${item}`).join("\n")}\n${
    component.keyboard.length > 0
      ? `\n## Keyboard\n\n${component.keyboard.map((item) => `- ${item}`).join("\n")}\n`
      : ""
  }\nMinimum interactive target: ${component.targetSize} × ${component.targetSize} px.\n\n## Examples and tests\n\n${component.examples.map((item) => `- \`${item}\``).join("\n")}\n`;
  outputs.set(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  outputs.set(readmePath, readme);
}

let mismatch = false;

for (const [path, content] of outputs) {
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) {
      console.error(`Generated artifact is missing or stale: ${relative(root, path)}`);
      mismatch = true;
    }
    continue;
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  console.log(`generated ${relative(root, path)}`);
}

if (mismatch) {
  console.error("Run npm run ds:generate and commit the generated results.");
  process.exitCode = 1;
}
