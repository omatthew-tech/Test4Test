import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";

export function EmailPreviewPage() {
  const { state } = useAppState();
  const sampleName = state.submissions[0]?.productName ?? "your product";

  return (
    <AppShell title="Email preview" description="The MVP includes a one-time passcode email and a new-feedback email that links people back into the results flow.">
      <div className="detail-grid">
        <Surface className="email-card">
          <span className="eyebrow">OTP delivery email</span>
          <h2>Your Test4Test sign-in code</h2>
          <p>Hello,</p>
          <p>Use the one-time code below to sign in, monitor your submission, and continue earning credits.</p>
          <div className="email-code">482913</div>
          <p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
        </Surface>

        <Surface className="email-card">
          <span className="eyebrow">New feedback email</span>
          <h2>New feedback is ready for {sampleName}</h2>
          <p>Hello,</p>
          <p>Your website or app has been tested and fresh feedback is now ready to review in Test4Test.</p>
          <ul className="check-list">
            <li>Open the response summary to see recurring patterns quickly</li>
            <li>Inspect individual raw responses in full detail</li>
            <li>Rate the quality of each response with a frowny, neutral, or smiley face</li>
          </ul>
          <button type="button" className="button button--primary">View results</button>
        </Surface>
      </div>
    </AppShell>
  );
}