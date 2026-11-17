---
name: langfuse
description: References for working with Langfuse, including the Agents preview, tracing, prompts, datasets, evaluations, and integrations.
---

# Langfuse

Read the relevant reference below for the task at hand.

## Agents preview

When explaining the Agents page, an **agent run** is one recorded execution of an agent: an `AGENT` observation identified by its observation/span ID within its trace. A **trace** contains observations and can include several runs of several agents, including repeated runs of the same agent. A **session** groups related traces through their shared session ID; sessions are optional.

For example, one conversation can contain three request traces with two, three, and one Researcher runs: one session, three traces, six Researcher runs. Other agents can contribute further runs in those traces. Model and tool calls made by that run are not additional agent runs. Do not infer agent-run counts from trace or session counts.

Apply these meanings specifically to the Agents preview. Framework documentation may use “run” more broadly; distinguish that usage from the recorded agent runs shown here. The preview is not a claim that every project has Agents enabled.
