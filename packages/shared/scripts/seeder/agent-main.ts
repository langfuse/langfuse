/**
 * Agentic seeder — implementation (loaded dynamically by agent.ts).
 *
 * Kept separate from agent.ts for the same reason cli-main.ts is separate from
 * cli.ts: importing `../../src/server` parses the shared env schema at module
 * load, which throws on a missing env before any result block can be emitted.
 * agent.ts prechecks nothing itself — it wraps the dynamic import of this file
 * in a try/catch that turns any load- or run-time failure into a result block.
 *
 * The LLM is driven through @langfuse/shared's own `generateLLMText`
 * (the AI SDK v7 boundary that also backs the worker's LLM-as-a-judge), so the
 * seeder reuses the repo's single Anthropic path — model construction,
 * tracing, timeout, and retry — rather than a second SDK. `generateLLMText`
 * deliberately rejects tool `execute` functions ("a completion cannot silently
 * become an agent loop"), so the multi-turn loop lives here: declare tools,
 * read `toolCalls`, run them, feed `tool` messages back, repeat.
 *
 * Env contract (keep in sync with k8s/preview/README.md "Agentic seeder" in
 * langfuse/infrastructure):
 *   SEEDER_AGENT_PROMPT_FILE  path to the reviewer's prompt (required)
 *   SEEDER_PR_NUMBER          PR number (for fetch_pr_diff)
 *   SEEDER_COMMENT_ID         triggering comment id (informational)
 *   LANGFUSE_PREVIEW_URL      public base URL of this preview (deep links)
 *   LANGFUSE_WEB_URL          in-cluster web URL (informational)
 *   ANTHROPIC_API_KEY         seeder-agent Anthropic key
 *   ENCRYPTION_KEY            already required by the seed CLI; used here to
 *                             encrypt the key into the LLMConnection shape
 *   + the datastore env the seed CLI needs (DATABASE_URL, CLICKHOUSE_*)
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

import { prisma } from "../../src/db";
import { encrypt } from "../../src/encryption";
import {
  createLLMToolSet,
  generateLLMText,
  LLMAdapter,
  redis,
  type LLMModelMessage,
  type LLMToolDefinition,
} from "../../src/server";

// Job entrypoint env, not a turbo task — read directly. Full contract above.
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
const MAX_OUTPUT_TOKENS = 16_000;
const CLI_TIMEOUT_MS = 6 * 60 * 1000; // per seed run; several must fit in one Job
const MAX_TOOL_RESULT_CHARS = 20_000;
const MAX_DIFF_CHARS = 80_000;

const execFileAsync = promisify(execFile);

/** run() outcome — agent.ts owns emitting the marker block and the exit code. */
export type SeederResult = { markdown: string; ok: boolean };

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

// LLMToolDefinition[] (name/description/parameters JSON Schema) — converted to
// an AI SDK ToolSet by createLLMToolSet below. No `execute`: the loop is ours.
const TOOL_DEFINITIONS: LLMToolDefinition[] = [
  {
    name: "list_scenarios",
    description:
      "List the available seed scenarios with their flags and descriptions. " +
      "Call this first to learn what can be seeded and which flags exist.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "seed_doctor",
    description:
      "Diagnose the seeding stack (Postgres/ClickHouse connectivity, seed " +
      "project). Use when a seed run fails for unclear reasons.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "run_seed_scenario",
    description:
      "Run one seed scenario against this preview's datastores. Equivalent to " +
      "`pnpm run seed -- <scenario> <args...> --json`. The result ends with a " +
      "JSON summary containing counts, ids, `verified`, and UI deep `links`. " +
      "Prefer `--dry-run` first when unsure about volume. Keep volumes " +
      "bounded — this is a single-node preview, not production.",
    parameters: {
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
    parameters: { type: "object", properties: {}, additionalProperties: false },
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
    const { scenario, args } = (input ?? {}) as {
      scenario?: string;
      args?: string[];
    };
    if (!scenario) {
      return {
        content: "run_seed_scenario requires a scenario",
        isError: true,
      };
    }
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
        return { content: `GET ${url} -> ${response.status}`, isError: true };
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

// One assistant turn's tool calls, in the AI SDK v7 shape (`input`, not `args`).
type ToolCall = { toolCallId: string; toolName: string; input: unknown };

const execute = async (): Promise<SeederResult> => {
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

  const tools = createLLMToolSet(TOOL_DEFINITIONS);
  // The shared boundary expects an LLMConnection whose secret is encrypted;
  // it decrypts inside the call. Synthesize a minimal Anthropic connection
  // from the env key (encrypt uses ENCRYPTION_KEY, present in the Job env).
  const connection = {
    secretKey: encrypt(ENV.anthropicApiKey),
    baseURL: null,
    extraHeaders: null,
    config: null,
  };

  const messages: LLMModelMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: prompt },
  ];

  let finalText = "";
  let finishReason = "";
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const result = await generateLLMText({
      model: { adapter: LLMAdapter.Anthropic, id: MODEL },
      connection,
      messages,
      tools,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 2,
    });

    // Append the assistant turn (incl. tool-call parts) verbatim so the next
    // request is a valid continuation. Each call is a single step (no tool
    // `execute` at this boundary), so finalStep carries this turn's messages.
    messages.push(...(result.finalStep.response.messages as LLMModelMessage[]));
    finalText = (result.text ?? "").trim();
    finishReason = result.finishReason;

    const toolCalls = (result.toolCalls ?? []) as ToolCall[];
    if (toolCalls.length === 0) break; // clean stop (or length) — no more tools

    const toolResults = [];
    for (const call of toolCalls) {
      console.error(
        `tool ${call.toolName} ${JSON.stringify(call.input).slice(0, 500)}`,
      );
      const res = await executeTool(call.toolName, call.input);
      toolResults.push({
        type: "tool-result" as const,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        output: res.isError
          ? { type: "error-text" as const, value: res.content }
          : { type: "text" as const, value: res.content },
      });
    }
    // All results for this turn go back in a single tool message.
    messages.push({ role: "tool", content: toolResults });
  }

  if (finalText.length === 0) {
    throw new Error("the agent produced no final answer");
  }
  if (finishReason !== "stop") {
    // Ran out of turns while still calling tools, or hit the output cap: what
    // we have is mid-work narration or a truncated message, not a completed
    // answer. Never present it as success — mark it partial (ok: false) so the
    // dispatcher uses its "did not finish cleanly" framing.
    const why =
      finishReason === "tool-calls"
        ? `hit the ${MAX_ITERATIONS}-turn limit while still working`
        : `finish reason: ${finishReason || "unknown"}`;
    return {
      ok: false,
      markdown:
        `⚠️ The seeder agent stopped before finishing (${why}). Data may be ` +
        `partially seeded. Last status:\n\n${finalText}`,
    };
  }
  return { ok: true, markdown: finalText };
};

export const run = async (): Promise<SeederResult> => {
  try {
    return await execute();
  } finally {
    // Importing the shared server barrel opens a Redis client (and Prisma)
    // whose reconnect loop would otherwise pin the event loop and hang the
    // Job to its activeDeadlineSeconds. Disconnect both so the process exits
    // cleanly after the result block is emitted — mirrors cli-main.ts.
    await prisma.$disconnect().catch(() => {});
    redis?.disconnect();
  }
};
