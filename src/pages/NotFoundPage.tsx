import { Link } from "@test4test/design-system";
import { AppShell } from "../components/Layout";

export function NotFoundPage() {
  return (
    <AppShell
      title="Page not found"
      eyebrowLabel="404"
      description="The page you're looking for doesn't exist."
      headerAlignment="center"
      actions={<Link to="/">Go to homepage</Link>}
    >
      {null}
    </AppShell>
  );
}
