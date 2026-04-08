import { AppShell, Surface } from "../components/Layout";
import { useAppState } from "../context/AppStateContext";

export function EmailPreviewPage() {
  const { state } = useAppState();
  const ownerProductName = state.submissions[0]?.productName ?? "your app";
  const targetProductName = state.submissions[1]?.productName ?? "their app";
  const testerName = state.users[1]?.displayName ?? "Alex";

  return (
    <AppShell
      title="Email preview"
      description="Preview the editable email system: OTP delivery, plain feedback alerts, and the staged test-back reminder cadence."
    >
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
          <span className="eyebrow">Plain feedback email</span>
          <h2>New feedback for {ownerProductName}</h2>
          <p>Hello,</p>
          <p>Someone just tested your app and your feedback is ready to review.</p>
          <ul className="check-list">
            <li>Open the response summary to spot patterns quickly</li>
            <li>Read the full raw responses when you need detail</li>
            <li>Rate the quality of each response after you review it</li>
          </ul>
          <button type="button" className="button button--primary">View feedback</button>
        </Surface>

        <Surface className="email-card">
          <span className="eyebrow">Reminder stage 1</span>
          <h2>{testerName} tested your app. Please test back {targetProductName}</h2>
          <p>Hello,</p>
          <p>{testerName} just tested {ownerProductName}. If you still owe them a test back, we send a friendly nudge right away while the exchange is still fresh.</p>
          <div className="button-row">
            <button type="button" className="button button--primary">Test back now</button>
            <button type="button" className="button button--secondary">View feedback</button>
          </div>
        </Surface>

        <Surface className="email-card">
          <span className="eyebrow">Reminder stage 2</span>
          <h2>Friendly reminder: please test back {targetProductName}</h2>
          <p>Hello,</p>
          <p>One day later, if you still have not tested back, we send a softer follow-up with the same direct link into the test flow.</p>
          <button type="button" className="button button--primary">Test back now</button>
        </Surface>

        <Surface className="email-card">
          <span className="eyebrow">Final reminder</span>
          <h2>Your test-back rate dropped from 100% to 67%</h2>
          <p>Hey tester,</p>
          <p>You still have not tested back another user's app. This may result in less visibility and less user feedback for {ownerProductName}.</p>
          <p>Don't worry. You can always test back any time.</p>
          <button type="button" className="button button--primary">View test</button>
        </Surface>
      </div>
    </AppShell>
  );
}
