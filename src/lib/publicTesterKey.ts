const PUBLIC_TESTER_KEY_STORAGE_KEY = "test4test_public_tester_key";

function createPublicTesterKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function isValidPublicTesterKey(value: string) {
  return /^[a-zA-Z0-9-]{16,128}$/.test(value);
}

export function getPublicTesterKey() {
  if (typeof window === "undefined") {
    return createPublicTesterKey();
  }

  try {
    const stored = window.localStorage.getItem(PUBLIC_TESTER_KEY_STORAGE_KEY)?.trim();

    if (stored && isValidPublicTesterKey(stored)) {
      return stored;
    }

    const next = createPublicTesterKey();
    window.localStorage.setItem(PUBLIC_TESTER_KEY_STORAGE_KEY, next);
    return next;
  } catch {
    return createPublicTesterKey();
  }
}
