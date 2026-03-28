import type { ReactNode } from "react";
import { Surface } from "./Layout";

export function VerificationFlowShell({
  title,
  cardClassName = "",
  children,
}: {
  title: string;
  cardClassName?: string;
  children: ReactNode;
}) {
  const cardClasses = ["success-panel", "verification-flow__card", cardClassName]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="verification-flow">
      <div className="verification-flow__header">
        <h1>{title}</h1>
      </div>
      <Surface className={cardClasses}>{children}</Surface>
    </div>
  );
}