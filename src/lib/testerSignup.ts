import type {
  EmploymentStatus,
  ProductType,
  TechnologyProficiency,
  TesterDevice,
  TesterProfileDraft,
  WorkArea,
} from "../types";

export const TESTER_SIGNUP_DRAFT_VERSION = 1;
export const TESTER_SIGNUP_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TESTER_SIGNUP_STORAGE_KEY = "test4test.tester-signup.v1";

export type TesterSignupStage = 1 | 2 | 3 | 4 | "email" | "otp";

export interface TesterSignupStoredDraft {
  version: typeof TESTER_SIGNUP_DRAFT_VERSION;
  draft: TesterProfileDraft;
  stage: TesterSignupStage;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface TesterSignupFieldError {
  fieldId: string;
  message: string;
}

export const TECHNOLOGY_PROFICIENCY_OPTIONS: Array<{
  value: TechnologyProficiency;
  label: string;
}> = [
  { value: "not_at_all", label: "Not at all proficient 😕" },
  { value: "slightly", label: "Slightly proficient 🙂" },
  { value: "moderately", label: "Moderately proficient 👍" },
  { value: "very", label: "Very proficient 😎" },
  { value: "extremely", label: "Extremely proficient 🤓" },
];

export const TESTER_DEVICE_OPTIONS: Array<{ value: TesterDevice; label: string }> = [
  { value: "computer", label: "Computer" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
];

export const EMPLOYMENT_STATUS_OPTIONS: Array<{
  value: EmploymentStatus;
  label: string;
}> = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "self_employed", label: "Self-employed" },
  { value: "student", label: "Student" },
  { value: "retired", label: "Retired" },
  { value: "not_employed", label: "Not employed" },
];

export const WORK_AREA_OPTIONS: Array<{ value: WorkArea; label: string }> = [
  { value: "sales", label: "Sales" },
  { value: "marketing", label: "Marketing" },
  { value: "software_development", label: "Software development" },
  { value: "it", label: "IT" },
  { value: "design_ux", label: "Design or UX" },
  { value: "product_management", label: "Product management" },
  { value: "finance_accounting", label: "Finance or accounting" },
  { value: "human_resources", label: "Human resources" },
  { value: "operations", label: "Operations" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education", label: "Education" },
  { value: "customer_support", label: "Customer support" },
  { value: "other", label: "Other" },
];

export const EMPTY_TESTER_PROFILE_DRAFT: TesterProfileDraft = {
  firstName: "",
  countryCode: "",
  region: "",
  technologyProficiency: "",
  devices: [],
  employmentStatus: "",
  workArea: "",
  paidTestEmailEnabled: true,
};

function buildCountryOptions() {
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  const options: Array<{ code: string; label: string }> = [];

  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      const canonicalCode = new Intl.Locale(`und-${code}`).region;
      if (canonicalCode !== code) continue;

      const label = displayNames.of(code);

      if (label && label !== code && !/unknown region/i.test(label)) {
        options.push({ code, label });
      }
    }
  }

  return options.sort((left, right) => left.label.localeCompare(right.label));
}

export const COUNTRY_OPTIONS = buildCountryOptions();

export function countryLabelForCode(code: string) {
  const normalized = normalizeCountryCode(code);
  return COUNTRY_OPTIONS.find((option) => option.code === normalized)?.label ?? "";
}

export function countryCodeForLabel(label: string) {
  const normalized = label.trim().toLocaleLowerCase();
  return (
    COUNTRY_OPTIONS.find((option) => option.label.toLocaleLowerCase() === normalized)?.code ?? ""
  );
}

export function normalizeCountryCode(code: string) {
  return code.trim().toUpperCase();
}

export function employmentRequiresWorkArea(status: EmploymentStatus | "") {
  return status === "full_time" || status === "part_time" || status === "self_employed";
}

export function withEmploymentStatus(
  draft: TesterProfileDraft,
  employmentStatus: EmploymentStatus,
): TesterProfileDraft {
  return {
    ...draft,
    employmentStatus,
    workArea: employmentRequiresWorkArea(employmentStatus) ? draft.workArea : "",
  };
}

export function devicesToProductTypes(devices: TesterDevice[]): ProductType[] {
  const mapped: ProductType[] = [];
  if (devices.includes("computer")) mapped.push("website");
  if (devices.includes("ios")) mapped.push("ios");
  if (devices.includes("android")) mapped.push("android");
  return mapped;
}

export function productTypesToDevices(productTypes: ProductType[]): TesterDevice[] {
  const mapped: TesterDevice[] = [];
  if (productTypes.includes("website")) mapped.push("computer");
  if (productTypes.includes("ios")) mapped.push("ios");
  if (productTypes.includes("android")) mapped.push("android");
  return mapped;
}

export function validateTesterSignupStep(
  step: 1 | 2 | 3 | 4,
  draft: TesterProfileDraft,
): TesterSignupFieldError[] {
  if (step === 1) {
    return draft.firstName.trim()
      ? []
      : [{ fieldId: "tester-first-name", message: "Enter your first name." }];
  }

  if (step === 2) {
    const countryCode = normalizeCountryCode(draft.countryCode);
    const validCountry = COUNTRY_OPTIONS.some((option) => option.code === countryCode);
    return validCountry
      ? []
      : [{ fieldId: "tester-country", message: "Choose a country from the list." }];
  }

  if (step === 3) {
    const errors: TesterSignupFieldError[] = [];
    if (!draft.technologyProficiency) {
      errors.push({
        fieldId: "tester-technology-proficiency",
        message: "Choose your technology proficiency.",
      });
    }
    if (draft.devices.length === 0) {
      errors.push({
        fieldId: "tester-devices",
        message: "Select at least one device.",
      });
    }
    return errors;
  }

  const errors: TesterSignupFieldError[] = [];
  if (!draft.employmentStatus) {
    errors.push({
      fieldId: "tester-employment-status",
      message: "Choose your employment status.",
    });
  } else if (employmentRequiresWorkArea(draft.employmentStatus) && !draft.workArea) {
    errors.push({
      fieldId: "tester-work-area",
      message: "Choose the area that best describes your work.",
    });
  }
  return errors;
}

export function firstIncompleteTesterSignupStep(draft: TesterProfileDraft): 1 | 2 | 3 | 4 | null {
  for (const step of [1, 2, 3, 4] as const) {
    if (validateTesterSignupStep(step, draft).length > 0) return step;
  }
  return null;
}

function isTesterSignupStage(value: unknown): value is TesterSignupStage {
  return (
    value === 1 || value === 2 || value === 3 || value === 4 || value === "email" || value === "otp"
  );
}

function normalizeStoredStage(
  stage: TesterSignupStage,
  draft: TesterProfileDraft,
  email: string,
): TesterSignupStage {
  const incompleteStep = firstIncompleteTesterSignupStep(draft);
  if (incompleteStep) {
    const requestedStep = typeof stage === "number" ? stage : 4;
    return Math.min(incompleteStep, requestedStep) as 1 | 2 | 3 | 4;
  }
  if (stage === "otp" && !email.trim()) return "email";
  return stage;
}

export function parseTesterSignupDraft(
  raw: string | null,
  now = Date.now(),
): TesterSignupStoredDraft | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<TesterSignupStoredDraft>;
    const updatedAt = Date.parse(parsed.updatedAt ?? "");

    if (
      parsed.version !== TESTER_SIGNUP_DRAFT_VERSION ||
      !parsed.draft ||
      !isTesterSignupStage(parsed.stage) ||
      !Number.isFinite(updatedAt) ||
      now - updatedAt > TESTER_SIGNUP_DRAFT_TTL_MS
    ) {
      return null;
    }

    const draft: TesterProfileDraft = {
      ...EMPTY_TESTER_PROFILE_DRAFT,
      ...parsed.draft,
      firstName: String(parsed.draft.firstName ?? ""),
      countryCode: normalizeCountryCode(String(parsed.draft.countryCode ?? "")),
      region: String(parsed.draft.region ?? ""),
      devices: Array.isArray(parsed.draft.devices)
        ? parsed.draft.devices.filter(
            (device): device is TesterDevice =>
              device === "computer" || device === "ios" || device === "android",
          )
        : [],
      paidTestEmailEnabled: parsed.draft.paidTestEmailEnabled !== false,
    };
    const email = String(parsed.email ?? "");

    return {
      version: TESTER_SIGNUP_DRAFT_VERSION,
      draft,
      stage: normalizeStoredStage(parsed.stage, draft, email),
      email,
      createdAt: parsed.createdAt ?? parsed.updatedAt ?? new Date(now).toISOString(),
      updatedAt: parsed.updatedAt ?? new Date(now).toISOString(),
    };
  } catch {
    return null;
  }
}

function getStorageCandidates() {
  if (typeof window === "undefined") return [] as Storage[];

  const candidates: Storage[] = [];
  try {
    candidates.push(window.localStorage);
  } catch {
    // Storage can be disabled by browser privacy settings.
  }
  try {
    candidates.push(window.sessionStorage);
  } catch {
    // Storage can be disabled by browser privacy settings.
  }
  return candidates;
}

export function loadTesterSignupDraft() {
  const drafts = getStorageCandidates()
    .map((storage) => parseTesterSignupDraft(storage.getItem(TESTER_SIGNUP_STORAGE_KEY)))
    .filter((draft): draft is TesterSignupStoredDraft => Boolean(draft))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  return drafts[0] ?? null;
}

export function saveTesterSignupDraft(
  draft: TesterProfileDraft,
  stage: TesterSignupStage,
  email: string,
) {
  const existing = loadTesterSignupDraft();
  const now = new Date().toISOString();
  const stored: TesterSignupStoredDraft = {
    version: TESTER_SIGNUP_DRAFT_VERSION,
    draft,
    stage,
    email,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const serialized = JSON.stringify(stored);

  getStorageCandidates().forEach((storage) => {
    try {
      storage.setItem(TESTER_SIGNUP_STORAGE_KEY, serialized);
    } catch {
      // Keep the in-memory form usable if storage is full or unavailable.
    }
  });

  return stored;
}

export function clearTesterSignupDraft() {
  getStorageCandidates().forEach((storage) => {
    try {
      storage.removeItem(TESTER_SIGNUP_STORAGE_KEY);
    } catch {
      // A completed signup should not fail because storage cleanup is blocked.
    }
  });
}
