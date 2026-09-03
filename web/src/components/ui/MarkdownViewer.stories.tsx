import preview from "../../../.storybook/preview";
import { MarkdownView } from "./MarkdownViewer";

const meta = preview.meta({
  component: MarkdownView,
  args: {
    title: "assistant",
  },
});

export const Default = meta.story({
  args: {
    markdown:
      "Langfuse is an **open-source** observability tool for LLM apps. Use `trace.generation()` to record a model call.",
  },
});

export const NestedLists = meta.story({
  args: {
    markdown: `In practical terms, it helps you:

- **Track and debug LLM calls**
  - Log prompts, model responses, latency, errors, and metadata
- **Evaluate quality**
  - Run evaluations on outputs (automatic metrics or human feedback)
- **Monitor in production**
  - Dashboards for usage, cost, latency, and failure rates`,
  },
});

export const TightLists = meta.story({
  args: {
    markdown: `Simple bullets stay on one line:

- First item
- Second item
- Third item with **bold** and \`inline code\``,
  },
});

export const OrderedLists = meta.story({
  args: {
    markdown: `Numbered steps:

1. Collect traces
2. Label outcomes
3. Run the eval

Resume a later list:

10. Double-digit markers need gutter space
11. Next item
12. Last item`,
  },
});

export const NestedOrderedLists = meta.story({
  args: {
    markdown: `Steps:

1. **Prepare the dataset**
   1. Collect traces
   2. Label outcomes
2. **Run the eval**
   1. Score outputs
   2. Compare baselines`,
  },
});

export const Headings = meta.story({
  args: {
    markdown: `# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

Paragraph after headings.`,
  },
});

export const CodeBlocks = meta.story({
  args: {
    markdown: `Wrap a model call:

\`\`\`typescript
const generation = trace.generation({
  name: "support-answer",
  model: "example-model",
});
\`\`\`

Inline code looks like \`trace.id\`.`,
  },
});

export const Table = meta.story({
  args: {
    markdown: `| Metric | Value |
| --- | --- |
| Latency | 842ms |
| Tokens | 1,204 |
| Cost | $0.012 |`,
  },
});

export const Blockquote = meta.story({
  args: {
    markdown: `> Prefer traces over logs when debugging a single request.
>
> Keep the observation tree intact.`,
  },
});

export const TaskList = meta.story({
  args: {
    markdown: `- [x] Record the generation
- [x] Attach scores
- [ ] Share the trace`,
  },
});

export const Links = meta.story({
  args: {
    markdown:
      "See the [tracing docs](https://langfuse.com/docs) or an unsafe [script](javascript:alert(1)).",
  },
});

export const MixedContent = meta.story({
  args: {
    markdown: `## How to debug a slow trace

1. Open the generation
2. Compare **input** and **output**
3. Check the table:

| Field | Expected |
| --- | --- |
| model | example-model |
| stream | true |

Then wrap the call:

\`\`\`ts
trace.generation({ name: "answer" });
\`\`\`

- Nested follow-ups
  - Re-run with a tighter prompt
  - Compare cost`,
  },
});
