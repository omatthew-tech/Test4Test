import type { EarnExperimentReport } from "../lib/earnExperiment";

export const earnExperimentFixture: EarnExperimentReport = {
  key: "earn_activation_v1",
  status: "running",
  startedAt: "2026-09-19T12:00:00Z",
  endedAt: null,
  asOf: "2026-09-26T12:00:00Z",
  variants: [
    {
      variant: "A",
      assigned: 30,
      exposed: 24,
      unexposed: 6,
      completed: 12,
      notCompleted: 12,
      completionPercent: 50,
      medianSeconds: 4200,
    },
    {
      variant: "B",
      assigned: 28,
      exposed: 25,
      unexposed: 3,
      completed: 10,
      notCompleted: 15,
      completionPercent: 40,
      medianSeconds: 8100,
    },
  ],
  sources: [
    { variant: "A", stage: "exposure", source: "signup_onboarding", users: 24 },
    { variant: "B", stage: "exposure", source: "signup_onboarding", users: 25 },
    { variant: "A", stage: "completion", source: "feedback_email", users: 7 },
    { variant: "A", stage: "completion", source: "normal_sign_in", users: 5 },
    { variant: "B", stage: "completion", source: "normal_sign_in", users: 10 },
  ],
};
