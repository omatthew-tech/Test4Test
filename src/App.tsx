import type { ReactElement } from "react";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppStateProvider, useAppState } from "./context/AppStateContext";
import { trackEventOncePerSession } from "./lib/analytics";
import { HomePage } from "./pages/HomePage";

const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const BannedPage = lazy(() => import("./pages/BannedPage").then((m) => ({ default: m.BannedPage })));
const BlogPage = lazy(() => import("./pages/BlogPage").then((m) => ({ default: m.BlogPage })));
const BlogPostPage = lazy(() => import("./pages/BlogPostPage").then((m) => ({ default: m.BlogPostPage })));
const CreditsPage = lazy(() => import("./pages/CreditsPage").then((m) => ({ default: m.CreditsPage })));
const EarnPage = lazy(() => import("./pages/EarnPage").then((m) => ({ default: m.EarnPage })));
const MyTestsPage = lazy(() => import("./pages/MyTestsPage").then((m) => ({ default: m.MyTestsPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const ReviseSubmissionPage = lazy(() => import("./pages/ReviseSubmissionPage").then((m) => ({ default: m.ReviseSubmissionPage })));
const SignInPage = lazy(() => import("./pages/SignInPage").then((m) => ({ default: m.SignInPage })));
const SubmissionDetailPage = lazy(() => import("./pages/SubmissionDetailPage").then((m) => ({ default: m.SubmissionDetailPage })));
const SubmissionsPage = lazy(() => import("./pages/SubmissionsPage").then((m) => ({ default: m.SubmissionsPage })));
const SubmitFlowPage = lazy(() => import("./pages/SubmitFlowPage").then((m) => ({ default: m.SubmitFlowPage })));
const TesterLandingPage = lazy(() => import("./pages/TesterLandingPage").then((m) => ({ default: m.TesterLandingPage })));
const TestSessionPage = lazy(() => import("./pages/TestSessionPage").then((m) => ({ default: m.TestSessionPage })));
const TestSuccessPage = lazy(() => import("./pages/TestSuccessPage").then((m) => ({ default: m.TestSuccessPage })));
const VerifyPage = lazy(() => import("./pages/VerifyPage").then((m) => ({ default: m.VerifyPage })));

function RootPage() {
  const { currentUser, isLoading } = useAppState();

  if (isLoading) {
    return null;
  }

  if (currentUser?.banStatus === "banned") {
    return <Navigate to="/banned" replace />;
  }

  return currentUser ? <Navigate to="/earn" replace /> : <HomePage />;
}

function BanRedirectRoute({ children }: { children: ReactElement }) {
  const { currentUser, isLoading } = useAppState();

  if (isLoading) {
    return null;
  }

  if (currentUser?.banStatus === "banned") {
    return <Navigate to="/banned" replace />;
  }

  return children;
}

function BannedOnlyRoute({ children }: { children: ReactElement }) {
  const { currentUser, isLoading } = useAppState();

  if (isLoading) {
    return null;
  }

  if (!currentUser) {
    return <Navigate to="/sign-in" replace />;
  }

  if (currentUser.banStatus !== "banned") {
    return <Navigate to="/earn" replace />;
  }

  return children;
}

export default function App() {
  useEffect(() => {
    trackEventOncePerSession("site_visited");
  }, []);

  return (
    <AppStateProvider>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<RootPage />} />
            <Route path="/sign-in" element={<BanRedirectRoute><SignInPage /></BanRedirectRoute>} />
            <Route path="/submit" element={<BanRedirectRoute><SubmitFlowPage /></BanRedirectRoute>} />
            <Route path="/verify" element={<BanRedirectRoute><VerifyPage /></BanRedirectRoute>} />
            <Route path="/get-paid-to-test" element={<BanRedirectRoute><TesterLandingPage /></BanRedirectRoute>} />
            <Route path="/blog" element={<BlogPage />} />
            <Route path="/blog/:slug" element={<BlogPostPage />} />
            <Route path="/earn" element={<BanRedirectRoute><EarnPage /></BanRedirectRoute>} />
            <Route path="/test/:submissionId" element={<BanRedirectRoute><TestSessionPage /></BanRedirectRoute>} />
            <Route path="/test/:submissionId/success" element={<BanRedirectRoute><TestSuccessPage /></BanRedirectRoute>} />
            <Route path="/my-tests" element={<BanRedirectRoute><MyTestsPage /></BanRedirectRoute>} />
            <Route path="/my-tests/:submissionId" element={<BanRedirectRoute><SubmissionDetailPage /></BanRedirectRoute>} />
            <Route path="/submissions" element={<BanRedirectRoute><SubmissionsPage /></BanRedirectRoute>} />
            <Route path="/submissions/:responseId/revise" element={<BanRedirectRoute><ReviseSubmissionPage /></BanRedirectRoute>} />
            <Route path="/credits" element={<BanRedirectRoute><CreditsPage /></BanRedirectRoute>} />
            <Route path="/profile" element={<BanRedirectRoute><ProfilePage /></BanRedirectRoute>} />
            <Route path="/admin" element={<BanRedirectRoute><AdminPage /></BanRedirectRoute>} />
            <Route path="/banned" element={<BannedOnlyRoute><BannedPage /></BannedOnlyRoute>} />
            <Route path="*" element={<BanRedirectRoute><HomePage /></BanRedirectRoute>} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppStateProvider>
  );
}
