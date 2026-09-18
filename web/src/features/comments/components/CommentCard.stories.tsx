import { type ComponentProps } from "react";
import { Trash2 } from "lucide-react";
import { fn } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Button } from "@/src/components/ui/button";
import { CommentCard } from "./CommentCard";

const meta = preview.meta({ component: CommentCard });

const comment = {
  id: "review-note",
  authorName: "Maya Chen",
  authorImage: null,
  timestamp: "5 minutes ago",
  content:
    "The answer is clear, but the second claim needs a source. I'd mark this as **partially correct** until we check it.",
  highlighted: false,
  actions: (
    <IconButton
      icon={Trash2}
      label="Delete comment"
      size="sm"
      variant="ghost"
      onClick={fn()}
    />
  ),
  footer: null,
  location: null,
} satisfies ComponentProps<typeof CommentCard>;

export const Default = meta.story({ args: comment });

export const Highlighted = meta.story({
  args: { ...comment, highlighted: true },
});

export const LongMarkdown = meta.story({
  args: {
    ...comment,
    authorName: "Alexandra Rivera — Evaluation and Quality Engineering",
    content: `@[Maya Chen](user:maya-chen) I reviewed the response against the reference answer. The conclusion is useful, but the supporting evidence needs another pass before we can call this complete.

### What I checked

- **Accuracy:** the first claim matches the reference.
- **Grounding:** the second claim isn't supported by the supplied context.
- **Completeness:** the answer should explain what happens when the input is empty.

The fallback should return \`null\` instead of guessing. That gives callers a clear signal that they need more context and keeps the behavior consistent across retries.

> Ask for clarification when the source doesn't contain enough information.

Please revisit the second paragraph and add a short explanation of the fallback. The rest can stay as written.`,
  },
});

export const WithLocationAndReactions = meta.story({
  args: {
    ...comment,
    content: "This sentence is the unsupported claim I mentioned above.",
    location: <span>Output · messages[1].content</span>,
    footer: (
      <>
        <Button
          variant="outline"
          size="xs"
          onClick={fn()}
          aria-label="Agree, 2 reactions"
        >
          👍 2
        </Button>
        <Button variant="ghost" size="xs" onClick={fn()}>
          Add reaction
        </Button>
      </>
    ),
  },
});

export const ReadOnly = meta.story({
  args: { ...comment, actions: null },
});
