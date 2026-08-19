import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { createStaticServer } from "./serve-static.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const suite = process.argv[2];
const forwardedArguments = process.argv.slice(3);
const configSuite = ["visual-route", "visual-story"].includes(suite) ? "visual" : suite;

process.env.VITE_DS_FIXTURES = "1";
process.env.VITE_TEST_ACCOUNT_EMAIL = "avery@demo.test4test.app";
process.env.VITE_SUPABASE_URL = "";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "";
process.env.VITE_SUPABASE_ANON_KEY = "";

if (!["a11y", "visual", "visual-route", "visual-story"].includes(suite)) {
  throw new Error(
    `Expected Playwright suite "a11y", "visual", "visual-route", or "visual-story", received "${suite ?? ""}".`,
  );
}

async function warmAppServer() {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:4173/", {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await page.locator("main").waitFor({ state: "visible", timeout: 120_000 });
  } finally {
    await browser.close();
  }
}
const closeServers = [];
if (suite === "a11y" || suite === "visual-route") {
  const vite = await createViteServer({
    configFile: join(root, "vite.config.ts"),
    server: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
    },
  });
  await vite.listen();
  closeServers.push(() => vite.close());
  await warmAppServer();
} else if (suite === "visual") {
  const vite = await createViteServer({
    configFile: join(root, "vite.config.ts"),
    server: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
    },
  });
  await vite.listen();
  closeServers.push(() => vite.close());

  const staticServer = createStaticServer(join(root, "storybook-static"), 6006);
  await staticServer.listen();
  closeServers.push(() => staticServer.close());
} else {
  const staticServer = createStaticServer(join(root, "storybook-static"), 6006);
  await staticServer.listen();
  closeServers.push(() => staticServer.close());
}

const config = join(root, `playwright.${configSuite}.config.ts`);
const playwrightCli = join(root, "node_modules", "@playwright", "test", "cli.js");

try {
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(
      process.execPath,
      [playwrightCli, "test", `--config=${config}`, ...forwardedArguments],
      {
        cwd: root,
        env: process.env,
        shell: false,
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Playwright exited after signal ${signal}.`));
      } else {
        resolveExit(code ?? 1);
      }
    });
  });
  process.exitCode = exitCode;
} finally {
  await Promise.allSettled(closeServers.reverse().map((closeServer) => closeServer()));
}
