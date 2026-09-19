import type { ComponentType, ReactElement } from "react";
import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { Alert, Button, Container, Skeleton, Stack } from "@test4test/design-system";
import { AppStateProvider, useAppState } from "./context/AppStateContext";
import { AppShell } from "./components/Layout";
import { trackEventOncePerSession } from "./lib/analytics";
import { founderWorkspaceRedirect } from "./lib/accountAccess";
import { useRouteNavigation } from "./lib/routeNavigation";
import styles from "./Application.module.css";

const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));

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
const SharedRecordingPage = lazy(() =>
  import("./pages/SharedRecordingPage").then((m) => ({ default: m.SharedRecordingPage })),
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

const NotFoundPage = lazy(() =>
  import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
);

function RouteNavigation() {
  useRouteNavigation();
  return null;
}

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

function AppStateBoundary({ children }: { children: ReactElement }) {
  const { loadError, isLoading, retryLoad } = useAppState();
  const { pathname } = useLocation();
  const isIndependentPublicRoute =
    pathname === "/blog" || pathname.startsWith("/blog/") || pathname === "/recordings/shared";
  if (!loadError || isIndependentPublicRoute) {
    return <Suspense fallback={<RouteLoading />}>{children}</Suspense>;
  }

  // A failed data load must never reach an auth redirect or look like an empty
  // account. Keep the URL and provide an explicit, user-controlled retry.
  return (
    <AppShell title="Unable to load this page">
      <Stack gap="lg">
        <Alert tone="danger">{loadError}</Alert>
        <div>
          <Button onClick={() => void retryLoad()} loading={isLoading} loadingLabel="Retrying">
            Try again
          </Button>
        </div>
      </Stack>
    </AppShell>
  );
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

export default function App({
  prerenderPath,
  blogPages,
}: {
  prerenderPath?: string;
  blogPages?: { index: ComponentType; post: ComponentType };
} = {}) {
  const Router = prerenderPath ? MemoryRouter : BrowserRouter;
  const BlogIndex = blogPages?.index ?? BlogPage;
  const BlogPost = blogPages?.post ?? BlogPostPage;
  useEffect(() => {
    if (!(import.meta.env.DEV && import.meta.env.VITE_DS_FIXTURES === "1")) {
      trackEventOncePerSession("site_visited");
    }
  }, []);

  return (
    <div className={styles.application}>
      <Router {...(prerenderPath ? { initialEntries: [prerenderPath] } : {})}>
        <RouteNavigation />
        <AppStateProvider>
          <AppStateBoundary>
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
              <Route path="/blog" element={<BlogIndex />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
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
              <Route path="/recordings/shared" element={<SharedRecordingPage />} />
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
                    <NotFoundPage />
                  </BanRedirectRoute>
                }
              />
            </Routes>
          </AppStateBoundary>
        </AppStateProvider>
      </Router>
    </div>
  );
}
