import type { AccountType } from "../types";

export function founderWorkspaceRedirect(accountType: AccountType | null | undefined) {
  return accountType === "tester" ? "/earn" : null;
}
