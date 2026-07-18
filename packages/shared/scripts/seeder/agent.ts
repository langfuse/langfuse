/**
 * Agentic seeder entrypoint for PR preview environments.
 *
 * Runs as a one-shot Job inside a preview namespace when an allowlisted author
 * comments `@seeder <prompt>` on a preview-labeled PR (dispatch + result
 * posting live in langfuse/infrastructure, k8s/preview). An Anthropic-powered
 * agent drives the seed CLI (cli.ts, same contract as `pnpm run seed`) against
 * THIS preview's datastores, then reports back.
 *
 * Contract with the infrastructure job (keep in sync with
 * k8s/preview/README.md "Agentic seeder" in langfuse/infrastructure):
 *   input env:
 *     SEEDER_AGENT_PROMPT_FILE  path to the user's prompt (required)
 *     SEEDER_PR_NUMBER          PR number (for fetch_pr_diff)
 *     SEEDER_COMMENT_ID         triggering comment id (informational)
 *     LANGFUSE_PREVIEW_URL      public base URL of this preview (deep links)
 *     LANGFUSE_WEB_URL          in-cluster web URL (informational)
 *     ANTHROPIC_API_KEY         read by the SDK
 *     + the same datastore env the seed CLI needs (DATABASE_URL, CLICKHOUSE_*)
 *   output: the markdown between the marker lines below is posted VERBATIM to
 *     the PR; everything else on stdout/stderr stays in the pod logs. Always
 *     emit exactly one result block, success or failure.
 *
 * Like cli.ts, this file must not import from src/ at module load (the shared
 * env schema would throw before we can emit a result block) — all seeding goes
 * through the compiled cli.js as a subprocess, which also keeps the agent on
 * the CLI's public scenario/flag/JSON-summary contract.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

import Anthropic from "@anthropic-ai/sdk";

const BEGIN_MARK = "-----BEGIN SEEDER RESULT-----";
const END_MARK = "-----END SEEDER RESULT-----";

// Job entrypoint, not a turbo task — reads its env contract directly. The
// full contract is documented in the header comment above.
/* eslint-disable turbo/no-undeclared-env-vars */
const ENV = {
  promptFile: process.env.SEEDER_AGENT_PROMPT_FILE,
  prNumber: process.env.SEEDER_PR_NUMBER,
  previewUrl: process.env.LANGFUSE_PREVIEW_URL,
  nextauthUrl: process.env.NEXTAUTH_URL,
  model: process.env.SEEDER_AGENT_MODEL,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
};
/* eslint-enable turbo/no-undeclared-env-vars */

const MODEL = ENV.model ?? "claude-opus-4-8";
const MAX_ITERATIONS = 24; // agent turns; the Job's activeDeadlineSeconds is the hard stop
const CLI_TIMEOUT_MS = 6 * 60 * 1000; // per seed run; several must fit in one Job
const MAX_TOOL_RESULT_CHARS = 20_000;
const MAX_DIFF_CHARS = 80_000;

const execFileAsync = promisify(execFile);

const emitResult = (markdown: string): void => {
  console.log(`${BEGIN_MARK}\n${markdown.trim()}\n${END_MARK}`);
};

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}\n… [truncated]` : text;

/**
 * Run the compiled seed CLI (dist/scripts/seeder/cli.js, sibling of this
 * file). No shell — args go straight to execFile. NEXTAUTH_URL is pointed at
 * the preview's public URL so the CLI's JSON-summary `links` are directly
 * postable to the PR.
 */
const runSeedCli = async (
  args: string[],
): Promise<{ ok: boolean; output: string }> => {
  const cliPath = path.join(__dirname, "cli.js");
  const env = {
    ...process.env,
    NEXTAUTH_URL: ENV.previewUrl ?? ENV.nextauthUrl,
    LANGFUSE_LOG_LEVEL: "error",
  };
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [cliPath, ...args],
      { env, timeout: CLI_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
    );
    // With --json the last stdout line is the machine-readable summary; keep
    // the whole (truncated) output anyway so the model sees doctor/list text.
    const output = [stdout.trim(), stderr.trim()]
      .filter(Boolean)
      .join("\n--- stderr ---\n");
    return { ok: true, output: truncate(output, MAX_TOOL_RESULT_CHARS) };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; message?: string };
    const output = [e.message, e.stdout?.trim(), e.stderr?.trim()]
      .filter(Boolean)
      .join("\n");
    return { ok: false, output: truncate(output, MAX_TOOL_RESULT_CHARS) };
  }
};

// Flag/scenario tokens the CLI accepts; excludes whitespace and anything that
// needs quoting so tool inputs stay auditable in logs.
const SAFE_ARG = /^[A-Za-z0-9@._:/=-]+$/;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_scenarios",
    description:
      "List the available seed scenarios with their flags and descriptions. " +
      "Call this first to learn what can be seeded and which flags exist.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "seed_doctor",
    description:
      "Diagnose the seeding stack (Postgres/ClickHouse connectivity, seed " +
      "project). Use when a seed run fails for unclear reasons.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "run_seed_scenario",
    description:
      "Run one seed scenario against this preview's datastores. Equivalent to " +
      "`pnpm run seed -- <scenario> <args...> --json`. The result ends with a " +
      "JSON summary containing counts, ids, `verified`, and UI deep `links`. " +
      "Prefer `--dry-run` first when unsure about volume. Keep volumes " +
      "bounded — this is a single-node preview, not production.",
    input_schema: {
      type: "object",
      properties: {
        scenario: {
          type: "string",
          description: "Scenario name exactly as shown by list_scenarios",
        },
        args: {
          type: "array",
          items: { type: "string" },
          description:
            'Flags and values as separate tokens, e.g. ["--observations", "1000", "--v4"]. Do not pass --json (added automatically).',
        },
      },
      required: ["scenario", "args"],
      additionalProperties: false,
    },
  },
  {
    name: "fetch_pr_diff",
    description:
      "Fetch this PR's unified diff from GitHub. Use when asked to seed data " +
      "that exercises the changes in this PR, to decide what to seed.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

const executeTool = async (
  name: string,
  input: unknown,
): Promise<{ content: string; isError: boolean }> => {
  if (name === "list_scenarios") {
    const r = await runSeedCli(["list", "--json"]);
    return { content: r.output, isError: !r.ok };
  }
  if (name === "seed_doctor") {
    const r = await runSeedCli(["doctor", "--json"]);
    // doctor exits non-zero on FAIL items; its report is still the answer
    return { content: r.output, isError: false };
  }
  if (name === "run_seed_scenario") {
    const { scenario, args } = input as { scenario: string; args: string[] };
    const tokens = [scenario, ...(args ?? [])];
    const invalid = tokens.filter((t) => !SAFE_ARG.test(t));
    if (invalid.length > 0) {
      return {
        content: `invalid argument token(s): ${invalid.join(", ")} — tokens must match ${SAFE_ARG}`,
        isError: true,
      };
    }
    const withJson = tokens.includes("--json") ? tokens : [...tokens, "--json"];
    const r = await runSeedCli(withJson);
    return { content: r.output, isError: !r.ok };
  }
  if (name === "fetch_pr_diff") {
    const pr = ENV.prNumber;
    if (!pr || !/^\d+$/.test(pr)) {
      return { content: "SEEDER_PR_NUMBER is not set", isError: true };
    }
    const url = `https://github.com/langfuse/langfuse/pull/${pr}.diff`;
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) {
        return {
          content: `GET ${url} -> ${response.status}`,
          isError: true,
        };
      }
      return {
        content: truncate(await response.text(), MAX_DIFF_CHARS),
        isError: false,
      };
    } catch (error) {
      return {
        content: `GET ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
        isError: true,
      };
    }
  }
  return { content: `unknown tool: ${name}`, isError: true };
};

const buildSystemPrompt = (): string => {
  const previewUrl = ENV.previewUrl ?? "(unknown)";
  const prNumber = ENV.prNumber ?? "(unknown)";
  return [
    "You are the Langfuse preview seeder agent. You run inside the ephemeral",
    `preview environment for langfuse/langfuse PR #${prNumber} (public URL:`,
    `${previewUrl}). A reviewer asked you, via a PR comment, to seed test data`,
    "into this preview so they can inspect something in the UI.",
    "",
    "Environment facts:",
    "- The seed CLI writes directly to this preview's own Postgres and",
    "  single-node ClickHouse; nothing you do here touches production.",
    "- Reviewers log in at the preview URL as demo@langfuse.com (password",
    '  "password"); the seeded data lands in the seed project ("llm-app")',
    "  unless a scenario says otherwise.",
    "- Keep volumes preview-sized: prefer the smallest data set that lets the",
    "  reviewer see what they asked for. Do not exceed roughly 100k rows",
    "  unless the request explicitly demands more.",
    "",
    "Method:",
    "- Start with list_scenarios to see what exists; pick the scenario(s) that",
    "  match the request instead of improvising.",
    '- If the request is about "this PR\'s changes", call fetch_pr_diff and',
    "  choose scenarios that exercise the touched surfaces.",
    "- After seeding, use the JSON summary's `verified` and `links` fields;",
    "  if a run fails, try seed_doctor once and adjust.",
    "",
    "Your final message is posted to the PR verbatim as a comment. Write it",
    "as concise markdown for the reviewer: lead with what you seeded (counts,",
    "project), then the deep links from the summaries, then one or two lines",
    "on what to look at. If you could not fulfil the request, say what you",
    "tried and why it failed. No preamble, no meta-commentary.",
  ].join("\n");
};

const main = async (): Promise<void> => {
  if (!ENV.promptFile) {
    throw new Error("SEEDER_AGENT_PROMPT_FILE is not set");
  }
  const prompt = readFileSync(ENV.promptFile, "utf8").trim();
  if (prompt.length === 0) {
    throw new Error(`prompt file ${ENV.promptFile} is empty`);
  }
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  let finalText = "";
  let lastStopReason: string | null = null;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: buildSystemPrompt(),
      tools: TOOLS,
      messages,
    });

    // Echo the full content back (thinking blocks included, unchanged) so the
    // next turn is valid; collect text as the running candidate result.
    messages.push({ role: "assistant", content: response.content });
    finalText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    lastStopReason = response.stop_reason;
    if (response.stop_reason !== "tool_use") {
      if (response.stop_reason !== "end_turn") {
        console.error(`stopping on stop_reason=${response.stop_reason}`);
      }
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      console.error(
        `tool ${block.name} ${JSON.stringify(block.input).slice(0, 500)}`,
      );
      const result = await executeTool(block.name, block.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.content,
        is_error: result.isError,
      });
    }
    // All results for this turn go back in a single user message.
    messages.push({ role: "user", content: toolResults });
  }

  if (finalText.length === 0) {
    throw new Error("the agent produced no final answer");
  }
  if (lastStopReason !== "end_turn") {
    // Ran out of turns while still calling tools, or hit max_tokens: what we
    // have is mid-work narration or a truncated message, not a completed
    // answer. Never present it as a success — mark it and exit non-zero so
    // the dispatcher uses its "did not finish cleanly" framing.
    const why =
      lastStopReason === "tool_use"
        ? `hit the ${MAX_ITERATIONS}-turn limit while still working`
        : `stop reason: ${String(lastStopReason)}`;
    emitResult(
      `⚠️ The seeder agent stopped before finishing (${why}). Data may be ` +
        `partially seeded. Last status:\n\n${finalText}`,
    );
    process.exitCode = 1;
    return;
  }
  emitResult(finalText);
};

main().catch((error: unknown) => {
  // Always emit a result block — the dispatcher posts ONLY this block, so a
  // bare crash would otherwise surface as an unexplained failure on the PR.
  let detail: string;
  if (error instanceof Anthropic.APIError) {
    detail = `Anthropic API error (${error.status ?? "network"}): ${error.message}`;
  } else {
    detail = error instanceof Error ? error.message : String(error);
  }
  console.error(error);
  emitResult(
    `⚠️ The seeder agent hit an error before finishing: ${detail}\n\n` +
      "Check the job logs in the preview cluster, then re-post the comment to retry.",
  );
  process.exitCode = 1;
});
