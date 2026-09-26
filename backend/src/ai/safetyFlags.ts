import type { SafetyFlag } from "@rizz/shared";

const SEVERITY: SafetyFlag[] = ["none", "uncomfortable", "user_harassing", "not_interested", "possible_minor"];

/** The app's deterministic flag can only be escalated by the model, never cleared. */
export function mergeFlag(forced: SafetyFlag, model: SafetyFlag): SafetyFlag {
  return SEVERITY.indexOf(model) > SEVERITY.indexOf(forced) ? model : forced;
}
