import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCli = process.env.npm_execpath;
const prettierCli = join(root, "node_modules", "prettier", "bin", "prettier.cjs");
const eslintCli = join(root, "node_modules", "eslint", "bin", "eslint.js");
const validateDesignSystem = join(root, "scripts", "validate-design-system.mjs");
const runPlaywright = join(root, "scripts", "run-playwright.mjs");
const routeStates = JSON.parse(
  readFileSync(join(root, "tests", "playwright", "route-states.json"), "utf8"),
);
const visualSpec = readFileSync(join(root, "tests", "playwright", "visual.spec.ts"), "utf8");

const lintableExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const typeCheckedExtensions = new Set([".ts", ".tsx"]);

function usage() {
  console.error(`Usage:
  npm run ds:check:fast -- <changed-file> [changed-file...]
  npm run ds:check:route -- <route-name>
  npm run ds:check:story -- <story-id>
  npm run ds:visual:update:route -- <route-name>
  npm run ds:visual:update:story -- <story-id>`);
}

function fail(message) {
  console.error(message);
  usage();
  process.exit(1);
}

function run(command, arguments_, description) {
  console.log(`\n> ${description}`);
  const result = spawnSync(command, arguments_, {
    cwd: root,
    env: process.env,
    shell: false,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runNode(script, arguments_, description) {
  run(node, [script, ...arguments_], description);
}

function runNpm(arguments_, description) {
  if (npmCli && existsSync(npmCli)) {
    runNode(npmCli, arguments_, description);
  } else {
    run(npm, arguments_, description);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requireSingleValue(lane, values) {
  if (values.length !== 1) fail(`${lane} requires exactly one value.`);
  return values[0];
}

function normalizeChangedFiles(values) {
  if (values.length === 0) fail("fast requires at least one changed file.");

  return [...new Set(values)].map((value) => {
    const absolutePath = resolve(root, value);
    const repositoryPath = relative(root, absolutePath);
    if (
      !repositoryPath ||
      repositoryPath.startsWith("..") ||
      isAbsolute(repositoryPath) ||
      !existsSync(absolutePath)
    ) {
      fail(`Changed file must exist inside the repository: ${value}`);
    }
    return repositoryPath.replaceAll("\\", "/");
  });
}

function getRoute(name) {
  const route = routeStates.find((candidate) => candidate.name === name);
  if (!route) fail(`Unknown route state "${name}".`);
  if (route.redirectOnly)
    fail(`Route state "${name}" is redirect-only and has no visual baseline.`);
  return route;
}

function validateStoryId(storyId) {
  if (!/^[a-z0-9-]+--[a-z0-9-]+$/.test(storyId)) {
    fail(`Invalid Storybook story ID "${storyId}".`);
  }
  if (!visualSpec.includes(JSON.stringify(storyId))) {
    fail(`Story "${storyId}" is not registered in the visual suite.`);
  }
  return storyId;
}

function runFast(values) {
  const files = normalizeChangedFiles(values);
  runNode(prettierCli, ["--check", ...files], "Check formatting in changed files");

  const lintableFiles = files.filter((file) => lintableExtensions.has(extname(file)));
  if (lintableFiles.length > 0) {
    runNode(eslintCli, lintableFiles, "Lint changed code files");
  }

  if (files.some((file) => typeCheckedExtensions.has(extname(file)))) {
    runNpm(["run", "typecheck"], "Type-check the application");
  }

  runNode(validateDesignSystem, [], "Validate design-system invariants");
  console.log(`\nFast-checked ${files.length} changed file(s).`);
}

function runRoute(routeName, updateSnapshots) {
  const route = getRoute(routeName);
  const escapedName = escapeRegex(route.name);

  if (!updateSnapshots) {
    runNode(
      runPlaywright,
      ["a11y", "--grep", `${escapedName} (?:has|reflows|supports)`],
      `Check accessibility for route "${route.name}"`,
    );
  }

  const visualArguments = ["visual-route", "--grep", `${escapedName} route at `];
  if (updateSnapshots) visualArguments.push("--update-snapshots");
  runNode(
    runPlaywright,
    visualArguments,
    `${updateSnapshots ? "Update" : "Check"} visual baselines for route "${route.name}"`,
  );

  console.log(
    `\n${updateSnapshots ? "Updated accepted baselines" : "Target-checked"} for route "${route.name}".`,
  );
}

function runStory(storyId, updateSnapshots) {
  const story = validateStoryId(storyId);
  runNpm(["run", "build:storybook"], "Build Storybook for targeted visual verification");

  const visualArguments = ["visual-story", "--grep", `${escapeRegex(story)} at `];
  if (updateSnapshots) visualArguments.push("--update-snapshots");
  runNode(
    runPlaywright,
    visualArguments,
    `${updateSnapshots ? "Update" : "Check"} visual baselines for story "${story}"`,
  );

  console.log(
    `\n${updateSnapshots ? "Updated accepted baselines" : "Target-checked"} for story "${story}".`,
  );
}

const [lane, ...values] = process.argv.slice(2);

switch (lane) {
  case "fast":
    runFast(values);
    break;
  case "route":
    runRoute(requireSingleValue(lane, values), false);
    break;
  case "story":
    runStory(requireSingleValue(lane, values), false);
    break;
  case "update-route":
    runRoute(requireSingleValue(lane, values), true);
    break;
  case "update-story":
    runStory(requireSingleValue(lane, values), true);
    break;
  default:
    fail(`Unknown validation lane "${lane ?? ""}".`);
}
