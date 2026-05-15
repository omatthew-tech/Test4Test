import type { ReactNode } from "react";
import { Surface } from "./Layout";

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
  const cardClasses = ["success-panel", "verification-flow__card", cardClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="verification-flow">
      {hideTitle ? null : (
        <div className="verification-flow__header">
          <h1>{title}</h1>
        </div>
      )}
      <Surface className={cardClasses}>{children}</Surface>
    </div>
  );
}
