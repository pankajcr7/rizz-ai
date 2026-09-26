import { describe, expect, it } from "vitest";
import { cleanDatabaseUrl, DatabaseUrlError, describeDatabaseUrl } from "../src/plans/dbUrl.js";

const GOOD = "postgresql://neondb_owner:abc123@ep-cool-sun-a1b2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const EXPECTED = "postgresql://neondb_owner:abc123@ep-cool-sun-a1b2.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full";

describe("cleanDatabaseUrl", () => {
  it.each([
    ["plain", GOOD],
    ["Neon psql snippet", `psql '${GOOD}'`],
    ["DATABASE_URL= prefix", `DATABASE_URL=${GOOD}`],
    ["double quotes", `"${GOOD}"`],
    ["label + trailing spaces", `Database URL ${GOOD}   `],
  ])("extracts the URL from %s", (_n, raw) => {
    expect(cleanDatabaseUrl(raw)).toBe(EXPECTED);
  });

  it("keeps other ssl modes and params", () => {
    expect(cleanDatabaseUrl("postgres://u:p@db.example.com:5432/app?sslmode=disable&application_name=x")).toBe(
      "postgres://u:p@db.example.com:5432/app?sslmode=disable&application_name=x",
    );
  });

  it.each([
    ["no URL at all", "neondb", /doesn't contain a postgres/],
    ["template host", "postgresql://user:password@hostname/database", /template/],
    ["unfilled password", "postgresql://postgres:[YOUR-PASSWORD]@db.abc.supabase.co:5432/postgres", /YOUR-PASSWORD|template|valid URL/],
    ["unencoded #", "postgresql://u:ab#c@ep-x.neon.tech/neondb", /URL-encode|template/],
  ])("explains %s", (_n, raw, msg) => {
    expect(() => cleanDatabaseUrl(raw)).toThrow(DatabaseUrlError);
    expect(() => cleanDatabaseUrl(raw)).toThrow(msg);
  });

  it("never reveals the password when described", () => {
    const d = describeDatabaseUrl(EXPECTED);
    expect(d).toBe("postgresql://neondb_owner:***@ep-cool-sun-a1b2.ap-southeast-1.aws.neon.tech/neondb");
    expect(d).not.toContain("abc123");
  });
});
