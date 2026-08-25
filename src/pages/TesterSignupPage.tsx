import { FormEvent, useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  FormSummary,
  type FormSummaryItem,
  IconButton,
  InlineValidation,
  Radio,
  Select,
  Test4TestBrand,
  Surface,
  TextField,
  Tooltip,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { StepIndicator } from "../components/StepIndicator";
import { useAppState } from "../context/AppStateContext";
import {
  COUNTRY_OPTIONS,
  EMPTY_TESTER_PROFILE_DRAFT,
  EMPLOYMENT_STATUS_OPTIONS,
  TECHNOLOGY_PROFICIENCY_OPTIONS,
  TESTER_DEVICE_OPTIONS,
  WORK_AREA_OPTIONS,
  clearTesterSignupDraft,
  employmentRequiresWorkArea,
  loadTesterSignupDraft,
  saveTesterSignupDraft,
  validateTesterSignupStep,
  withEmploymentStatus,
  type TesterSignupStage,
} from "../lib/testerSignup";
import { clearStoredOtpChallenge } from "../lib/pendingSubmission";
import type {
  EmploymentStatus,
  TechnologyProficiency,
  TesterDevice,
  TesterProfileDraft,
  WorkArea,
} from "../types";
import styles from "./TesterSignupPage.module.css";

const steps = ["Name", "Location", "Technology and devices", "Employment"];
const founderConflictMessage =
  "That email already has a Test4Test account. Use a different email to create a tester account.";

const US_STATE_OPTIONS = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

function isNumberedStage(stage: TesterSignupStage): stage is 1 | 2 | 3 | 4 {
  return typeof stage === "number";
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function TesterSignupPage() {
  const navigate = useNavigate();
  const { completeTesterSignup, requestOtp, signOut, verifyOtp } = useAppState();
  const initialRef = useRef(loadTesterSignupDraft());
  const initial = initialRef.current;
  const [draft, setDraft] = useState<TesterProfileDraft>(
    initial?.draft ?? EMPTY_TESTER_PROFILE_DRAFT,
  );
  const [stage, setStage] = useState<TesterSignupStage>(initial?.stage ?? 1);
  const [email, setEmail] = useState(initial?.email ?? "");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<FormSummaryItem[]>([]);
  const [message, setMessage] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const formSummaryRef = useRef<HTMLDivElement | null>(null);

  const usesStateDropdown = !draft.countryCode || draft.countryCode === "US";

  useEffect(() => {
    saveTesterSignupDraft(draft, stage, email);
  }, [draft, email, stage]);

  useEffect(() => {
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }, [stage]);

  const showErrors = (nextErrors: FormSummaryItem[]) => {
    setErrors(nextErrors);
    window.requestAnimationFrame(() => formSummaryRef.current?.focus());
  };

  const clearFeedback = () => {
    setErrors([]);
    setMessage("");
  };

  const getFieldError = (fieldId: string) =>
    errors.find((error) => error.fieldId === fieldId)?.message;

  const moveTo = (nextStage: TesterSignupStage) => {
    clearFeedback();
    setStage(nextStage);
    window.scrollTo({ top: 0 });
  };

  const goBack = () => {
    if (stage === "email") {
      moveTo(4);
      return;
    }

    if (stage === "otp") {
      clearStoredOtpChallenge();
      moveTo("email");
      return;
    }

    if (stage > 1) moveTo((stage - 1) as 1 | 2 | 3);
  };

  const continueNumberedStep = () => {
    if (!isNumberedStage(stage)) return;
    const nextErrors = validateTesterSignupStep(stage, draft);

    if (nextErrors.length > 0) {
      showErrors(nextErrors);
      return;
    }

    if (stage === 4) {
      moveTo("email");
    } else {
      moveTo((stage + 1) as 2 | 3 | 4);
    }
  };

  const sendCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      showErrors([{ fieldId: "tester-email", message: "Enter a valid email address." }]);
      return;
    }

    setIsSendingCode(true);
    clearFeedback();

    try {
      await requestOtp(normalizedEmail, { intent: "tester_signup" });
      setEmail(normalizedEmail);
      setCode("");
      moveTo("otp");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not send a code.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const verifyAndComplete = async () => {
    if (!code.trim()) {
      showErrors([{ fieldId: "tester-otp", message: "Enter the code from your email." }]);
      return;
    }

    setIsVerifying(true);
    clearFeedback();

    try {
      const verification = await verifyOtp(code);

      if (!verification.ok) {
        setMessage(verification.message);
        return;
      }

      if (verification.accountType === "founder") {
        await signOut();
        setCode("");
        setStage("email");
        setMessage(founderConflictMessage);
        return;
      }

      const completion = await completeTesterSignup(draft);

      if (!completion.ok) {
        if (/already has a Test4Test account/i.test(completion.message)) {
          await signOut();
          setCode("");
          setStage("email");
          setMessage(founderConflictMessage);
          return;
        }

        setMessage(completion.message);
        return;
      }

      clearTesterSignupDraft();
      navigate("/earn", { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not finish signup.");
    } finally {
      setIsVerifying(false);
    }
  };

  const toggleDevice = (device: TesterDevice) => {
    setDraft((current) => ({
      ...current,
      devices: current.devices.includes(device)
        ? current.devices.filter((selected) => selected !== device)
        : [...current.devices, device],
    }));
    setErrors((current) => current.filter((error) => error.fieldId !== "tester-devices"));
  };

  const handleCountryChange = (countryCode: string) => {
    setDraft((current) => ({
      ...current,
      countryCode,
      region: current.countryCode === countryCode ? current.region : "",
    }));
    setErrors((current) => current.filter((error) => error.fieldId !== "tester-country"));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (isNumberedStage(stage)) {
      continueNumberedStep();
    } else if (stage === "email") {
      void sendCode();
    } else {
      void verifyAndComplete();
    }
  };

  return (
    <AppShell eyebrowLabel={null} hideSiteHeader contentWidth="viewport">
      <div className={styles.layout}>
        <div className={styles.brand}>
          <Test4TestBrand />
        </div>

        <div className={styles.page}>
          <form className={styles.wizard} onSubmit={handleSubmit} noValidate>
            {isNumberedStage(stage) ? (
              <StepIndicator steps={steps} currentStep={stage - 1} />
            ) : null}

            <Surface className={styles.stage}>
              <FormSummary ref={formSummaryRef} items={errors} />

              {stage === 1 ? (
                <div className={styles.stack}>
                  <div className={styles.heading}>
                    <h1 ref={headingRef} tabIndex={-1}>
                      Hey there!👋 What&apos;s your name?
                    </h1>
                  </div>
                  <TextField
                    id="tester-first-name"
                    label="First name"
                    autoComplete="given-name"
                    value={draft.firstName}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, firstName: event.target.value }))
                    }
                    error={getFieldError("tester-first-name")}
                    required
                  />
                </div>
              ) : null}

              {stage === 2 ? (
                <div className={styles.stack}>
                  <div className={styles.heading}>
                    <h1 ref={headingRef} tabIndex={-1}>
                      Where do you live? 🌎
                    </h1>
                    <p>Choose your country and add your state or region if it applies.</p>
                  </div>
                  <Select
                    id="tester-country"
                    label="Country"
                    value={draft.countryCode}
                    onChange={(event) => handleCountryChange(event.target.value)}
                    error={getFieldError("tester-country")}
                    autoComplete="country-name"
                    required
                  >
                    <option value="">Choose a country</option>
                    {COUNTRY_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                  {usesStateDropdown ? (
                    <Select
                      id="tester-region"
                      label="State (optional)"
                      value={draft.region}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, region: event.target.value }))
                      }
                      autoComplete="address-level1"
                      disabled={!draft.countryCode}
                    >
                      <option value="">
                        {draft.countryCode ? "Choose a state" : "Choose a country first"}
                      </option>
                      {draft.region && !US_STATE_OPTIONS.includes(draft.region) ? (
                        <option value={draft.region}>{draft.region}</option>
                      ) : null}
                      {US_STATE_OPTIONS.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <TextField
                      id="tester-region"
                      label="State / province / region (optional)"
                      value={draft.region}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, region: event.target.value }))
                      }
                      autoComplete="address-level1"
                    />
                  )}
                </div>
              ) : null}

              {stage === 3 ? (
                <div className={styles.stack}>
                  <div className={styles.heading}>
                    <h1 ref={headingRef} tabIndex={-1}>
                      How comfortable are you with technology?
                    </h1>
                  </div>

                  <fieldset
                    id="tester-technology-proficiency"
                    className={styles.fieldset}
                    tabIndex={-1}
                    aria-invalid={Boolean(getFieldError("tester-technology-proficiency"))}
                    aria-describedby={
                      getFieldError("tester-technology-proficiency")
                        ? "tester-technology-proficiency-error"
                        : undefined
                    }
                  >
                    <legend className={styles.legendWithHelp}>
                      <span>Technology proficiency</span>
                      <Tooltip content="Be honest about your experience. Founders need feedback from both technical and non-technical people, so embrace where you are.">
                        <IconButton
                          type="button"
                          label="About technology proficiency"
                          variant="quiet"
                          size="compact"
                        >
                          <Info aria-hidden="true" size={16} />
                        </IconButton>
                      </Tooltip>
                    </legend>
                    <div className={styles.choiceGroup}>
                      {TECHNOLOGY_PROFICIENCY_OPTIONS.map((option) => (
                        <Radio
                          key={option.value}
                          id={`tester-proficiency-${option.value}`}
                          name="technology-proficiency"
                          label={option.label}
                          value={option.value}
                          checked={draft.technologyProficiency === option.value}
                          onChange={() => {
                            setDraft((current) => ({
                              ...current,
                              technologyProficiency: option.value as TechnologyProficiency,
                            }));
                            setErrors((current) =>
                              current.filter(
                                (error) => error.fieldId !== "tester-technology-proficiency",
                              ),
                            );
                          }}
                        />
                      ))}
                    </div>
                    {getFieldError("tester-technology-proficiency") ? (
                      <InlineValidation id="tester-technology-proficiency-error">
                        {getFieldError("tester-technology-proficiency")}
                      </InlineValidation>
                    ) : null}
                  </fieldset>

                  <fieldset
                    id="tester-devices"
                    className={styles.fieldset}
                    tabIndex={-1}
                    aria-invalid={Boolean(getFieldError("tester-devices"))}
                    aria-describedby={
                      getFieldError("tester-devices") ? "tester-devices-error" : undefined
                    }
                  >
                    <legend>Which devices do you have?</legend>
                    <div className={styles.choiceGroup}>
                      {TESTER_DEVICE_OPTIONS.map((option) => (
                        <Checkbox
                          key={option.value}
                          id={`tester-device-${option.value}`}
                          label={option.label}
                          checked={draft.devices.includes(option.value)}
                          onChange={() => toggleDevice(option.value)}
                        />
                      ))}
                    </div>
                    {getFieldError("tester-devices") ? (
                      <InlineValidation id="tester-devices-error">
                        {getFieldError("tester-devices")}
                      </InlineValidation>
                    ) : null}
                  </fieldset>
                </div>
              ) : null}

              {stage === 4 ? (
                <div className={styles.stack}>
                  <div className={styles.heading}>
                    <h1 ref={headingRef} tabIndex={-1}>
                      What&apos;s your employment status? 💼
                    </h1>
                  </div>
                  <fieldset
                    id="tester-employment-status"
                    className={styles.fieldset}
                    tabIndex={-1}
                    aria-invalid={Boolean(getFieldError("tester-employment-status"))}
                    aria-describedby={
                      getFieldError("tester-employment-status")
                        ? "tester-employment-status-error"
                        : undefined
                    }
                  >
                    <legend>Employment status</legend>
                    <div className={styles.choiceGroup}>
                      {EMPLOYMENT_STATUS_OPTIONS.map((option) => (
                        <Radio
                          key={option.value}
                          id={`tester-employment-${option.value}`}
                          name="employment-status"
                          label={option.label}
                          value={option.value}
                          checked={draft.employmentStatus === option.value}
                          onChange={() => {
                            setDraft((current) =>
                              withEmploymentStatus(current, option.value as EmploymentStatus),
                            );
                            setErrors([]);
                          }}
                        />
                      ))}
                    </div>
                    {getFieldError("tester-employment-status") ? (
                      <InlineValidation id="tester-employment-status-error">
                        {getFieldError("tester-employment-status")}
                      </InlineValidation>
                    ) : null}
                  </fieldset>

                  {employmentRequiresWorkArea(draft.employmentStatus) ? (
                    <Select
                      id="tester-work-area"
                      label="Which area best describes your work?"
                      value={draft.workArea}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          workArea: event.target.value as WorkArea,
                        }))
                      }
                      error={getFieldError("tester-work-area")}
                      required
                    >
                      <option value="">Choose an area</option>
                      {WORK_AREA_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                </div>
              ) : null}

              {stage === "email" ? (
                <div className={styles.stack}>
                  <div className={styles.heading}>
                    <h1 ref={headingRef} tabIndex={-1}>
                      What email should you use to sign in?
                    </h1>
                    <p>We&apos;ll send a one-time code to verify your email.</p>
                  </div>
                  {message ? <Alert tone="danger">{message}</Alert> : null}
                  <TextField
                    id="tester-email"
                    type="email"
                    label="Email address"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    error={getFieldError("tester-email")}
                    required
                  />
                </div>
              ) : null}

              {stage === "otp" ? (
                <div className={styles.stack}>
                  <div className={styles.heading}>
                    <h1 ref={headingRef} tabIndex={-1}>
                      Enter your verification code
                    </h1>
                    <p>We sent a one-time code to {email}.</p>
                  </div>
                  {message ? <Alert tone="danger">{message}</Alert> : null}
                  <TextField
                    id="tester-otp"
                    label="Verification code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    error={getFieldError("tester-otp")}
                    required
                  />
                </div>
              ) : null}

              <div className={styles.actions}>
                {stage !== 1 ? (
                  <Button type="button" variant="secondary" onClick={goBack}>
                    {stage === "otp" ? "Change email" : "Back"}
                  </Button>
                ) : (
                  <span aria-hidden="true" />
                )}
                <Button
                  type="submit"
                  loading={isSendingCode || isVerifying}
                  loadingLabel={
                    isVerifying ? "Creating tester account" : "Sending verification code"
                  }
                >
                  {isNumberedStage(stage)
                    ? "Continue"
                    : stage === "email"
                      ? "Send code"
                      : "Verify and finish"}
                </Button>
              </div>
            </Surface>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
