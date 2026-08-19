import { useEffect, useRef, useState, type FormEvent } from "react";
import { LogOut, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Checkbox,
  Combobox,
  Dialog,
  FormSummary,
  HelpText,
  type FormSummaryItem,
  InlineValidation,
  Radio,
  Select,
  Surface,
  Switch,
  TextField,
} from "@test4test/design-system";
import { AppShell } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";
import {
  COUNTRY_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  TECHNOLOGY_PROFICIENCY_OPTIONS,
  TESTER_DEVICE_OPTIONS,
  WORK_AREA_OPTIONS,
  countryCodeForLabel,
  countryLabelForCode,
  employmentRequiresWorkArea,
  validateTesterSignupStep,
  withEmploymentStatus,
} from "../lib/testerSignup";
import type {
  EmploymentStatus,
  TechnologyProficiency,
  TesterDevice,
  TesterProfileDraft,
  WorkArea,
} from "../types";
import styles from "./TesterProfileSettings.module.css";

type PaymentField = "paypalHandle" | "venmoHandle" | "cashAppHandle";
type PaymentDraft = Record<PaymentField, string>;

const paymentMethods: Array<{ key: PaymentField; label: string; placeholder: string }> = [
  { key: "paypalHandle", label: "PayPal", placeholder: "paypal.me/yourname" },
  { key: "venmoHandle", label: "Venmo", placeholder: "@yourhandle" },
  { key: "cashAppHandle", label: "Cash App", placeholder: "$yourcashtag" },
];

export function TesterProfileSettings() {
  const navigate = useNavigate();
  const {
    currentUser,
    updateTesterProfile,
    changeEmail,
    updatePaymentMethods,
    signOut,
    deleteAccount,
  } = useAppState();
  const testerProfile = currentUser?.testerProfile ?? null;
  const [draft, setDraft] = useState<TesterProfileDraft>(() =>
    testerProfile
      ? {
          firstName: testerProfile.firstName,
          countryCode: testerProfile.countryCode,
          region: testerProfile.region,
          technologyProficiency: testerProfile.technologyProficiency,
          devices: testerProfile.devices,
          employmentStatus: testerProfile.employmentStatus,
          workArea: testerProfile.workArea,
          paidTestEmailEnabled: testerProfile.paidTestEmailEnabled,
        }
      : {
          firstName: "",
          countryCode: "",
          region: "",
          technologyProficiency: "",
          devices: [],
          employmentStatus: "",
          workArea: "",
          paidTestEmailEnabled: true,
        },
  );
  const [countryInput, setCountryInput] = useState(() =>
    testerProfile ? countryLabelForCode(testerProfile.countryCode) : "",
  );
  const [errors, setErrors] = useState<FormSummaryItem[]>([]);
  const [profileMessage, setProfileMessage] = useState("");
  const [nextEmail, setNextEmail] = useState(currentUser?.email ?? "");
  const [emailMessage, setEmailMessage] = useState("");
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>({
    paypalHandle: currentUser?.paypalHandle ?? "",
    venmoHandle: currentUser?.venmoHandle ?? "",
    cashAppHandle: currentUser?.cashAppHandle ?? "",
  });
  const [paymentMessage, setPaymentMessage] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isSavingPayments, setIsSavingPayments] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");
  const formSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!testerProfile) return;
    setDraft({
      firstName: testerProfile.firstName,
      countryCode: testerProfile.countryCode,
      region: testerProfile.region,
      technologyProficiency: testerProfile.technologyProficiency,
      devices: testerProfile.devices,
      employmentStatus: testerProfile.employmentStatus,
      workArea: testerProfile.workArea,
      paidTestEmailEnabled: testerProfile.paidTestEmailEnabled,
    });
    setCountryInput(countryLabelForCode(testerProfile.countryCode));
  }, [testerProfile]);

  if (!currentUser || currentUser.accountType !== "tester") return null;

  if (!testerProfile) {
    return (
      <AppShell title="Profile" eyebrowLabel={null}>
        <Alert title="Tester profile unavailable" tone="warning">
          We could not load your tester details. Refresh the page or contact support if this
          continues.
        </Alert>
      </AppShell>
    );
  }

  const fieldError = (fieldId: string) =>
    errors.find((error) => error.fieldId === fieldId)?.message;

  const toggleDevice = (device: TesterDevice) => {
    setDraft((current) => ({
      ...current,
      devices: current.devices.includes(device)
        ? current.devices.filter((item) => item !== device)
        : [...current.devices, device],
    }));
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = ([1, 2, 3, 4] as const).flatMap((step) =>
      validateTesterSignupStep(step, draft),
    );
    setErrors(nextErrors);

    if (nextErrors.length > 0) {
      requestAnimationFrame(() => formSummaryRef.current?.focus());
      return;
    }

    setIsSavingProfile(true);
    setProfileMessage("");
    try {
      const result = await updateTesterProfile(draft);
      setProfileMessage(result.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const saveEmail = async () => {
    setIsSavingEmail(true);
    setEmailMessage("");
    try {
      const result = await changeEmail(nextEmail);
      setEmailMessage(result.message);
    } finally {
      setIsSavingEmail(false);
    }
  };

  const savePayments = async (event: FormEvent) => {
    event.preventDefault();
    setIsSavingPayments(true);
    setPaymentMessage("");
    try {
      const result = await updatePaymentMethods(paymentDraft);
      setPaymentMessage(result.message);
    } finally {
      setIsSavingPayments(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    navigate("/get-paid-to-test", { replace: true });
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteMessage("");
    try {
      const result = await deleteAccount();
      setDeleteMessage(result.message);
      if (result.ok) navigate("/get-paid-to-test", { replace: true });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppShell title="Profile" eyebrowLabel={null}>
      <div className={styles.page}>
        <Surface as="section" className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Your tester profile</h2>
              <p>
                Keep these details current so available tests match your experience and devices.
              </p>
            </div>
          </div>
          <form className={styles.form} onSubmit={(event) => void saveProfile(event)} noValidate>
            <FormSummary ref={formSummaryRef} items={errors} />
            <div className={styles.twoColumn}>
              <TextField
                id="tester-first-name"
                label="First name"
                autoComplete="given-name"
                value={draft.firstName}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, firstName: event.target.value }))
                }
                error={fieldError("tester-first-name")}
                required
              />
              <Combobox
                id="tester-country"
                label="Country"
                options={COUNTRY_OPTIONS.map((option) => ({
                  value: option.label,
                  label: option.label,
                }))}
                value={countryInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setCountryInput(value);
                  setDraft((current) => ({
                    ...current,
                    countryCode: countryCodeForLabel(value),
                  }));
                }}
                error={fieldError("tester-country")}
                autoComplete="country-name"
                required
              />
              <TextField
                id="tester-profile-region"
                label="State / province / region (optional)"
                autoComplete="address-level1"
                value={draft.region}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, region: event.target.value }))
                }
              />
            </div>

            <fieldset
              id="tester-technology-proficiency"
              className={styles.fieldset}
              tabIndex={-1}
              aria-invalid={Boolean(fieldError("tester-technology-proficiency"))}
            >
              <legend>Technology proficiency</legend>
              <div className={styles.choices}>
                {TECHNOLOGY_PROFICIENCY_OPTIONS.map((option) => (
                  <Radio
                    key={option.value}
                    name="tester-profile-technology"
                    label={option.label}
                    checked={draft.technologyProficiency === option.value}
                    onChange={() =>
                      setDraft((current) => ({
                        ...current,
                        technologyProficiency: option.value as TechnologyProficiency,
                      }))
                    }
                  />
                ))}
              </div>
              {fieldError("tester-technology-proficiency") ? (
                <InlineValidation>{fieldError("tester-technology-proficiency")}</InlineValidation>
              ) : null}
            </fieldset>

            <fieldset
              id="tester-devices"
              className={styles.fieldset}
              tabIndex={-1}
              aria-invalid={Boolean(fieldError("tester-devices"))}
            >
              <legend>Devices</legend>
              <div className={styles.choices}>
                {TESTER_DEVICE_OPTIONS.map((option) => (
                  <Checkbox
                    key={option.value}
                    label={option.label}
                    checked={draft.devices.includes(option.value)}
                    onChange={() => toggleDevice(option.value)}
                  />
                ))}
              </div>
              {fieldError("tester-devices") ? (
                <InlineValidation>{fieldError("tester-devices")}</InlineValidation>
              ) : null}
            </fieldset>

            <fieldset
              id="tester-employment-status"
              className={styles.fieldset}
              tabIndex={-1}
              aria-invalid={Boolean(fieldError("tester-employment-status"))}
            >
              <legend>Employment status</legend>
              <div className={styles.choices}>
                {EMPLOYMENT_STATUS_OPTIONS.map((option) => (
                  <Radio
                    key={option.value}
                    name="tester-profile-employment"
                    label={option.label}
                    checked={draft.employmentStatus === option.value}
                    onChange={() =>
                      setDraft((current) =>
                        withEmploymentStatus(current, option.value as EmploymentStatus),
                      )
                    }
                  />
                ))}
              </div>
              {fieldError("tester-employment-status") ? (
                <InlineValidation>{fieldError("tester-employment-status")}</InlineValidation>
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
                error={fieldError("tester-work-area")}
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

            <div className={styles.emailPreference}>
              <Switch
                label="Email me when matching paid tests are available"
                aria-describedby="paid-test-email-preference-help"
                checked={draft.paidTestEmailEnabled}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    paidTestEmailEnabled: event.target.checked,
                  }))
                }
              />
              <HelpText id="paid-test-email-preference-help">
                You can turn these notifications off at any time.
              </HelpText>
            </div>

            {profileMessage ? <Alert>{profileMessage}</Alert> : null}
            <div className={styles.actions}>
              <Button type="submit" loading={isSavingProfile} loadingLabel="Saving profile">
                Save tester profile
              </Button>
            </div>
          </form>
        </Surface>

        <Surface as="section" className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Email and account</h2>
              <p>Use this email to sign in and receive account messages.</p>
            </div>
            <Button
              type="button"
              variant="quiet"
              onClick={() => void handleSignOut()}
              loading={isSigningOut}
              loadingLabel="Signing out"
            >
              <LogOut aria-hidden="true" size={16} />
              Sign out
            </Button>
          </div>
          <div className={styles.inlineForm}>
            <TextField
              type="email"
              label="Email address"
              autoComplete="email"
              value={nextEmail}
              onChange={(event) => setNextEmail(event.target.value)}
              required
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void saveEmail()}
              loading={isSavingEmail}
              loadingLabel="Sending"
              disabled={!nextEmail.trim()}
            >
              Send change email link
            </Button>
          </div>
          {emailMessage ? <Alert>{emailMessage}</Alert> : null}
        </Surface>

        <Surface as="section" className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Payout methods</h2>
              <p>Add the account details you want Test4Test to use for paid-test payouts.</p>
            </div>
          </div>
          <form className={styles.form} onSubmit={(event) => void savePayments(event)}>
            <div className={styles.threeColumn}>
              {paymentMethods.map((method) => (
                <TextField
                  key={method.key}
                  label={method.label}
                  placeholder={method.placeholder}
                  value={paymentDraft[method.key]}
                  onChange={(event) =>
                    setPaymentDraft((current) => ({
                      ...current,
                      [method.key]: event.target.value,
                    }))
                  }
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              ))}
            </div>
            {paymentMessage ? <Alert>{paymentMessage}</Alert> : null}
            <div className={styles.actions}>
              <Button type="submit" loading={isSavingPayments} loadingLabel="Saving payouts">
                Save payout methods
              </Button>
            </div>
          </form>
        </Surface>

        <Surface as="section" className={styles.dangerPanel}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Delete account</h2>
              <p>
                Permanently remove your tester profile, test responses, ratings, payout settings,
                and account access.
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setDeleteOpen(true)}>
              <Trash2 aria-hidden="true" size={16} />
              Delete account
            </Button>
          </div>
        </Surface>
      </div>

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete your tester account?"
        description="This permanently removes your tester profile, test history, ratings, payout settings, and account. This cannot be undone."
        footer={
          <div className={styles.dialogActions}>
            <Button
              type="button"
              variant="quiet"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleDelete()}
              loading={isDeleting}
              loadingLabel="Deleting account"
            >
              Yes, delete my tester account
            </Button>
          </div>
        }
      >
        {deleteMessage ? <Alert tone="danger">{deleteMessage}</Alert> : null}
      </Dialog>
    </AppShell>
  );
}
