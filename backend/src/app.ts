import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { AiDeclinedError, AiUnavailableError } from "./ai/types.js";
import { sendError, v1Routes, type Deps } from "./routes/v1.js";

export interface AppOptions {
  logger?: boolean;
  corsOrigins?: string[];
  /** Local development: don't rate-limit requests from this machine. Never enable in production. */
  exemptLoopback?: boolean;
  /** Behind a load balancer / proxy (Render, Fly, Railway…): read the client IP from X-Forwarded-For. */
  trustProxy?: boolean;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export async function buildApp(deps: Deps, opts: AppOptions = {}) {
  const app = Fastify({
    bodyLimit: 8 * 1024 * 1024, // screenshots
    trustProxy: opts.trustProxy ?? false,
    logger: opts.logger
      ? {
          // Never log chat content or tokens.
          redact: ["req.headers.authorization"],
          serializers: { req: (r) => ({ method: r.method, url: r.url }) },
        }
      : false,
  });

  await app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
    allowList: opts.exemptLoopback ? (req) => LOOPBACK.has(req.ip) : undefined,
  });
  // Only browsers send Origin; the mobile apps are unaffected. Default allows the local Expo web dev server.
  await app.register(cors, {
    origin: opts.corsOrigins?.length ? opts.corsOrigins : ["http://localhost:8081", "http://127.0.0.1:8081"],
    allowedHeaders: ["content-type", "authorization"],
    exposedHeaders: ["x-quota-used", "x-quota-limit"],
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return sendError(reply, 400, "invalid_request", `${first?.path.join(".") || "body"}: ${first?.message}`);
    }
    if (err instanceof AiDeclinedError) return sendError(reply, 422, "ai_declined", err.message);
    if (err instanceof AiUnavailableError) {
      req.log.warn({ err: err.message, cause: (err.cause as Error | undefined)?.message }, "ai unavailable");
      return sendError(reply, 503, "ai_unavailable", err.message);
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      const code = status === 429 ? "quota_exceeded" : "invalid_request";
      return sendError(reply, status, code, (err as Error).message);
    }
    req.log.error(err);
    return sendError(reply, 500, "internal", "Something went wrong");
  });

  app.get("/health", async () => ({ ok: true }));
  await app.register(async (scope) => v1Routes(scope, deps));
  return app;
}
