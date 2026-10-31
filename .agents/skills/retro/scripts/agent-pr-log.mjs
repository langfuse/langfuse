#!/usr/bin/env node
/**
 * Central log of agent-authored pull requests for /retro.
 *
 * Default window is 42 days. Results are capped per GitHub search (`--limit`,
 * default 100). Duplicate titles are the signal to avoid opening another PR
 * for work that already has one.
 *
 *   node .agents/skills/retro/scripts/agent-pr-log.mjs
 *   node .agents/skills/retro/scripts/agent-pr-log.mjs --since 2026-09-01
 *   node .agents/skills/retro/scripts/agent-pr-log.mjs --search "WitnessAI logger"
 *
 * `--search` prints open PRs whose titles contain every term and exits 1 when
 * any match, so a caller can stop before opening a duplicate. Other modes
 * exit 0. A GitHub or usage failure exits 2.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const AGENT_LOGINS = new Set([
  "cursor[bot]",
  "app/cursor",
  "langfuse-bot",
  "github-actions[bot]",
  "dependabot[bot]",
]);

export function authorLogin(pullRequest) {
  const author = pullRequest.author;
  if (typeof author === "string") return author;
  return author?.login ?? "";
}

export function normalizeTitle(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function isAgentPullRequest(pullRequest) {
  const login = authorLogin(pullRequest);
  const head = pullRequest.headRefName ?? "";
  return AGENT_LOGINS.has(login) || head.startsWith("cursor/");
}

export function duplicateGroups(pullRequests) {
  const groups = new Map();
  for (const pullRequest of pullRequests) {
    const key = normalizeTitle(pullRequest.title);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(pullRequest);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .sort(
      (left, right) =>
        right.length - left.length || left[0].number - right[0].number,
    );
}

export function searchMatches(pullRequests, query) {
  const terms = String(query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return [];
  return pullRequests.filter((pullRequest) => {
    const title = String(pullRequest.title ?? "").toLowerCase();
    return terms.every((term) => title.includes(term));
  });
}

export function defaultSince(now = new Date()) {
  const date = new Date(now.getTime());
  date.setUTCDate(date.getUTCDate() - 42);
  return date.toISOString().slice(0, 10);
}

function pullLine(pullRequest) {
  const draft = pullRequest.isDraft ? " draft" : "";
  const state = String(pullRequest.state ?? "").toUpperCase();
  return `- #${pullRequest.number} ${state}${draft} ${pullRequest.title} ${pullRequest.url ?? ""}`.trimEnd();
}

export function formatLog(pullRequests, { since }) {
  const agents = pullRequests.filter(isAgentPullRequest);
  const byLogin = new Map();
  for (const pullRequest of agents) {
    const login = authorLogin(pullRequest) || "(unknown)";
    byLogin.set(login, (byLogin.get(login) ?? 0) + 1);
  }
  const cursorHeads = agents.filter(
    (pullRequest) =>
      (pullRequest.headRefName ?? "").startsWith("cursor/") &&
      authorLogin(pullRequest) !== "app/cursor" &&
      authorLogin(pullRequest) !== "cursor[bot]",
  ).length;
  const drafts = agents.filter(
    (pullRequest) =>
      pullRequest.isDraft &&
      String(pullRequest.state ?? "").toUpperCase() === "OPEN",
  );

  const lines = [
    `# Agent PR log since ${since}`,
    "",
    `${agents.length} agent pull requests in this sample.`,
  ];
  for (const [login, count] of [...byLogin.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )) {
    lines.push(`- ${login}: ${count}`);
  }
  lines.push(
    `- cursor/ head, other authors: ${cursorHeads}`,
    `- open drafts: ${drafts.length}`,
    "",
    "## Duplicate titles",
    "",
  );
  const groups = duplicateGroups(agents);
  if (groups.length === 0) {
    lines.push("No duplicate titles in this sample.");
  } else {
    for (const group of groups) {
      lines.push(`### ${group[0].title}`, "");
      for (const pullRequest of group) lines.push(pullLine(pullRequest));
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function formatSearch(matches, query) {
  const lines = [`# Open PRs matching "${query}"`, ""];
  if (matches.length === 0) {
    lines.push("No open PR title contains every term.");
  } else {
    for (const pullRequest of matches) lines.push(pullLine(pullRequest));
    lines.push("", "An open pull request already covers this. Do not open another.");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function parseArgs(argv) {
  const args = {
    limit: 100,
    authors: ["app/cursor"],
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} needs a value`);
      }
      index += 1;
      return value;
    };
    if (arg === "--since") args.since = next();
    else if (arg === "--repo") args.repo = next();
    else if (arg === "--limit") args.limit = Number(next());
    else if (arg === "--search") args.search = next();
    else if (arg === "--fixture") args.fixture = next();
    else if (arg === "--author") args.authors.push(next());
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }
  return args;
}

function ghJson(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "gh failed").trim());
  }
  return JSON.parse(result.stdout);
}

function loadFixture(filePath) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("--fixture must be a JSON array of pull requests");
  }
  return parsed;
}

function dedupe(pullRequests) {
  const byNumber = new Map();
  for (const pullRequest of pullRequests) {
    byNumber.set(pullRequest.number, pullRequest);
  }
  return [...byNumber.values()];
}

function listFromGitHub({ repo, since, limit, authors }) {
  const searches = [
    ...authors.map((author) => `created:>=${since} author:${author}`),
    `created:>=${since} head:cursor/`,
  ];
  const pages = searches.map((search) =>
    ghJson([
      "pr",
      "list",
      "--repo",
      repo,
      "--state",
      "all",
      "--limit",
      String(limit),
      "--search",
      search,
      "--json",
      "number,title,url,isDraft,state,headRefName,author",
    ]),
  );
  return dedupe(pages.flat());
}

function searchOpenFromGitHub({ repo, limit, query }) {
  const found = ghJson([
    "pr",
    "list",
    "--repo",
    repo,
    "--state",
    "open",
    "--limit",
    String(limit),
    "--search",
    `${query} in:title`,
    "--json",
    "number,title,url,isDraft,state,headRefName,author",
  ]);
  return searchMatches(found, query);
}

const HELP = `Usage: node .agents/skills/retro/scripts/agent-pr-log.mjs [options]

  --since YYYY-MM-DD   Window start (default: 42 days ago)
  --repo owner/name    GitHub repo (default: gh repo view)
  --limit N            Cap per GitHub search (default: 100)
  --author login       Extra author search (default includes app/cursor)
  --search "words"     Open PRs whose titles contain every word; exit 1 on a hit
  --fixture file.json  Read pull requests from a file instead of GitHub
`;

export function run(argv, stdout = process.stdout, stderr = process.stderr) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error.message}\n${HELP}`);
    return 2;
  }
  if (args.help) {
    stdout.write(HELP);
    return 0;
  }

  try {
    const since = args.since ?? defaultSince();
    if (args.search) {
      const matches = args.fixture
        ? searchMatches(
            loadFixture(args.fixture).filter(
              (pullRequest) =>
                String(pullRequest.state ?? "").toUpperCase() === "OPEN",
            ),
            args.search,
          )
        : searchOpenFromGitHub({
            repo: args.repo ?? ghRepo(),
            limit: args.limit,
            query: args.search,
          });
      stdout.write(formatSearch(matches, args.search));
      return matches.length > 0 ? 1 : 0;
    }

    const pullRequests = args.fixture
      ? loadFixture(args.fixture)
      : listFromGitHub({
          repo: args.repo ?? ghRepo(),
          since,
          limit: args.limit,
          authors: args.authors,
        });
    stdout.write(formatLog(pullRequests, { since }));
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 2;
  }
}

function ghRepo() {
  const result = spawnSync(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || "gh repo view failed").trim());
  }
  return result.stdout.trim();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(run(process.argv.slice(2)));
}
