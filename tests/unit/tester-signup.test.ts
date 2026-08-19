import { beforeEach, describe, expect, it } from "vitest";
import { founderWorkspaceRedirect } from "../../src/lib/accountAccess";
import { calculateTesterEarnAccess } from "../../src/lib/testerEligibility";
import {
  EMPTY_TESTER_PROFILE_DRAFT,
  COUNTRY_OPTIONS,
  TESTER_SIGNUP_DRAFT_TTL_MS,
  TESTER_SIGNUP_STORAGE_KEY,
  TESTER_SIGNUP_DRAFT_VERSION,
  clearTesterSignupDraft,
  countryCodeForLabel,
  countryLabelForCode,
  devicesToProductTypes,
  loadTesterSignupDraft,
  normalizeCountryCode,
  parseTesterSignupDraft,
  productTypesToDevices,
  saveTesterSignupDraft,
  validateTesterSignupStep,
  withEmploymentStatus,
} from "../../src/lib/testerSignup";
import type { TesterProfileDraft } from "../../src/types";

const completeDraft: TesterProfileDraft = {
  firstName: "Sam",
  countryCode: "US",
  region: "New York",
  technologyProficiency: "moderately",
  devices: ["computer", "ios"],
  employmentStatus: "full_time",
  workArea: "design_ux",
  paidTestEmailEnabled: true,
};

describe("tester profile validation", () => {
  it("validates every required onboarding answer", () => {
    expect(validateTesterSignupStep(1, EMPTY_TESTER_PROFILE_DRAFT)).toEqual([
      { fieldId: "tester-first-name", message: "Enter your first name." },
    ]);
    expect(validateTesterSignupStep(2, EMPTY_TESTER_PROFILE_DRAFT)[0]?.fieldId).toBe(
      "tester-country",
    );
    expect(
      validateTesterSignupStep(3, EMPTY_TESTER_PROFILE_DRAFT).map((error) => error.fieldId),
    ).toEqual(["tester-technology-proficiency", "tester-devices"]);
    expect(validateTesterSignupStep(4, EMPTY_TESTER_PROFILE_DRAFT)[0]?.fieldId).toBe(
      "tester-employment-status",
    );
  });

  it("requires work area only for working categories and clears it when employment changes", () => {
    expect(validateTesterSignupStep(4, { ...completeDraft, workArea: "" })[0]?.fieldId).toBe(
      "tester-work-area",
    );
    expect(withEmploymentStatus(completeDraft, "student").workArea).toBe("");
    expect(validateTesterSignupStep(4, withEmploymentStatus(completeDraft, "student"))).toEqual([]);
  });

  it("normalizes ISO country codes and maps country labels", () => {
    expect(normalizeCountryCode(" us ")).toBe("US");
    expect(countryCodeForLabel(countryLabelForCode("US"))).toBe("US");
    expect(new Set(COUNTRY_OPTIONS.map((option) => option.code)).size).toBe(COUNTRY_OPTIONS.length);
    expect(new Set(COUNTRY_OPTIONS.map((option) => option.label)).size).toBe(
      COUNTRY_OPTIONS.length,
    );
  });

  it("maps tester devices to Earn platforms in both directions", () => {
    expect(devicesToProductTypes(["computer", "android"])).toEqual(["website", "android"]);
    expect(productTypesToDevices(["website", "ios"])).toEqual(["computer", "ios"]);
  });
});

describe("tester signup draft recovery", () => {
  beforeEach(() => {
    clearTesterSignupDraft();
  });

  it("persists a verification phase to local and session storage", () => {
    saveTesterSignupDraft(completeDraft, "otp", "sam@example.com");

    expect(loadTesterSignupDraft()).toMatchObject({
      draft: completeDraft,
      stage: "otp",
      email: "sam@example.com",
    });
    expect(window.localStorage.getItem(TESTER_SIGNUP_STORAGE_KEY)).toBeTruthy();
    expect(window.sessionStorage.getItem(TESTER_SIGNUP_STORAGE_KEY)).toBeTruthy();
  });

  it("expires after seven days and resumes at the first incomplete valid step", () => {
    const now = Date.now();
    const expired = JSON.stringify({
      version: TESTER_SIGNUP_DRAFT_VERSION,
      draft: completeDraft,
      stage: "otp",
      email: "sam@example.com",
      createdAt: new Date(now - TESTER_SIGNUP_DRAFT_TTL_MS - 1).toISOString(),
      updatedAt: new Date(now - TESTER_SIGNUP_DRAFT_TTL_MS - 1).toISOString(),
    });
    expect(parseTesterSignupDraft(expired, now)).toBeNull();

    const incomplete = JSON.stringify({
      version: TESTER_SIGNUP_DRAFT_VERSION,
      draft: { ...completeDraft, countryCode: "" },
      stage: "email",
      email: "sam@example.com",
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    expect(parseTesterSignupDraft(incomplete, now)?.stage).toBe(2);
  });
});

describe("tester account routing", () => {
  it("redirects testers from founder workspace and leaves other roles unchanged", () => {
    expect(founderWorkspaceRedirect("tester")).toBe("/earn");
    expect(founderWorkspaceRedirect("founder")).toBeNull();
    expect(founderWorkspaceRedirect("pending")).toBeNull();
    expect(founderWorkspaceRedirect(null)).toBeNull();
  });
});

describe("tester paid access", () => {
  it("requires two distinct credited approvals and two distinct five-star ratings", () => {
    const responses = [
      { id: "r1", testerUserId: "tester", status: "approved", creditAwarded: true },
      { id: "r2", testerUserId: "tester", status: "approved", creditAwarded: true },
      { id: "r3", testerUserId: "tester", status: "approved", creditAwarded: false },
      { id: "other", testerUserId: "other", status: "approved", creditAwarded: true },
    ];
    const locked = calculateTesterEarnAccess("tester", responses, [
      { testResponseId: "r1", starRating: 5 },
      { testResponseId: "r1", starRating: 5 },
      { testResponseId: "r2", starRating: null },
      { testResponseId: "r3", starRating: 5 },
    ]);
    expect(locked).toEqual({
      completedCreditTests: 2,
      fiveStarRatings: 1,
      paidAccessUnlocked: false,
    });

    expect(
      calculateTesterEarnAccess("tester", responses, [
        { testResponseId: "r1", starRating: 5 },
        { testResponseId: "r2", starRating: 5 },
      ]),
    ).toEqual({
      completedCreditTests: 2,
      fiveStarRatings: 2,
      paidAccessUnlocked: true,
    });
  });
});
