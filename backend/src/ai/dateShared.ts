import type { DatePlanResponse } from "@rizz/shared";
import { SAFETY_MESSAGES } from "../safety/guardrails.js";

export function normalizeDate(out: DatePlanResponse): DatePlanResponse {
  if (out.safety.flag === "possible_minor") {
    return { ideas: [], tip: "", safety: { flag: "possible_minor", message: out.safety.message || SAFETY_MESSAGES.possible_minor } };
  }
  return {
    ideas: out.ideas.filter((i) => i.title && i.ask).slice(0, 3),
    tip: out.tip,
    safety: out.safety.flag === "none" ? { flag: "none", message: "" } : out.safety,
  };
}
