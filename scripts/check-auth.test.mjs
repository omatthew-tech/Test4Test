import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { checkAuth, writeResult } from "./check-auth.mjs";

let server;
let origin;
let scenario;
const email = "monitor@example.test";
const passcode = "fixture-secret-not-for-logs";

// Exercise the browser against a local server: no production requests or
// credentials are needed to verify the monitor's success/failure decisions.
before(async () => {
  server = createServer((req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/functions/v1/test-account-login") {
      if (scenario === "reject") return json(401, { error: passcode });
      return json(200, { ok: true, session: {
        access_token: "fixture-access-token", refresh_token: "fixture-refresh-token",
        user: { id: "fixture-user", email },
      } });
    }
    if (req.url === "/auth/v1/user") {
      if (scenario === "invalid-session") return json(401, { error: "Invalid session" });
      return json(200, { id: "fixture-user", email: scenario === "wrong-user" ? "other@example.test" : email });
    }
    if (scenario === "site-down") {
      res.writeHead(503);
      return res.end("Unavailable");
    }
    res.setHeader("Content-Type", "text/html");
    const redesigned = scenario.startsWith("redesign-");
    const accountMenu = `<button aria-label="Profile menu" onclick="document.getElementById('account-menu').hidden=false; document.getElementById('profile-item').focus()">Account</button>
      <div role="menu" id="account-menu" hidden onkeydown="if(event.key==='Escape')this.hidden=true">
        <button id="profile-item" role="menuitem" onclick="location.href='/profile'">Profile</button>
        ${scenario === "redesign-missing-signout" ? "" : '<button role="menuitem">Sign out</button>'}
      </div>`;
    const profileEmail = scenario.startsWith("redesign-tester-")
      ? `<label>Email address<input type="email" value="${scenario === "redesign-tester-wrong-email" ? "other@example.test" : email}"></label>`
      : `<strong>${email}</strong>`;
    const profileMarkup = `${profileEmail}${redesigned ? accountMenu : "<button>Sign out</button>"}`;
    const accountNavigation = redesigned ? accountMenu : '<a href="/profile">Profile</a>';
    if (req.url === "/") return res.end('<a href="/sign-in">Log in</a>');
    if (req.url === "/profile") return res.end(`
      <script>
        if (localStorage.getItem('fixture-session')) {
          document.write(${JSON.stringify(profileMarkup)});
          ${scenario.endsWith("lose-session") ? "localStorage.clear();" : ""}
        } else { document.write('Please sign in'); }
      </script>`);
    if (req.url === "/sign-in") return res.end(`
      <label>Email address<span aria-hidden="true"> *</span><input type="email" required></label><button id="next">Continue</button>
      <script>
        document.getElementById('next').onclick = () => {
          document.body.innerHTML = '<label>Test account passcode<span aria-hidden="true"> *</span><input required></label><button id="verify">Verify and continue</button>';
          document.getElementById('verify').onclick = async () => {
            const login = await fetch('/functions/v1/test-account-login', {method: 'POST'});
            if (!login.ok) return;
            await fetch('/auth/v1/user');
            localStorage.setItem('fixture-session', 'active');
            document.body.innerHTML = ${JSON.stringify(accountNavigation)};
          };
        };
      </script>`);
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => { await new Promise((resolve) => server.close(resolve)); });

function env() {
  return {
    AUTH_CHECK_URL: `${origin}/`,
    AUTH_CHECK_EMAIL: email,
    TEST_ACCOUNT_OTP_CODE: passcode,
    AUTH_CHECK_TIMEOUT_MS: "1500",
    AUTH_CHECK_CHROMIUM_PATH: process.env.AUTH_CHECK_CHROMIUM_PATH,
  };
}

test("logs BLOCKED when the credential is absent", async () => {
  const result = await checkAuth({ AUTH_CHECK_URL: `${origin}/` });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.stage, "configuration");
});

for (const [name, status, stage] of [
  ["success", "WORKING", "complete"],
  ["reject", "NOT_WORKING", "verify_code"],
  ["invalid-session", "NOT_WORKING", "validate_identity"],
  ["wrong-user", "NOT_WORKING", "validate_identity"],
  ["lose-session", "NOT_WORKING", "reload_session"],
  ["site-down", "NOT_WORKING", "open_site"],
  ["redesign-success", "WORKING", "complete"],
  ["redesign-lose-session", "NOT_WORKING", "reload_session"],
  ["redesign-missing-signout", "NOT_WORKING", "authenticated_profile"],
  ["redesign-tester-success", "WORKING", "complete"],
  ["redesign-tester-wrong-email", "NOT_WORKING", "authenticated_profile"],
]) {
  test(name, async () => {
    scenario = name;
    const result = await checkAuth(env());
    assert.equal(result.status, status, JSON.stringify(result));
    assert.equal(result.stage, stage);
    assert.ok(result.duration_ms >= 0);
    assert.ok(!JSON.stringify(result).includes(passcode));
    assert.ok(!JSON.stringify(result).includes("fixture-access-token"));
  });
}

test("appends timestamped results and updates the latest result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auth-check-"));
  try {
    const result = await checkAuth({});
    await writeResult(result, { AUTH_CHECK_LOG_DIR: dir });
    await writeResult(result, { AUTH_CHECK_LOG_DIR: dir });
    assert.equal((await readFile(join(dir, "history.jsonl"), "utf8")).trim().split("\n").length, 2);
    assert.equal(JSON.parse(await readFile(join(dir, "latest.json"), "utf8")).status, "BLOCKED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
