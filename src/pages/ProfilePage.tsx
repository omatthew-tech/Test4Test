import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  LogOut,
  Mail,
  PencilLine,
  Trash2,
  UserRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";

export function ProfilePage() {
  const navigate = useNavigate();
  const { currentUser, signOut, changeEmail, deleteAccount } = useAppState();

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [nextEmail, setNextEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!currentUser) {
    return (
      <AppShell title="Profile" eyebrowLabel={null}>
        <div className="page-stack">
          <Surface>
            <div className="empty-state empty-state--left">
              <UserRound size={24} />
              <h3>Sign in to launch your account</h3>
              <p>
                Submit an app and verify your email to unlock shared data, credits,
                and live results.
              </p>
              <Link to="/submit" className="button button--primary">
                Submit your app
                <ArrowRight size={16} />
              </Link>
            </div>
          </Surface>
        </div>
      </AppShell>
    );
  }

  const startEmailEdit = () => {
    setNextEmail(currentUser.email);
    setEmailMessage("");
    setIsEditingEmail(true);
  };

  const handleChangeEmail = async () => {
    setIsSavingEmail(true);
    const result = await changeEmail(nextEmail);
    setEmailMessage(result.message);
    setIsSavingEmail(false);

    if (result.ok) {
      setIsEditingEmail(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    navigate("/");
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);

    try {
      const result = await deleteAccount();
      setDeleteMessage(result.message);

      if (result.ok) {
        setShowDeleteConfirm(false);
        navigate("/");
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <AppShell title="Profile" eyebrowLabel={null}>
      <div className="page-stack profile-page profile-page--settings">
        <div className="profile-settings-grid profile-settings-grid--simple">
          <Surface className="profile-panel profile-panel--account">
            <div className="section-heading section-heading--split profile-section-heading">
              <div>
                <h2>Account settings</h2>
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
              >
                <LogOut size={16} />
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            </div>

            <div className="profile-email-card">
              <div className="profile-email-card__icon">
                <Mail size={18} />
              </div>
              <div className="profile-email-card__content">
                <small>Current email</small>
                <strong>{currentUser.email}</strong>
              </div>
            </div>

            {isEditingEmail ? (
              <div className="profile-inline-form">
                <label className="field">
                  <span>New email address</span>
                  <input
                    type="email"
                    value={nextEmail}
                    onChange={(event) => setNextEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>
                <div className="inline-actions profile-inline-actions">
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => void handleChangeEmail()}
                    disabled={isSavingEmail || !nextEmail.trim()}
                  >
                    {isSavingEmail ? "Saving..." : "Send change email link"}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => {
                      setIsEditingEmail(false);
                      setEmailMessage("");
                    }}
                    disabled={isSavingEmail}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="button button--secondary profile-action-button" onClick={startEmailEdit}>
                <PencilLine size={16} />
                Change email
              </button>
            )}

            {emailMessage ? <div className="callout callout--soft">{emailMessage}</div> : null}
          </Surface>

          <Surface className="profile-panel profile-panel--danger">
            <div className="section-heading profile-section-heading">
              <div>
                <h2>Delete account</h2>
              </div>
            </div>
            <p className="profile-danger-copy">
              Deleting your account permanently removes your apps, responses, ratings, and credits.
            </p>
            <button
              type="button"
              className="button button--secondary profile-delete-button"
              onClick={() => {
                setDeleteMessage("");
                setShowDeleteConfirm(true);
              }}
            >
              <Trash2 size={16} />
              Delete account
            </button>
            </Surface>
        </div>

        {showDeleteConfirm ? (
          <div className="account-modal-backdrop" role="presentation" onClick={() => setShowDeleteConfirm(false)}>
            <div
              className="account-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Confirm account deletion"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="account-modal__header">
                <div className="account-modal__badge">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h2>Delete your account?</h2>
                  <p>
                    This permanently removes your Test4Test account, your apps, your feedback, and your credits.
                    This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="inline-actions profile-inline-actions profile-inline-actions--danger">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeletingAccount}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button--primary profile-delete-confirm"
                  onClick={() => void handleDeleteAccount()}
                  disabled={isDeletingAccount}
                >
                  <Trash2 size={16} />
                  {isDeletingAccount ? "Deleting account..." : "Yes, delete my account"}
                </button>
              </div>
              {deleteMessage ? <div className="callout callout--warning">{deleteMessage}</div> : null}
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}