import { spawn } from "node:child_process";
import { createStaticServer } from "./serve-static.mjs";

// Own the server in this process so cleanup also works in restricted Windows shells.
const server = createStaticServer("dist", 4187);
await server.listen();
try {
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["node_modules/@playwright/test/cli.js", "test", "--config=playwright.production.config.ts"],
      { stdio: "inherit", shell: false },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await server.close();
}
