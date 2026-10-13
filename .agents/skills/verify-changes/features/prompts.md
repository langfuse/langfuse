# Prompts

Prompts lists prompt names stored on project llm-app, including the prompt
created by the Postgres seed.

## Sub-features

- `prompts-list` shows the prompt table.
- `prompts-open` opens the seeded `summary-prompt`.

## How to get to it (user POV)

- From project `llm-app`, choose **Prompts** in the project navigation.
- Open
  `http://127.0.0.1:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/prompts`
  while signed in.

## Driving it with the Langfuse harness

Preconditions:

- Signed in as `demo@langfuse.com`.
- Postgres seed has run, so `summary-prompt` exists. This does not need
  ClickHouse.

- **Open the list.** Go to the prompts URL. The page heading is `Prompts`.
  The name `summary-prompt` is visible.
- **Open the prompt.** Activate `summary-prompt`. The URL contains
  `/prompts/summary-prompt` and the page shows that name.
- **Proof.** Screenshot the list or the detail page with `summary-prompt`
  visible.

## Gotchas

- A project that was never seeded has no `summary-prompt`. Report the
  missing fixture. Do not create a prompt by hand and call the seeded
  entry point verified.
