export function StepIndicator({
  steps,
  currentStep,
}: {
  steps: string[];
  currentStep: number;
}) {
  return (
    <ol className="step-indicator" aria-label="Submission steps">
      {steps.map((step, index) => {
        const state =
          index < currentStep ? "done" : index === currentStep ? "current" : "upcoming";

        return (
          <li
            key={step}
            className={`step-indicator__item step-indicator__item--${state}`}
            aria-current={state === "current" ? "step" : undefined}
            aria-label={`${index + 1}. ${step}`}
          >
            <span className="step-indicator__dot">{index + 1}</span>
            <span className="step-indicator__label">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
