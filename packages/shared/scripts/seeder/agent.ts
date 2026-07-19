/**
 * Agentic seeder entrypoint for PR preview environments.
 *
 * Runs as a one-shot Job inside a preview namespace when an allowlisted author
 * comments `@seeder <prompt>` on a preview-labeled PR (dispatch + result
 * posting live in langfuse/infrastructure, k8s/preview). An agent drives the
 * seed CLI (cli.ts, same contract as `pnpm run seed`) against THIS preview's
 * datastores, then reports back — driven through @langfuse/shared's own
 * `generateLLMText` (the AI SDK boundary that also backs LLM-as-a-judge), so
 * the seeder reuses the repo's single Anthropic path rather than a second SDK.
 *
 * Output contract with the infrastructure job (keep in sync with
 * k8s/preview/README.md "Agentic seeder"): the markdown between the marker
 * lines below is posted VERBATIM to the PR; everything else on stdout/stderr
 * stays in the pod logs. Exactly one result block is emitted, success or
 * failure, and a non-clean finish exits non-zero so the dispatcher uses its
 * "did not finish cleanly" framing.
 *
 * This bootstrap imports nothing from src/ (importing the shared server barrel
 * parses the env schema, which throws on a missing env before a result block
 * can be emitted). It dynamically loads ./agent-main.js — mirroring
 * cli.ts/cli-main.ts — inside a try/catch that turns any load- or run-time
 * failure into a result block. The env contract lives in agent-main.ts.
 */
const BEGIN_MARK = "-----BEGIN SEEDER RESULT-----";
const END_MARK = "-----END SEEDER RESULT-----";

const emitResult = (markdown: string): void => {
  console.log(`${BEGIN_MARK}\n${markdown.trim()}\n${END_MARK}`);
};

const boot = async (): Promise<void> => {
  // Dynamic import: agent-main pulls in @langfuse/shared/src/server (env-schema
  // parse), so any failure there must land in the catch below, not at load.
  const agentMain = await import("./agent-main.js");
  const { markdown, ok } = await agentMain.run();
  emitResult(markdown);
  if (!ok) process.exitCode = 1;
};

boot().catch((error: unknown) => {
  // Always emit a result block — the dispatcher posts ONLY this block, so a
  // bare crash would otherwise surface as an unexplained failure on the PR.
  console.error(error);
  const detail = error instanceof Error ? error.message : String(error);
  emitResult(
    `⚠️ The seeder agent hit an error before finishing: ${detail}\n\n` +
      "Check the job logs in the preview cluster, then re-post the comment to retry.",
  );
  process.exitCode = 1;
});
