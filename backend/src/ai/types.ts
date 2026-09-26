import type {
  ChatRequestParsed,
  ChatResponse,
  DatePlanRequestParsed,
  DatePlanResponse,
  ExtractResponse,
  ImageInput,
  OpenersResponse,
  ProfileReviewRequestParsed,
  ProfileReviewResponse,
  Platform,
  Preferences,
  SafetyFlag,
  SuggestRequestParsed,
  SuggestResponse,
  ToneId,
} from "@rizz/shared";

/** The AI layer behind the routes; swapped for a fake in tests. */
export interface RizzAI {
  suggest(req: SuggestRequestParsed, forcedFlag: SafetyFlag): Promise<SuggestResponse>;
  openers(args: {
    platform: Platform;
    tone: ToneId;
    bio?: string;
    image?: ImageInput;
    count: number;
    prefs: Preferences;
  }): Promise<OpenersResponse>;
  extract(image: ImageInput, platformHint?: Platform): Promise<ExtractResponse>;
  chat(req: ChatRequestParsed, forcedFlag: SafetyFlag): Promise<ChatResponse>;
  profileReview(req: ProfileReviewRequestParsed): Promise<ProfileReviewResponse>;
  datePlan(req: DatePlanRequestParsed): Promise<DatePlanResponse>;
}

/** The model declined the request (stop_reason "refusal") even after fallbacks. */
export class AiDeclinedError extends Error {
  constructor(detail?: string) {
    super(detail ?? "The AI declined to help with this conversation");
  }
}

/** Transient failure: rate limits, overload, network. Safe to retry. */
export class AiUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
  }
}
