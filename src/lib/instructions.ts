export const MAX_INSTRUCTION_STEPS = 5;

function normalizeStep(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseLegacyInstructions(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  return value
    .split(/\r?\n/)
    .map((step) => step.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_INSTRUCTION_STEPS);
}

export function normalizeInstructionSteps(value: unknown, legacyInstructions = "") {
  if (Array.isArray(value)) {
    const steps = value.map(normalizeStep).filter(Boolean).slice(0, MAX_INSTRUCTION_STEPS);

    if (steps.length > 0) {
      return steps;
    }
  }

  return parseLegacyInstructions(legacyInstructions);
}

export function serializeInstructionSteps(steps: string[]) {
  return steps.map(normalizeStep).filter(Boolean).slice(0, MAX_INSTRUCTION_STEPS).join("\n");
}
