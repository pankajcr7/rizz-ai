/** Opt-in live evaluation. Only the synthetic fixtures below go to the provider. */
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { SuggestRequestSchema } from "@rizz/shared";
import { createAIFromEnv } from "../src/ai/providers.js";
import { precheck } from "../src/safety/guardrails.js";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Usage: npm run eval:replies -- /absolute/path/report.json");
const allFixtures = JSON.parse(await readFile(new URL("./replies.json", import.meta.url), "utf8")) as {
  id: string; review: string; request: unknown;
}[];
const selectedIds = process.argv.slice(3);
if (selectedIds.some(id => !allFixtures.some(f => f.id === id))) throw new Error("Unknown fixture ID");
const fixtures = selectedIds.length ? allFixtures.filter(f => selectedIds.includes(f.id)) : allFixtures;
const { ai, description } = createAIFromEnv(process.env);
const results = [];
for (const fixture of fixtures) {
  // This is a review tool, not a load test; space calls for free-tier TPM limits.
  if (results.length) await setTimeout(35_000);
  const req = SuggestRequestSchema.parse(fixture.request);
  const check = precheck(req.messages, [req.draft ?? "", req.prefs.aboutMe ?? "", ...(req.earlier ?? []).map(m => m.text)]);
  if (check.block) throw new Error(`Fixture ${fixture.id} blocked before generation`);
  const start = Date.now();
  try {
    const response = await ai.suggest(req, check.forcedFlag);
    results.push({ ...fixture, response, elapsedMs: Date.now() - start });
    console.log(`${fixture.id}: ${JSON.stringify(response.suggestions.map(s => s.text))}`);
  } catch {
    // Provider error bodies can contain request metadata. Keep reports shareable.
    results.push({ ...fixture, error: "Generation failed", elapsedMs: Date.now() - start });
    console.error(`${fixture.id}: failed`);
    process.exitCode = 1;
    break; // Avoid spending more quota when the provider is unavailable.
  }
  await writeFile(outputPath, JSON.stringify({ provider: description, results }, null, 2) + "\n");
}
await writeFile(outputPath, JSON.stringify({ provider: description, results }, null, 2) + "\n");
console.log(`Saved ${results.length} cases. Review every alternative against each case's rubric; generation success is not a quality score.`);
