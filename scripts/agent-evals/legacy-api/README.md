# Coding-agent eval: legacy public API usage

Measures whether a coding agent, given an ordinary data-export task, writes a
script that calls a deprecated Langfuse public API endpoint, and whether the
deprecation signals (`Deprecation`/`Sunset`/`Link` headers, the `_deprecation`
body, the post-sunset 410) change that.

Each run:

1. Creates an empty workspace outside any git repository, with a Python 3.12
   venv that has `langfuse`, `requests` and `httpx` installed.
2. Runs the agent headless on the task prompt. Claude Code runs with no user or
   project settings, no CLAUDE.md, no hooks and no MCP servers. Its tools are
   limited to file edits, web search/fetch, and `python`/`pip`/`uv` plus a few
   read-only shell commands.
3. In `live` mode, points `LANGFUSE_BASE_URL`/`LANGFUSE_HOST` and test keys at
   a mock server for the session, so the agent sees the mock's responses if it
   runs its script. In `offline` mode no credentials are set and the agent
   never reaches the mock.
4. Replays the agent's final script against a fresh mock. Hard-coded Cloud
   hosts are rewritten to the mock. Every request is logged, and the output
   file is graded against the fixture.

The mock imports `web/src/features/public-api/server/deprecations.ts` from a
git ref (`--deprecations-ref`), so it serves that ref's exact notice text,
headers and body stamping. `--phase post-sunset` answers legacy GETs with the
Cloud 410 body for an organization past the cutoff, stamped the same way.

## Usage

```bash
node scripts/agent-evals/legacy-api/run.mjs \
  --mode live --phase pre-sunset --deprecations-ref origin/main \
  --runs 5 --out /tmp/langfuse-agent-evals
```

Results go to `<out>/<label>/`: `summary.md` (one row per run),
`results.json`, and per run the transcript, the workspace, the session and
replay request logs, and the replay output.

To serve the mock alone (for example to point an agent at it by hand):

```bash
node scripts/agent-evals/legacy-api/mock-server.mjs --port 4100 --log requests.jsonl
# keys: pk-lf-agent-eval / sk-lf-agent-eval
```

Recorded results live in [`results/`](results/).

## Measures

- **Legacy calls**: logged requests that matched a deprecated route, in the
  agent's session and on replay. A static scan of the script is a fallback for
  runs whose script never ran.
- **CSV correct**: the output matches the fixture's 7-day window exactly (ids,
  names, timestamps within 1 s, costs within 1e-6).
- **Told user about deprecation**: the agent's final message mentions the
  deprecation or removal.
- **Web**: web searches and fetches, listed in `results.json`.

## Fixture

`fixture.mjs` builds 120 traces in the last 7 days plus 5 older ones. Every
tenth trace has no observations (v2 returns a single `t-<traceId>` row with
cost 0). Every tenth trace, offset by one, is an OTel-style trace without a
trace name, where the legacy endpoint reports the root span's name. Both
legacy and v2 responses paginate at their default limits.

## Extending

- **Another deprecated endpoint**: add a route to `LEGACY_ROUTES` in
  `mock-server.mjs` with its deprecation export and a handler, then add a task
  (prompt, output file, grader) to `tasks.mjs` and pass `--task`.
- **Another agent**: add an entry to `AGENTS` in `run.mjs` that returns the
  headless command for a prompt. The transcript analysis reads Claude Code's
  `stream-json` format; other agents need their own parser.

## Limits

- The base URL is a local address, which an agent can notice even though the
  prompt says Langfuse Cloud.
- The mock implements only the parameters these tasks need. Unsupported v2
  metrics views return 400.
- Live web docs are whatever is published at run time. A "before" arm can
  emulate an older API notice with `--deprecations-ref`, but not older docs.
