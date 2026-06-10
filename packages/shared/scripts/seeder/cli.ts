/**
 * Bootstrap for the Langfuse seed CLI.
 *
 * Deliberately imports nothing from src/: importing the server barrel parses
 * the shared env schema at module load, which crashes with a raw ZodError
 * when the repo-root .env is missing — exactly the fresh-clone situation
 * where the CLI must instead print the fix. This file prechecks the env,
 * then dynamically loads ./cli-main which contains the actual CLI.
 */
const ENV_FIX = "cp .env.dev.example .env  (then review required values)";

// Vars without defaults in the shared env schema; absence makes the
// src/server import itself throw before any CLI code can run.
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "CLICKHOUSE_URL",
  "CLICKHOUSE_USER",
  "CLICKHOUSE_PASSWORD",
];

const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    `error: missing env vars: ${missing.join(", ")} — is the repo-root .env present?`,
  );
  console.error(`fix:   ${ENV_FIX}`);
  process.exitCode = 1;
} else {
  // winston's console transport writes to stdout and src/server logs during
  // import; --json promises only the JSON summary on stdout, so raise the
  // level before anything loads (cli-main silences transports as a backstop).
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- CLI script, not a turbo task
  if (process.argv.includes("--json") && !process.env.LANGFUSE_LOG_LEVEL) {
    // eslint-disable-next-line turbo/no-undeclared-env-vars
    process.env.LANGFUSE_LOG_LEVEL = "error";
  }
  import("./cli-main.js")
    .then((cliMain) => cliMain.run())
    .catch((error: unknown) => {
      // Residual env-schema failures (malformed values) and any other
      // import-time crash still get an actionable line instead of nothing.
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown");
      console.error(`error: failed to start the seed CLI: ${message}`);
      console.error(`fix:   ${ENV_FIX}`);
      process.exitCode = 1;
    });
}
