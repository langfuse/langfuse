# Tracing

Tracing lists the traces in project llm-app and opens one trace from that
list.

## Sub-features

- `traces-list` shows the tracing table for the seeded project.
- `traces-open` opens one row into the trace detail view.

## How to get to it (user POV)

- From the home page, open project `llm-app`, then **Tracing** in the
  project navigation.
- Open
  `http://127.0.0.1:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/traces`
  while signed in as `demo@langfuse.com`.

## Driving it with the Langfuse harness

Preconditions:

- Signed in. Follow [sign-in](./sign-in.md) when the browser is signed out.
- ClickHouse has at least one trace. Postgres seed does not write traces.
  When the page is the tracing setup onboarding, run
  `pnpm run seed -- trace-tree --observations 3 --plain --v4` and open the
  deep link it prints.

- **Open the list.** Go to the traces URL above. The page heading is
  `Tracing`. Rows or an empty table are visible. The setup onboarding
  heading `Tracing Setup` means the precondition failed.
- **Open a trace.** Activate the first trace link in the table. The URL
  gains a trace id segment and the detail view shows that id.
- **Proof.** Screenshot the list with the heading `Tracing` and at least
  one row. Save the seed command's deep link in the report when this run
  created the trace.

## Gotchas

- The heading is `Tracing`, not `Traces`.
- An empty project shows onboarding instead of the table. That is missing
  seed data. Do not describe it as a regression unless the task seeded
  traces first.
- `pnpm run seed` prints the UI deep link on stdout. Open that link.
