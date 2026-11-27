# Langfuse verification map

Read this index, then the feature file for the flow under test. The map is
the user-facing recipe. Implementation notes stay in the package `AGENTS.md`
files.

## Baseline preconditions

- Web at `http://127.0.0.1:3000` and worker at `http://127.0.0.1:3030`,
  unless `LANGFUSE_WEB_URL` / `LANGFUSE_WORKER_URL` say otherwise.
- `bash .agents/skills/verify-changes/scripts/doctor.sh` exited 0 since the
  stack last misbehaved.
- Demo user `demo@langfuse.com` / `password` on project **llm-app**
  (`7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`) in org **Seed Org**.
- Postgres seed does not fill ClickHouse. Tracing pages stay empty until a
  `pnpm run seed` scenario runs.

## Driving conventions

- Start from the baseline unless the feature file says otherwise.
- Prefer `data-testid`, then accessible name. Do not click by coordinates.
- Copy screenshots and traces into the evidence directory named in
  `verify-changes`.
- A skipped entry point is not verified by a different one.

## Proof and skip reporting

- Capture the action and the resulting state.
- UI proof is a screenshot that shows the app and the expected text, plus
  the URL.
- API proof is the status line and body, then a second read of the side
  effect when the feature file asks for one.
- Record the feature file and the entry point with the artifact.
- An unreachable path records the command or URL and the unmet precondition.

## Feature entry contract

Each feature file has an H1, one paragraph, then these H2 sections in order:

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with the Langfuse harness`
4. `Gotchas`

## Features

- [Sign in](./sign-in.md) opens the app as the seeded demo user.
- [Tracing](./traces.md) opens the project's tracing table.
- [Prompts](./prompts.md) opens the seeded prompt list.
- [Public ingestion](./public-ingestion.md) accepts a trace over the HTTP API
  and reads it back.
