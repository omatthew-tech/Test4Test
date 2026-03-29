import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppStateProvider } from "./context/AppStateContext";
import { EarnPage } from "./pages/EarnPage";
import { HomePage } from "./pages/HomePage";
import { MyTestsPage } from "./pages/MyTestsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SignInPage } from "./pages/SignInPage";
import { SubmissionDetailPage } from "./pages/SubmissionDetailPage";
import { SubmitFlowPage } from "./pages/SubmitFlowPage";
import { TestSessionPage } from "./pages/TestSessionPage";
import { TestSuccessPage } from "./pages/TestSuccessPage";
import { VerifyPage } from "./pages/VerifyPage";
export default function App() {
  return (
    <AppStateProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/submit" element={<SubmitFlowPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/earn" element={<EarnPage />} />
          <Route path="/test/:submissionId" element={<TestSessionPage />} />
          <Route path="/test/:submissionId/success" element={<TestSuccessPage />} />
          <Route path="/my-tests" element={<MyTestsPage />} />
          <Route path="/my-tests/:submissionId" element={<SubmissionDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </AppStateProvider>
  );
}
