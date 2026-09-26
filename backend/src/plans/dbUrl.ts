/**
 * Make DATABASE_URL robust to common copy-paste mistakes — e.g. Neon's
 * "Connect" dialog shows `psql 'postgresql://…'` by default — and produce a
 * clear error (without the password) when the value can't be a Postgres URL.
 */

const URL_RE = /postgres(?:ql)?:\/\/[^\s'"`]+/i;
const PLACEHOLDER_HOSTS = new Set(["hostname", "host", "your-host", "localhost-placeholder", "base"]);

export class DatabaseUrlError extends Error {}

export function cleanDatabaseUrl(raw: string): string {
  const match = raw.match(URL_RE);
  if (!match) {
    throw new DatabaseUrlError(
      "DATABASE_URL doesn't contain a postgres:// or postgresql:// URL. Paste only the connection string, e.g. postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require",
    );
  }
  let url: URL;
  try {
    url = new URL(match[0]);
  } catch {
    throw new DatabaseUrlError(
      "DATABASE_URL isn't a valid URL. If your password contains characters like # / ? @ %, URL-encode it (or reset it to letters and numbers).",
    );
  }
  const host = url.hostname;
  if (!host || PLACEHOLDER_HOSTS.has(host.toLowerCase()) || /[[\]]/.test(decodeURIComponent(url.password))) {
    throw new DatabaseUrlError(
      `DATABASE_URL looks like a template (host "${host || "missing"}"${url.password.includes("%5B") || url.password.includes("[") ? ", password still [YOUR-PASSWORD]" : ""}). Copy the real connection string from your database dashboard.`,
    );
  }
  // pg already treats require/prefer/verify-ca as verify-full; say so explicitly to keep full
  // certificate checking and silence its deprecation warning.
  const mode = url.searchParams.get("sslmode");
  if (mode && ["require", "prefer", "verify-ca"].includes(mode)) url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

/** Safe to log: scheme, user, host and database — never the password. */
export function describeDatabaseUrl(clean: string): string {
  const u = new URL(clean);
  return `${u.protocol}//${u.username ? `${u.username}:***@` : ""}${u.host}${u.pathname}`;
}
