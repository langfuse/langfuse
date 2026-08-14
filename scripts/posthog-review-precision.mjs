#!/usr/bin/env node
/**
 * Precision report for the PostHog instrumentation review bot (LFE-15012).
 *
 * Reads `posthog-review:v1` envelopes off bot-authored review threads on merged
 * PRs and scores each resolved gap finding against the event registry as it
 * changed in that PR: the proposed resource gained an action = accepted, it did
 * not = dismissed. Precision = accepted / (accepted + dismissed).
 *
 * The oracle is "did this resource grow in this PR", not "does the exact event
 * name exist", because authors routinely accept a finding and rename the action
 * — exact matching scores those as dismissals. It is measured across the merge
 * commit rather than against current HEAD, where every resource already exists.
 *
 * Rule violations carry no proposed event and therefore no oracle: a resolved
 * thread is indistinguishable from a dismissed one, so they are reported as
 * resolved/unresolved counts with no precision.
 *
 * Usage: node scripts/posthog-review-precision.mjs [--repo owner/name] [--prs 200]
 *
 * Run from the repo root on an up-to-date default branch — scoring reads the
 * registry at each PR's merge commit via `git show`. Requires an authenticated
 * `gh`. Exit codes: 0 = report printed, 1 = no envelopes found, 2 = usage,
 * `gh`, or repo-state failure.
 */
import { execFileSync } from "node:child_process";

const envelopePattern = /<!-- posthog-review:v1 (\{.*?\}) -->/s;
const registryPath = "web/src/features/posthog-analytics/usePostHogClientCapture.ts";
const defaultPrLimit = 200;
const prPageSize = 50;
const threadPageSize = 100;

const query = `
query($owner: String!, $repo: String!, $pageSize: Int!, $threadPageSize: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequests(
      states: MERGED
      first: $pageSize
      orderBy: { field: UPDATED_AT, direction: DESC }
      after: $endCursor
    ) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        mergeCommit { oid }
        reviewThreads(first: $threadPageSize) {
          pageInfo { hasNextPage }
          nodes {
            isResolved
            comments(first: 1) {
              nodes {
                body
                author { login }
              }
            }
          }
        }
      }
    }
  }
}`;

/** Registry text keyed by git revision; `null` marks a revision we cannot read. */
const registryCache = new Map();

main();

/** Entry point: collects findings, scores them, and prints the slices. */
function main() {
  const options = parseArgs(process.argv.slice(2));
  const findings = collectFindings(options);

  if (findings.length === 0) {
    console.error(
      `No posthog-review:v1 envelopes found across the last ${options.prLimit} merged PRs.`,
    );
    process.exit(1);
  }

  const scored = findings.map(score);

  console.log(`Findings: ${scored.length} across ${options.prCount} merged PRs\n`);
  console.log("By class");
  console.table(rollup(scored, (finding) => finding.cls));
  console.log("\nBy feature (gaps only — rule violations have no oracle)");
  console.table(
    rollup(
      scored.filter((finding) => finding.cls === "gap"),
      (finding) => finding.feat || "(unknown)",
    ),
  );
}

/** Parses `--repo owner/name` and `--prs N`, defaulting the repo from `gh`. */
function parseArgs(argv) {
  let repo = "";
  let prLimit = defaultPrLimit;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo") {
      repo = argv[index + 1] ?? "";
      index += 1;
    } else if (argv[index] === "--prs") {
      prLimit = Number(argv[index + 1]);
      index += 1;
    } else {
      console.error(`Unknown argument: ${argv[index]}`);
      process.exit(2);
    }
  }

  if (!repo) {
    repo = gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
  }
  if (!Number.isInteger(prLimit) || prLimit < 1) {
    console.error("--prs must be a positive integer");
    process.exit(2);
  }

  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    console.error(`--repo must be owner/name, got: ${repo}`);
    process.exit(2);
  }
  return { owner, name, prLimit, prCount: 0 };
}

/**
 * Walks merged PRs newest-first and returns one entry per bot envelope.
 *
 * GraphQL rather than REST because `pulls/{n}/comments` does not expose
 * `isResolved`; only `reviewThreads` does. Pagination is manual so `--prs`
 * bounds how much history is fetched.
 */
function collectFindings(options) {
  const findings = [];
  let cursor = null;

  while (options.prCount < options.prLimit) {
    const args = [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-f",
      `owner=${options.owner}`,
      "-f",
      `repo=${options.name}`,
      "-F",
      `pageSize=${Math.min(prPageSize, options.prLimit - options.prCount)}`,
      "-F",
      `threadPageSize=${threadPageSize}`,
    ];
    if (cursor) args.push("-f", `endCursor=${cursor}`);

    const page = JSON.parse(gh(args)).data.repository.pullRequests;

    for (const pull of page.nodes) {
      if (options.prCount >= options.prLimit) break;
      options.prCount += 1;

      if (pull.reviewThreads.pageInfo.hasNextPage) {
        console.error(
          `PR #${pull.number}: more than ${threadPageSize} review threads; later threads not read.`,
        );
      }

      for (const thread of pull.reviewThreads.nodes) {
        const comment = thread.comments.nodes[0];
        if (!comment?.author?.login?.endsWith("[bot]")) continue;

        const match = envelopePattern.exec(comment.body ?? "");
        if (!match) continue;

        try {
          findings.push({
            ...JSON.parse(match[1]),
            pull: pull.number,
            mergeCommit: pull.mergeCommit?.oid ?? null,
            resolved: thread.isResolved,
          });
        } catch {
          console.error(`Unparseable envelope on PR #${pull.number}`);
        }
      }
    }

    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
  return findings;
}

/**
 * Classifies one finding as accepted, dismissed, or unscoreable.
 *
 * Only gaps have an oracle. A rule violation proposes no event, so a resolved
 * thread cannot be told apart from a dismissed one.
 */
function score(finding) {
  if (finding.cls !== "gap") {
    return { ...finding, scoreable: false, accepted: false, exact: false };
  }

  const [resource, action] = String(finding.event ?? "").split(":");
  const grew = resource ? resourceGrew(finding.mergeCommit, resource) : null;
  const block = resourceBlock(registryAt(finding.mergeCommit), resource);

  return {
    ...finding,
    scoreable: grew !== null,
    accepted: grew === true,
    exact: Boolean(action) && block !== null && block.includes(`"${action}"`),
  };
}

/**
 * Whether `resource` gained an action in the PR that `mergeCommit` landed.
 *
 * Returns `null` when either side of the comparison is unreadable, so the
 * finding is reported as unscoreable rather than silently counted.
 */
function resourceGrew(mergeCommit, resource) {
  if (!mergeCommit) return null;

  const after = registryAt(mergeCommit);
  const before = registryAt(`${mergeCommit}~1`);
  if (after === null || before === null) return null;

  const afterBlock = resourceBlock(after, resource);
  const beforeBlock = resourceBlock(before, resource);
  if (afterBlock === null) return false;
  if (beforeBlock === null) return true;
  return actionCount(afterBlock) > actionCount(beforeBlock);
}

/** Reads the registry at a git revision, or `null` when it is unavailable. */
function registryAt(revision) {
  if (registryCache.has(revision)) return registryCache.get(revision);

  let text = null;
  try {
    text = execFileSync("git", ["show", `${revision}:${registryPath}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    console.error(`Cannot read ${registryPath} at ${revision}; findings there are unscoreable.`);
  }
  registryCache.set(revision, text);
  return text;
}

/** Returns the text of a resource's array in the `events` object, or null. */
function resourceBlock(registry, resource) {
  if (!registry || !resource) return null;
  const start = new RegExp(`^ {2}${escapeRegExp(resource)}: \\[`, "m").exec(registry);
  if (!start) return null;
  const rest = registry.slice(start.index);
  const end = rest.indexOf("],");
  return end === -1 ? rest : rest.slice(0, end);
}

/** Counts the quoted action names in a resource block. */
function actionCount(block) {
  return (block.match(/"[^"]+"/g) ?? []).length;
}

/** Escapes a string for literal use inside a RegExp. */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Groups scored findings by `key` into console.table rows. */
function rollup(scored, key) {
  const rows = new Map();

  for (const finding of scored) {
    const group = key(finding);
    const row =
      rows.get(group) ??
      {
        posted: 0,
        unresolved: 0,
        resolved: 0,
        accepted: 0,
        dismissed: 0,
        exactName: 0,
        unscoreable: 0,
        precision: "n/a",
      };

    row.posted += 1;
    if (!finding.resolved) {
      row.unresolved += 1;
      rows.set(group, row);
      continue;
    }

    row.resolved += 1;
    if (!finding.scoreable) {
      row.unscoreable += 1;
    } else if (finding.accepted) {
      row.accepted += 1;
      if (finding.exact) row.exactName += 1;
    } else {
      row.dismissed += 1;
    }
    rows.set(group, row);
  }

  for (const row of rows.values()) {
    const judged = row.accepted + row.dismissed;
    row.precision = judged === 0 ? "n/a" : `${Math.round((row.accepted / judged) * 100)}%`;
  }
  return Object.fromEntries(rows);
}

/** Runs `gh` and returns stdout, exiting 2 on failure. */
function gh(args) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  } catch (error) {
    console.error(`gh ${args[0]} ${args[1] ?? ""} failed: ${error.message}`);
    process.exit(2);
  }
}
