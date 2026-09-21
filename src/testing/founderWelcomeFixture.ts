import { parseFounderWelcomeStatus, type FounderWelcomeOutcome } from "../lib/founderWelcome";

const key = (userId: string) => `test4test:fixture:founder-welcome:${userId}`;

export function readFounderWelcomeFixture(userId: string, requested: string | null) {
  return (
    parseFounderWelcomeStatus(localStorage.getItem(key(userId))) ??
    parseFounderWelcomeStatus(requested)
  );
}

export function saveFounderWelcomeFixture(userId: string, outcome: FounderWelcomeOutcome) {
  localStorage.setItem(key(userId), outcome);
}
