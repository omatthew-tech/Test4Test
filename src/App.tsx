import type { ReactElement } from "react";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Container, Skeleton, Stack } from "@test4test/design-system";
import { AppStateProvider, useAppState } from "./context/AppStateContext";
import { trackEventOncePerSession } from "./lib/analytics";
import { founderWorkspaceRedirect } from "./lib/accountAccess";
import { HomePage } from "./pages/HomePage";
import styles from "./Application.module.css";

const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const AnalyticsPage = lazy(() =>
  import("./pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);
const BannedPage = lazy(() =>
  import("./pages/BannedPage").then((m) => ({ default: m.BannedPage })),
);
const BlogPage = lazy(() => import("./pages/BlogPage").then((m) => ({ default: m.BlogPage })));
const BlogPostPage = lazy(() =>
  import("./pages/BlogPostPage").then((m) => ({ default: m.BlogPostPage })),
);
const CreditsPage = lazy(() =>
  import("./pages/CreditsPage").then((m) => ({ default: m.CreditsPage })),
);
const EarnPage = lazy(() => import("./pages/EarnPage").then((m) => ({ default: m.EarnPage })));
const EmailPreviewPage = lazy(() =>
  import("./pages/EmailPreviewPage").then((m) => ({ default: m.EmailPreviewPage })),
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const RecordingViewPage = lazy(() =>
  import("./pages/RecordingViewPage").then((m) => ({ default: m.RecordingViewPage })),
);
const ReviseSubmissionPage = lazy(() =>
  import("./pages/ReviseSubmissionPage").then((m) => ({ default: m.ReviseSubmissionPage })),
);
const SharePage = lazy(() => import("./pages/SharePage").then((m) => ({ default: m.SharePage })));
const SignInPage = lazy(() =>
  import("./pages/SignInPage").then((m) => ({ default: m.SignInPage })),
);
const SubmissionsPage = lazy(() =>
  import("./pages/SubmissionsPage").then((m) => ({ default: m.SubmissionsPage })),
);
const SubmitFlowPage = lazy(() =>
  import("./pages/SubmitFlowPage").then((m) => ({ default: m.SubmitFlowPage })),
);
const TesterLandingPage = lazy(() =>
  import("./pages/TesterLandingPage").then((m) => ({ default: m.TesterLandingPage })),
);
const TesterSignupPage = lazy(() =>
  import("./pages/TesterSignupPage").then((m) => ({ default: m.TesterSignupPage })),
);
const TestSessionPage = lazy(() =>
  import("./pages/TestSessionPage").then((m) => ({ default: m.TestSessionPage })),
);
const TestSuccessPage = lazy(() =>
  import("./pages/TestSuccessPage").then((m) => ({ default: m.TestSuccessPage })),
);
const VerifyPage = lazy(() =>
  import("./pages/VerifyPage").then((m) => ({ default: m.VerifyPage })),
);

function RouteLoading() {
  return (
    <Container>
      <Stack aria-busy="true" aria-live="polite" gap="lg" role="status">
        <span className="ds-sr-only">Loading page</span>
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </Stack>
    </Container>
  );
}

function RootPage() {
  const { currentUser, isLoading } = useAppState();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (currentUser?.banStatus === "banned") {
    return <Navigate to="/banned" replace />;
  }

  return currentUser ? <Navigate to="/earn" replace /> : <HomePage />;
}

function BanRedirectRoute({ children }: { children: ReactElement }) {
  const { currentUser, isLoading } = useAppState();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (currentUser?.banStatus === "banned") {
    return <Navigate to="/banned" replace />;
  }

  return children;
}

function FounderWorkspaceRoute({ children }: { children: ReactElement }) {
  const { currentUser, isLoading } = useAppState();
  const location = useLocation();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (currentUser?.banStatus === "banned") {
    return <Navigate to="/banned" replace />;
  }

  if (founderWorkspaceRedirect(currentUser?.accountType)) {
    return <Navigate to={{ pathname: "/earn", search: location.search }} replace />;
  }

  return children;
}

function BannedOnlyRoute({ children }: { children: ReactElement }) {
  const { currentUser, isLoading } = useAppState();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (!currentUser) {
    return <Navigate to="/sign-in" replace />;
  }

  if (currentUser.banStatus !== "banned") {
    return <Navigate to="/earn" replace />;
  }

  return children;
}

function AuthenticatedRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const { currentUser, isLoading } = useAppState();

  if (isLoading) {
    return <RouteLoading />;
  }

  if (currentUser?.banStatus === "banned") {
    return <Navigate to="/banned" replace />;
  }

  if (!currentUser) {
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/sign-in?returnTo=${returnTo}`} replace />;
  }

  if (founderWorkspaceRedirect(currentUser.accountType)) {
    return <Navigate to={{ pathname: "/earn", search: location.search }} replace />;
  }

  return children;
}

function LegacyResultsRedirect() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const destination = searchParams.get("response")?.trim() ? "/recordings" : "/analytics";
  const search = searchParams.toString();

  return <Navigate to={`${destination}${search ? `?${search}` : ""}`} replace />;
}

export default function App() {
  useEffect(() => {
    if (!(import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1")) {
      trackEventOncePerSession("site_visited");
    }
  }, []);

  return (
    <div className={styles.application}>
      <BrowserRouter>
        <AppStateProvider>
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<RootPage />} />
              <Route
                path="/sign-in"
                element={
                  <BanRedirectRoute>
                    <SignInPage />
                  </BanRedirectRoute>
                }
              />
              <Route
                path="/submit"
                element={
                  <FounderWorkspaceRoute>
                    <SubmitFlowPage />
                  </FounderWorkspaceRoute>
                }
              />
              <Route
                path="/verify"
                element={
                  <BanRedirectRoute>
                    <VerifyPage />
                  </BanRedirectRoute>
                }
              />
              <Route
                path="/get-paid-to-test"
                element={
                  <BanRedirectRoute>
                    <TesterLandingPage />
                  </BanRedirectRoute>
                }
              />
              <Route
                path="/get-paid-to-test/signup"
                element={
                  <BanRedirectRoute>
                    <TesterSignupPage />
                  </BanRedirectRoute>
                }
              />
              <Route path="/blog" element={<BlogPage />} />
              <Route path="/blog/:slug" element={<BlogPostPage />} />
              <Route
                path="/earn"
                element={
                  <BanRedirectRoute>
                    <EarnPage />
                  </BanRedirectRoute>
                }
              />
              <Route
                path="/share"
                element={
                  <AuthenticatedRoute>
                    <SharePage />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <AuthenticatedRoute>
                    <AnalyticsPage />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/recordings"
                element={
                  <AuthenticatedRoute>
                    <RecordingViewPage />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/email-preview"
                element={
                  <FounderWorkspaceRoute>
                    <EmailPreviewPage />
                  </FounderWorkspaceRoute>
                }
              />
              <Route
                path="/test/:submissionId"
                element={
                  <BanRedirectRoute>
                    <TestSessionPage />
                  </BanRedirectRoute>
                }
              />
              <Route
                path="/test/:submissionId/success"
                element={
                  <BanRedirectRoute>
                    <TestSuccessPage />
                  </BanRedirectRoute>
                }
              />
              <Route path="/my-tests" element={<LegacyResultsRedirect />} />
              <Route path="/my-tests/:submissionId" element={<LegacyResultsRedirect />} />
              <Route
                path="/submissions"
                element={
                  <AuthenticatedRoute>
                    <SubmissionsPage />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/submissions/:responseId/revise"
                element={
                  <AuthenticatedRoute>
                    <ReviseSubmissionPage />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/credits"
                element={
                  <AuthenticatedRoute>
                    <CreditsPage />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <BanRedirectRoute>
                    <ProfilePage />
                  </BanRedirectRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <AuthenticatedRoute>
                    <AdminPage />
                  </AuthenticatedRoute>
                }
              />
              <Route
                path="/banned"
                element={
                  <BannedOnlyRoute>
                    <BannedPage />
                  </BannedOnlyRoute>
                }
              />
              <Route
                path="*"
                element={
                  <BanRedirectRoute>
                    <HomePage />
                  </BanRedirectRoute>
                }
              />
            </Routes>
          </Suspense>
        </AppStateProvider>
      </BrowserRouter>
    </div>
  );
}
