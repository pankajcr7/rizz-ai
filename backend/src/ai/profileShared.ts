import type { ProfileReviewRequestParsed, ProfileReviewResponse } from "@rizz/shared";
import { SAFETY_MESSAGES } from "../safety/guardrails.js";

const clamp10 = (n: number) => Math.max(1, Math.min(10, Math.round(n * 10) / 10));

export function normalizeProfile(out: ProfileReviewResponse, req: ProfileReviewRequestParsed): ProfileReviewResponse {
  if (out.safety.flag === "possible_minor") {
    return {
      score: 0,
      firstImpression: "",
      photos: [],
      bio: null,
      strengths: [],
      fixes: [],
      roast: null,
      safety: { flag: "possible_minor", message: out.safety.message || SAFETY_MESSAGES.possible_minor },
    };
  }
  return {
    score: clamp10(out.score),
    firstImpression: out.firstImpression,
    photos: out.photos
      .filter((p) => p.index >= 1 && p.index <= req.images.length)
      .map((p) => ({ ...p, index: Math.round(p.index), score: clamp10(p.score) })),
    bio: req.bio && out.bio ? { ...out.bio, score: clamp10(out.bio.score), rewrites: out.bio.rewrites.slice(0, 3) } : null,
    strengths: out.strengths.slice(0, 5),
    fixes: out.fixes.slice(0, 3),
    roast: req.roast ? out.roast : null,
    safety: out.safety.flag === "none" ? { flag: "none", message: "" } : out.safety,
  };
}
