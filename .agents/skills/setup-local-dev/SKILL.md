---
name: setup-local-dev
description: |
  Bring a Langfuse checkout from scratch to a running local dev stack. Use for
  first-time setup, a fresh clone or git worktree, day-to-day start/stop, or
  when web or worker will not start locally.
---

# Set Up Local Dev

## The mental model

Local Langfuse is **hybrid, not "all in Docker"**:

- **Docker** runs the stateful services only — Postgres, ClickHouse server, Redis, MinIO
  (`docker-compose.dev.yml`).
- **The host** runs the app: `web` (:3000) and `worker` (:3030) under `pnpm run dev`, so
  hot reload works.
- **Host CLIs** apply schema *to* the containers: `migrate` (golang-migrate) for ClickHouse
  migrations, `clickhouse client` for dev tables.

That third bullet is why host tools are still needed even though the databases are
containerised. Assuming otherwise is the most common wrong turn.

Do **not** start with `pnpm run dx`. CONTRIBUTING documents it as failing on the very
first run, and it wipes existing data. Use the ordered steps below; `dx` is for later.

## 1. Preflight

```bash
bash .agents/skills/setup-local-dev/scripts/preflight.sh
```

Prints PASS/WARN/FAIL for repo root, node, pnpm, Docker daemon, `migrate`, `clickhouse`
and ports, with an exact fix command per failure. Expected versions are read from
`package.json`, so its output is authoritative over anything written here.

Fix every FAIL, then re-run until it exits 0.

**Node** — install and select the major version, not the `.nvmrc` pin:
`nvm install 24 && nvm use 24`. A bare `nvm use` reads `.nvmrc`, which pins an exact
patch version that is often not installed locally, and fails.

**pnpm** — run the command preflight printed (it substitutes the pinned version):

```bash
corepack enable && corepack prepare pnpm@<pinned version> --activate
```

**Docker** — `open -a Docker`, then wait until `docker info` succeeds.

**golang-migrate** — `brew install golang-migrate`. No Homebrew: download the darwin
binary from the golang-migrate GitHub releases, matching the version CI pins.

**ClickHouse client** — install a Docker shim rather than the standalone binary (the trick
`.github/workflows/pipeline.yml` uses). Do not `brew install --cask clickhouse`: that cask
is deprecated, self-removes after installing, and leaves an **815 MB** binary behind.

```bash
mkdir -p ~/.local/bin
cat > ~/.local/bin/clickhouse <<'SHIM'
#!/usr/bin/env bash
exec docker exec -i langfuse-clickhouse clickhouse "$@"
SHIM
chmod +x ~/.local/bin/clickhouse

# ~/.local/bin is not on PATH by default on a fresh Mac.
grep -qxF 'export PATH="$HOME/.local/bin:$PATH"' ~/.zshrc 2>/dev/null \
  || printf '\nexport PATH="$HOME/.local/bin:$PATH"\n' >> ~/.zshrc
export PATH="$HOME/.local/bin:$PATH"
command -v clickhouse
```

The shim needs the `langfuse-clickhouse` container running — always true at the point it
is used, but it will fail if invoked before step 3. Inside the container the
`--host localhost --port 9000` that the scripts pass resolves to the server itself, so it
works unchanged.

## 2. Environment files

```bash
cp .env.dev.example .env
cp .env.test.example .env.test
```

Keep the dev defaults. `.env*` is gitignored and **per-checkout** — every new worktree
needs this step again. Skip `.env.test` only if the test suites are not needed; without
it `db:reset:test` silently does nothing.

## 3. Install and start infrastructure

```bash
pnpm install
pnpm run infra:dev:up
```

Verify: `docker ps` shows `langfuse-postgres`, `langfuse-clickhouse`, `langfuse-redis`,
`langfuse-minio`. `infra:dev:up` passes `--wait`, so it only returns once healthchecks
pass.

## 4. Postgres schema and seed data

```bash
pnpm --filter=shared run db:generate
pnpm --filter=shared run db:deploy
pnpm --filter=shared run db:seed:examples
```

`db:deploy` applies migrations without the interactive reset prompt. `db:seed:examples`
is a **superset** of the base seed — running it alone is enough. It creates login
`demo@langfuse.com` / `password` and project `7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`.

## 5. ClickHouse schema and seed data

```bash
pnpm --filter=shared run ch:up
pnpm --filter=shared run ch:seed
pnpm --filter=shared run ch:dev-tables
```

**Order matters** and mirrors `ch:reset`. `ch:up` needs `migrate`; `ch:dev-tables` needs
`clickhouse`; `ch:seed` reads projects seeded in step 4, so it must come after it.

## 6. Test database

```bash
pnpm --filter=shared run db:reset:test
```

Creates/resets `langfuse_test` using the `.env.test` overrides. Non-interactive.

## 7. Run and verify

```bash
pnpm run dev
```

The worker answers on :3030 within seconds, but the **web app's first Turbopack compile
takes several minutes** during which :3000 refuses connections. That is normal on a cold
checkout — do not conclude the setup is broken. Keep the process in a background shell and
do not pipe it through `tail`/`head`, which buffer and hide the startup output.

Then confirm all four:

```bash
curl -s http://localhost:3000/api/public/ready   # {"status":"OK","version":"..."}
curl -s http://localhost:3030/api/ready          # {"status":"ok"}  — note: NOT /api/public/ready
pnpm run seed -- doctor                          # every check PASS
```

- Both endpoints answer as above.
- <http://localhost:3000> loads and `demo@langfuse.com` / `password` logs in.
- `pnpm run seed -- doctor` reports PASS for every check.

`doctor` is the authoritative end-to-end verification. Setup is not done until it is
clean.

## Daily loop

```bash
open -a Docker          # only if the daemon is not already running
pnpm run infra:dev:up   # idempotent, seconds; volumes persist
pnpm run dev            # web :3000 + worker :3030
```

Stop with `Ctrl+C`; containers can stay up. `pnpm run infra:dev:down` stops them without
data loss.

Reach for the slow paths only when needed:

- `pnpm run dx` — wipe, re-migrate, re-seed. Use after pulling schema changes or switching
  between branches with divergent migrations.
- `pnpm run infra:dev:prune` — **destroys all volumes**. Confirm with the user first.

## Troubleshooting

**Run `pnpm run seed -- doctor` before debugging anything by hand.** It checks Postgres,
migrations, the seeded project, ClickHouse, v4 dev tables, Redis and blob storage, and
prints the exact fix command per failure.

`doctor` cannot run before `pnpm install` and `.env` exist — that layer is what
`preflight.sh` covers.

| Symptom | Cause and fix |
| --- | --- |
| `Module not found: Can't resolve '@langfuse/shared'` under `next dev` | Next.js infers the workspace root from the *outermost* lockfile, so a worktree nested inside another checkout resolves the relative turbopack alias against the wrong root. Pin `turbopack.root` in `web/next.config.mjs`, or use `pnpm run dev:web-webpack`. |
| `clickhouse: command not found` during `ch:dev-tables` | Shim missing from `PATH`, or the `langfuse-clickhouse` container is not running. |
| `ERR_PNPM_FETCH_404` on one tarball during `pnpm install` | A corporate npm mirror (check `registry` in `~/.npmrc`) lags behind npmjs and lacks that exact version. Confirm with `curl -o /dev/null -w '%{http_code}' https://registry.npmjs.org/<pkg>/-/<pkg>-<version>.tgz`; if it returns 200, install once against the public registry: `pnpm install --registry https://registry.npmjs.org/`. The lockfile pins versions and integrity hashes, so only the download host changes. Do not edit the user's global `~/.npmrc`. |
| Port already allocated on `infra:dev:up` | Container names, host ports and volumes are **global**. Two checkouts share one stack — run only one at a time, or set the `*_HOST_PORT` overrides in `.env`. |
| `open -a Docker` exits 0 but no daemon appears | Docker Desktop is wedged mid-shutdown (`docker desktop status` shows `stopping`) and silently refuses to relaunch. Kill the leftover `com.docker.backend` / `com.docker.build` / `com.docker.dev-envs` PIDs from `ps aux \| grep com.docker`, then `open -a Docker` again. |
| Migrations or seeds behave oddly after switching branches | The schema moved. Run `pnpm run dx`. |

## Starting over

Destructive — confirm with the user before running:

```bash
pnpm run infra:dev:prune                  # deletes all Docker volumes
rm -f .env .env.test
rm -rf node_modules */node_modules packages/*/node_modules
```

Prefer this over `pnpm run nuke`, which also runs `pnpm store prune` and forces a full
dependency re-download.

## Related skills

- `seed-test-data` — richer local data once the stack runs (complex traces, sessions,
  bulk data). Never write ad-hoc seed scripts.
- `langfuse-codebase-navigator` — where code lives, once the stack is up.
