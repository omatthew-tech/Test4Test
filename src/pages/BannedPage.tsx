import { ShieldAlert } from "lucide-react";
import { AppShell, Surface } from "../components/Layout";

export function BannedPage() {
  return (
    <AppShell variant="marketing" hideMemberChrome eyebrowLabel={null}>
      <div className="banned-page">
        <Surface className="banned-page__card">
          <div className="banned-page__badge" aria-hidden="true">
            <ShieldAlert size={22} />
          </div>
          <div className="banned-page__copy">
            <span className="eyebrow">Account unavailable</span>
            <h1>Your account can&apos;t access Test4Test right now.</h1>
            <p>
              We have temporarily restricted access to your account. This could be for a number of reasons, including suspicious behavior, low quality reviews, innapropiate test submissions, etc. If you believe this is a mistake, email <a href="mailto:support@test4test.io">support@test4test.io</a>
            </p>
          </div>
        </Surface>
      </div>
    </AppShell>
  );
}