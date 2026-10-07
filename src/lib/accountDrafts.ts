// Existing drafts migrate once when email access first switches this browser account.
// Each tab retains its own namespace; shared localStorage drafts never change owner.
const OWNER_KEY = "test4test:draft-owner";
const ENABLED_KEY = "test4test:account-drafts-enabled";
let owner: string | null = null;
try {
  owner = sessionStorage.getItem(OWNER_KEY);
} catch {
  /* Storage is optional. */
}

export function accountDraftKey(key: string) {
  return owner === null ? key : `test4test:account-draft:${owner}:${key}`;
}

function isLegacyDraft(key: string) {
  return (
    key.startsWith("test4test:recording-session:") ||
    key.startsWith("test4test-pending-submission:") ||
    key === "test4test-submit-flow-resume:v1" ||
    key === "test4test-otp-challenge" ||
    key === "test4test.tester-signup.v1"
  );
}

export function prepareEmailAccountDrafts(previousUserId: string | null, nextUserId: string) {
  for (const storage of [window.sessionStorage, window.localStorage]) {
    // Copy before removing: a quota/storage failure aborts the account switch safely.
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => !!key && isLegacyDraft(key),
    );
    for (const key of keys) {
      const target = `test4test:account-draft:${previousUserId ?? "signed-out"}:${key}`;
      const value = storage.getItem(key);
      if (value !== null) storage.setItem(target, value);
      storage.removeItem(key);
    }
  }
  window.localStorage.setItem(ENABLED_KEY, "true");
  owner = nextUserId;
  window.sessionStorage.setItem(OWNER_KEY, nextUserId);
  window.sessionStorage.removeItem("test4test:earn-placement-snapshot");
}

export function syncAccountDraftOwner(userId: string | null) {
  try {
    if (!window.localStorage.getItem(ENABLED_KEY)) return;
    owner = userId ?? "signed-out";
    window.sessionStorage.setItem(OWNER_KEY, owner);
  } catch {
    /* The current tab retains its in-memory namespace. */
  }
}
