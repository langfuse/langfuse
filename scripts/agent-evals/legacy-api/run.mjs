#!/usr/bin/env node
// Runs a coding agent on a task N times against the mock, then replays each
// final script against a fresh mock and grades its output. See README.md.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { PUBLIC_KEY, SECRET_KEY, startMockServer } from "./mock-server.mjs";
import { TASKS } from "./tasks.mjs";

const { values: opts } = parseArgs({
  options: {
    label: { type: "string" },
    task: { type: "string", default: "traces-csv" },
    agent: { type: "string", default: "claude" },
    model: { type: "string" },
    runs: { type: "string", default: "5" },
    concurrency: { type: "string", default: "5" },
    mode: { type: "string", default: "live" },
    phase: { type: "string", default: "pre-sunset" },
    "deprecations-ref": { type: "string", default: "origin/main" },
    out: { type: "string", default: join(tmpdir(), "langfuse-agent-evals") },
    "timeout-min": { type: "string", default: "20" },
    // Re-render summary.md from an existing results.json without running agents.
    resummarize: { type: "string" },
  },
});

if (opts.resummarize) {
  const dir = resolve(opts.resummarize);
  const { label, results } = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
  writeFileSync(join(dir, "summary.md"), renderSummary(label, results));
  console.log(readFileSync(join(dir, "summary.md"), "utf8"));
  process.exit(0);
}

const task = TASKS[opts.task];
if (!task) throw new Error(`unknown task ${opts.task}`);
if (!["live", "offline"].includes(opts.mode)) throw new Error("--mode must be live or offline");
const label = opts.label ?? `${opts.task}-${opts.agent}-${opts.mode}-${opts.phase}-${opts["deprecations-ref"].replace(/[^\w]+/g, "_")}`;
const outDir = resolve(opts.out, label);
mkdirSync(outDir, { recursive: true });
if (spawnSync("git", ["rev-parse", "--git-dir"], { cwd: outDir }).status === 0) {
  throw new Error(`${outDir} is inside a git repository; agents would pick up its instructions. Use --out outside any repo.`);
}

// The agent may only edit files, read the web, and run python/pip/uv plus a few
// read-only shell commands; any other tool call is denied without prompting.
const ALLOWED_TOOLS = [
  "Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch",
  "Bash(python:*)", "Bash(python3:*)", "Bash(pip:*)", "Bash(pip3:*)", "Bash(uv:*)",
  "Bash(ls:*)", "Bash(cat:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(wc:*)", "Bash(echo:*)", "Bash(which:*)", "Bash(pwd)", "Bash(env)", "Bash(printenv:*)",
];

const AGENTS = {
  claude: ({ prompt, model }) => ({
    cmd: "claude",
    args: [
      "-p", prompt,
      // No user/project settings, CLAUDE.md, hooks or MCP servers: a clean install.
      "--setting-sources", "",
      "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}',
      "--permission-mode", "dontAsk",
      "--allowedTools", ...ALLOWED_TOOLS,
      "--output-format", "stream-json", "--verbose",
      ...(model ? ["--model", model] : []),
    ],
  }),
};
const agent = AGENTS[opts.agent];
if (!agent) throw new Error(`unknown agent ${opts.agent}; known: ${Object.keys(AGENTS).join(", ")}`);

async function runOnce(n) {
  const runDir = join(outDir, `run-${n}`);
  const workspace = join(runDir, "workspace");
  mkdirSync(workspace, { recursive: true });
  makeVenv(workspace);
  const venvBin = join(workspace, ".venv", "bin");

  const mockOpts = { deprecationsRef: opts["deprecations-ref"], phase: opts.phase };
  const sessionMock = opts.mode === "live" ? await startMockServer({ ...mockOpts, logFile: join(runDir, "session-requests.jsonl") }) : undefined;
  const env = cleanEnv({ PATH: `${venvBin}:${process.env.PATH}`, VIRTUAL_ENV: join(workspace, ".venv") });
  if (sessionMock) Object.assign(env, langfuseEnv(sessionMock.port));

  const { cmd, args } = agent({ prompt: task.prompt(opts.mode), model: opts.model });
  const started = Date.now();
  const transcriptPath = join(runDir, "transcript.jsonl");
  const exit = await runProcess(cmd, args, { cwd: workspace, env, stdoutFile: transcriptPath, timeoutMs: Number(opts["timeout-min"]) * 60_000 });
  sessionMock?.server.close();

  const script = pickScript(workspace);
  const replay = script ? await replayScript(runDir, script, mockOpts) : { error: "no python script" };
  const sessionRequests = readJsonl(join(runDir, "session-requests.jsonl"));
  return {
    run: n,
    exit,
    durationSec: Math.round((Date.now() - started) / 1000),
    script: script ? basename(script) : null,
    transcript: analyzeTranscript(readJsonl(transcriptPath)),
    session: summarizeRequests(sessionRequests),
    replay,
    staticScan: script ? scanScript(readFileSync(script, "utf8")) : null,
  };
}

async function replayScript(runDir, script, mockOpts) {
  const replayDir = join(runDir, "replay");
  mkdirSync(replayDir, { recursive: true });
  const mock = await startMockServer({ ...mockOpts, logFile: join(runDir, "replay-requests.jsonl") });
  const base = `http://127.0.0.1:${mock.port}`;
  const target = join(replayDir, basename(script));
  // Hard-coded Cloud hosts are pointed at the mock; env vars cover the rest.
  writeFileSync(target, readFileSync(script, "utf8").replace(/https?:\/\/(?:(?:us|eu|jp|hipaa)\.)?cloud\.langfuse\.com/g, base));
  for (const f of readdirSync(join(script, ".."))) {
    if (/\.(txt|toml|cfg|ini)$/.test(f)) copyFileSync(join(script, "..", f), join(replayDir, f));
  }
  const venvBin = join(script, "..", ".venv", "bin");
  const env = cleanEnv({ PATH: `${venvBin}:${process.env.PATH}`, ...langfuseEnv(mock.port) });
  const exit = await runProcess(join(venvBin, "python"), [target], { cwd: replayDir, env, stdoutFile: join(runDir, "replay-output.txt"), timeoutMs: 180_000 });
  mock.server.close();
  const outputPath = join(replayDir, task.output);
  const grade = task.grade(mock.fixture, existsSync(outputPath) ? readFileSync(outputPath, "utf8") : undefined);
  return { exit, requests: summarizeRequests(readJsonl(join(runDir, "replay-requests.jsonl"))), grade };
}

function makeVenv(workspace) {
  const venv = spawnSync("uv", ["venv", "--quiet", "--python", "3.12", join(workspace, ".venv")], { encoding: "utf8" });
  if (venv.status !== 0) throw new Error(`uv venv failed: ${venv.stderr}`);
  const install = spawnSync("uv", ["pip", "install", "--quiet", "--python", join(workspace, ".venv", "bin", "python"), "langfuse", "requests", "httpx"], { encoding: "utf8" });
  if (install.status !== 0) throw new Error(`uv pip install failed: ${install.stderr}`);
}

function langfuseEnv(port) {
  const base = `http://127.0.0.1:${port}`;
  return { LANGFUSE_PUBLIC_KEY: PUBLIC_KEY, LANGFUSE_SECRET_KEY: SECRET_KEY, LANGFUSE_BASE_URL: base, LANGFUSE_HOST: base };
}

/** cleanEnv drops the caller's Langfuse and harness variables so runs only see what we set. */
function cleanEnv(extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(LANGFUSE_|CLAUDE_JOB|CLAUDECODE|CLAUDE_CODE_ENTRYPOINT|VIRTUAL_ENV)/.test(k)) continue;
    env[k] = v;
  }
  return Object.assign(env, extra);
}

function runProcess(cmd, args, { cwd, env, stdoutFile, timeoutMs }) {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => out.push(c));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      writeFileSync(stdoutFile, Buffer.concat(out));
      done({ code, signal });
    });
  });
}

function pickScript(workspace) {
  const candidates = readdirSync(workspace)
    .filter((f) => f.endsWith(".py"))
    .map((f) => join(workspace, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const named = candidates.find((f) => /export|trace|download/i.test(basename(f)) && !/test/i.test(basename(f)));
  return named ?? candidates[0];
}

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return { unparsed: l };
    }
  });
}

function summarizeRequests(requests) {
  const endpoints = {};
  for (const r of requests) {
    const key = `${r.method} ${r.path.replace(/\/(trace|t)-[\w-]+$/, "/{id}")} ${r.status}`;
    endpoints[key] = (endpoints[key] ?? 0) + 1;
  }
  return { total: requests.length, legacy: requests.filter((r) => r.legacy).length, endpoints };
}

const LEGACY_PATTERNS = [/\/api\/public\/traces\b/, /\.trace\.list\(/, /\.api\.trace\./, /fetch_traces\(/];
const V2_PATTERNS = [/\/api\/public\/v2\/observations/, /observations\.get_many\(/, /\/api\/public\/v2\/metrics/, /\.metrics\.metrics\(/];

function scanScript(source) {
  return {
    legacy: LEGACY_PATTERNS.some((p) => p.test(source)),
    v2: V2_PATTERNS.some((p) => p.test(source)),
    mentionsDeprecation: /deprecat|sunset|November 16|2026-11-16/i.test(source),
  };
}

function analyzeTranscript(events) {
  const tools = {};
  const urls = [];
  const denied = [];
  let finalText = "";
  let costUsd = null;
  let model = null;
  for (const e of events) {
    if (e.type === "system" && e.subtype === "init") model = e.model;
    if (e.type === "assistant") {
      for (const c of e.message?.content ?? []) {
        if (c.type === "tool_use") {
          tools[c.name] = (tools[c.name] ?? 0) + 1;
          if (c.name === "WebFetch") urls.push(c.input?.url);
          if (c.name === "WebSearch") urls.push(`search: ${c.input?.query}`);
        }
      }
    }
    if (e.type === "result") {
      finalText = e.result ?? "";
      costUsd = e.total_cost_usd ?? null;
      for (const d of e.permission_denials ?? []) denied.push(d.tool_input?.command ?? d.tool_name);
    }
  }
  return {
    model,
    tools,
    web: urls,
    denied,
    costUsd,
    finalMentionsDeprecation: /deprecat|sunset|November 16|2026-11-16|removed/i.test(finalText),
    finalText: finalText.slice(0, 2000),
  };
}

function summarizeLine(r) {
  if (r.error) return `ERROR ${r.error.split("\n")[0]}`;
  return `legacy(replay)=${r.replay.requests?.legacy ?? "?"} csvOk=${r.replay.grade?.ok} web=${r.transcript.web.length} denied=${r.transcript.denied.length} ${r.durationSec}s`;
}

/** usedLegacy trusts the replay request log; the static scan, which also matches comments, decides only when the script made no requests. */
function usedLegacy(r) {
  const requests = r.replay.requests;
  if (requests?.total > 0) return requests.legacy > 0;
  return Boolean(r.staticScan?.legacy);
}

function renderSummary(label, results) {
  const ok = results.filter((r) => !r.error);
  const usesLegacy = ok.filter(usedLegacy).length;
  const lines = [
    `# ${label}`,
    "",
    `Runs: ${results.length} (${results.length - ok.length} errored). Final script uses a legacy endpoint: **${usesLegacy} of ${ok.length}**. Correct CSV on replay: **${ok.filter((r) => r.replay.grade?.ok).length} of ${ok.length}**.`,
    "",
    "| run | legacy calls (session / replay) | v2 in script | CSV correct | told user about deprecation | web | tools | s | $ |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.run} | error: ${r.error.split("\n")[0]} |||||||`);
      continue;
    }
    const g = r.replay.grade ?? {};
    const csv = g.ok ? "yes" : `no (${g.reason ?? Object.entries(g).filter(([k, v]) => typeof v === "number" && v > 0 && !["rows", "expectedRows"].includes(k)).map(([k, v]) => `${k} ${v}`).join(", ")})`;
    lines.push(`| ${r.run} | ${r.session.legacy} / ${r.replay.requests?.legacy ?? "-"} | ${r.staticScan?.v2 ? "yes" : "no"} | ${csv} | ${r.transcript.finalMentionsDeprecation ? "yes" : "no"} | ${r.transcript.web.length} | ${Object.entries(r.transcript.tools).map(([k, v]) => `${k}×${v}`).join(" ")} | ${r.durationSec} | ${r.transcript.costUsd?.toFixed(2) ?? "-"} |`);
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const total = Number(opts.runs);
  const queue = Array.from({ length: total }, (_, i) => i + 1);
  const results = [];
  await Promise.all(
    Array.from({ length: Math.min(Number(opts.concurrency), total) }, async () => {
      while (queue.length) {
        const n = queue.shift();
        const result = await runOnce(n).catch((error) => ({ run: n, error: String(error?.stack ?? error) }));
        results.push(result);
        console.log(`[${label}] run ${n}: ${summarizeLine(result)}`);
      }
    }),
  );
  results.sort((a, b) => a.run - b.run);
  writeFileSync(join(outDir, "results.json"), JSON.stringify({ label, opts, results }, null, 2));
  writeFileSync(join(outDir, "summary.md"), renderSummary(label, results));
  console.log(readFileSync(join(outDir, "summary.md"), "utf8"));
}

await main();
