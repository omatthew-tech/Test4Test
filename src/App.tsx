import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppStateProvider, useAppState } from "./context/AppStateContext";
import { BannedPage } from "./pages/BannedPage";
import { EarnPage } from "./pages/EarnPage";
import { HomePage } from "./pages/HomePage";
import { MyTestsPage } from "./pages/MyTestsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ReviseSubmissionPage } from "./pages/ReviseSubmissionPage";
import { SignInPage } from "./pages/SignInPage";
import { SubmissionDetailPage } from "./pages/SubmissionDetailPage";
import { SubmissionsPage } from "./pages/SubmissionsPage";
import { SubmitFlowPage } from "./pages/SubmitFlowPage";
import { TestSessionPage } from "./pages/TestSessionPage";
import { TestSuccessPage } from "./pages/TestSuccessPage";
import { VerifyPage } from "./pages/VerifyPage";

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
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootPage />} />
          <Route path="/sign-in" element={<BanRedirectRoute><SignInPage /></BanRedirectRoute>} />
          <Route path="/submit" element={<BanRedirectRoute><SubmitFlowPage /></BanRedirectRoute>} />
          <Route path="/verify" element={<BanRedirectRoute><VerifyPage /></BanRedirectRoute>} />
          <Route path="/earn" element={<BanRedirectRoute><EarnPage /></BanRedirectRoute>} />
          <Route path="/test/:submissionId" element={<BanRedirectRoute><TestSessionPage /></BanRedirectRoute>} />
          <Route path="/test/:submissionId/success" element={<BanRedirectRoute><TestSuccessPage /></BanRedirectRoute>} />
          <Route path="/my-tests" element={<BanRedirectRoute><MyTestsPage /></BanRedirectRoute>} />
          <Route path="/my-tests/:submissionId" element={<BanRedirectRoute><SubmissionDetailPage /></BanRedirectRoute>} />
          <Route path="/submissions" element={<BanRedirectRoute><SubmissionsPage /></BanRedirectRoute>} />
          <Route path="/submissions/:responseId/revise" element={<BanRedirectRoute><ReviseSubmissionPage /></BanRedirectRoute>} />
          <Route path="/profile" element={<BanRedirectRoute><ProfilePage /></BanRedirectRoute>} />
          <Route path="/banned" element={<BannedOnlyRoute><BannedPage /></BannedOnlyRoute>} />
          <Route path="*" element={<BanRedirectRoute><HomePage /></BanRedirectRoute>} />
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  );
}