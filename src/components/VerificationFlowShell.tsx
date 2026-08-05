import type { ReactNode } from "react";
import { Card, Container, PageHeader, Stack } from "@test4test/design-system";
import styles from "./VerificationFlowShell.module.css";

export function VerificationFlowShell({
  title,
  cardClassName = "",
  hideTitle = false,
  children,
}: {
  title: string;
  cardClassName?: string;
  hideTitle?: boolean;
  children: ReactNode;
}) {
  const cardClasses = [styles.card, "success-panel", "verification-flow__card", cardClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`${styles.flow} verification-flow`}>
      <Container size="form">
        <Stack gap="lg">
          {hideTitle ? null : <PageHeader title={title} />}
          <Card as="section" className={cardClasses}>
            {children}
          </Card>
        </Stack>
      </Container>
    </div>
  );
}
