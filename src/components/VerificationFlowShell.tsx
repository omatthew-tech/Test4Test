import type { ReactNode } from "react";
import { Card, Container, PageHeader, Stack } from "@test4test/design-system";
import styles from "./VerificationFlowShell.module.css";

export function VerificationFlowShell({
  title,
  cardClassName = "",
  className = "",
  hideTitle = false,
  leadingContent,
  trailingContent,
  children,
}: {
  title: string;
  cardClassName?: string;
  className?: string;
  hideTitle?: boolean;
  leadingContent?: ReactNode;
  trailingContent?: ReactNode;
  children: ReactNode;
}) {
  const cardClasses = [styles.card, "success-panel", "verification-flow__card", cardClassName]
    .filter(Boolean)
    .join(" ");
  const flowClasses = [
    styles.flow,
    leadingContent ? styles.flowWithLeadingContent : "",
    "verification-flow",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={flowClasses}>
      <Container size="form">
        <Stack className={styles.content} gap="lg">
          {leadingContent}
          {hideTitle ? null : <PageHeader title={title} />}
          <Card as="section" className={cardClasses}>
            {children}
          </Card>
          {trailingContent}
        </Stack>
      </Container>
    </div>
  );
}
