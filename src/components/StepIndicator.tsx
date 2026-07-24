import { Stepper } from "@test4test/design-system";

export function StepIndicator({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  const normalizedSteps = steps.map((label, index) => ({ id: String(index), label }));
  return <Stepper steps={normalizedSteps} currentStep={String(currentStep)} />;
}
