import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import preview from "../../../../../../../../../../../.storybook/preview";
import { PromptEditorContent } from "./PromptEditor";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import type { EvaluatorPromptMessage } from "@langfuse/shared";

const meta = preview.meta({ component: PromptEditorContent });

function PromptEditorStory({
  messages,
  compact = false,
  previewEnabled = false,
}: {
  messages: EvaluatorPromptMessage[];
  compact?: boolean;
  previewEnabled?: boolean;
}) {
  const [store] = useState(() => {
    const nextStore = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const { actions } = nextStore.getState();
    actions.setPromptMessage(0, messages[0]);
    for (const message of messages.slice(1)) {
      actions.addPromptMessage();
      actions.setPromptMessage(
        nextStore.getState().promptMessages.length - 1,
        message,
      );
    }
    actions.setPromptPreviewEnabled(previewEnabled);
    return nextStore;
  });

  return (
    <div className={compact ? "w-64 max-w-full" : "w-[42rem] max-w-full"}>
      <PromptEditorContent store={store} sampleObject={null} />
    </div>
  );
}

export const MultipleMessages = meta.story({
  name: "(Test) Multiple messages",
  render: () => (
    <PromptEditorStory
      messages={[
        {
          role: "system",
          content: "You are a strict evaluator. Apply the rubric consistently.",
        },
        {
          role: "user",
          content:
            "Question: {{input}}\nResponse: {{output}}\n\nReturn a score and concise reasoning.",
        },
        {
          role: "assistant",
          content:
            '{"score": 1, "reasoning": "The response fully answers the question."}',
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const collapseButton = canvas.getByRole("button", {
      name: "Collapse system prompt message",
    });
    const userCollapseButton = canvas.getByRole("button", {
      name: "Collapse user prompt message",
    });
    const roleTag = canvas.getByText("System");
    const toolbar = collapseButton.parentElement?.parentElement;
    if (!toolbar) throw new Error("Prompt toolbar not found");

    const expandedMetrics = {
      toolbarHeight: toolbar.getBoundingClientRect().height,
      buttonWidth: collapseButton.getBoundingClientRect().width,
      buttonLeft: collapseButton.getBoundingClientRect().left,
      buttonTop: collapseButton.getBoundingClientRect().top,
      roleTagLeft: roleTag.getBoundingClientRect().left,
      roleTagTop: roleTag.getBoundingClientRect().top,
    };

    await userEvent.click(roleTag);

    const expandButton = canvas.getByRole("button", {
      name: "Expand system prompt message",
    });
    await expect(expandButton).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.getByText(
        "You are a strict evaluator. Apply the rubric consistently.",
      ),
    ).toBeVisible();
    await expect(toolbar.getBoundingClientRect().height).toBe(
      expandedMetrics.toolbarHeight,
    );
    await expect(expandButton.getBoundingClientRect().width).toBe(
      expandedMetrics.buttonWidth,
    );
    await expect(expandButton.getBoundingClientRect().left).toBe(
      expandedMetrics.buttonLeft,
    );
    await expect(expandButton.getBoundingClientRect().top).toBe(
      expandedMetrics.buttonTop,
    );
    await expect(roleTag.getBoundingClientRect().left).toBe(
      expandedMetrics.roleTagLeft,
    );
    await expect(roleTag.getBoundingClientRect().top).toBe(
      expandedMetrics.roleTagTop,
    );
    await expect(expandButton.getBoundingClientRect().left).toBe(
      userCollapseButton.getBoundingClientRect().left,
    );
  },
});

export const InvalidSystemMessagePosition = meta.story({
  name: "(Test) Invalid system message position",
  render: () => (
    <PromptEditorStory
      messages={[
        { role: "user", content: "Judge the response." },
        { role: "system", content: "Be strict." },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.getByLabelText("Invalid system message position"),
    ).toBeVisible();

    await userEvent.click(
      canvas.getAllByRole("button", { name: "Prompt message settings" })[1],
    );
    await expect(
      page.getByRole("menuitem", { name: "System" }),
    ).toHaveAttribute("data-disabled");
  },
});

export const DraggingMessage = meta.story({
  name: "(Test) Dragging a message",
  render: () => (
    <PromptEditorStory
      messages={[
        {
          role: "system",
          content:
            "You are an expert topic-classification evaluator for user messages. Follow every category definition and decision rule.",
        },
        {
          role: "user",
          content: "Classify the current input.",
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const handle = canvas.getByRole("button", {
      name: "Reorder system prompt message",
    });
    const promptMessage = handle.parentElement;
    if (!promptMessage) throw new Error("Prompt message not found");
    const initialBounds = promptMessage.getBoundingClientRect();
    const handleBounds = handle.getBoundingClientRect();

    await userEvent.pointer([
      { keys: "[MouseLeft>]", target: handle },
      {
        coords: {
          x: handleBounds.left + handleBounds.width / 2,
          y: handleBounds.top + handleBounds.height / 2 + 12,
        },
      },
    ]);

    await expect(
      page.queryByTestId("prompt-message-drag-preview"),
    ).not.toBeInTheDocument();
    await expect(promptMessage).toBeVisible();
    await expect(promptMessage.getBoundingClientRect().height).toBe(
      initialBounds.height,
    );
    await expect(promptMessage.getBoundingClientRect().width).toBe(
      initialBounds.width,
    );

    await userEvent.keyboard("{Escape}");
    await userEvent.pointer([{ keys: "[/MouseLeft]" }]);
  },
});

export const AddMessageWhilePreviewing = meta.story({
  name: "(Test) Add message while previewing",
  render: () => (
    <PromptEditorStory
      previewEnabled
      messages={[
        {
          role: "user",
          content: "Evaluate whether the response is correct.",
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add message" }));

    const editors = canvas.getAllByRole("textbox");
    const newPromptEditor = editors.at(-1);
    if (!newPromptEditor) throw new Error("New prompt editor not found");

    await expect(
      newPromptEditor.getBoundingClientRect().height,
    ).toBeGreaterThan(100);
    await userEvent.click(newPromptEditor);
    await userEvent.keyboard("A new prompt");
    await expect(canvas.getByText("A new prompt")).toBeVisible();
  },
});

export const CompactMixedStates = meta.story({
  name: "(Test) Compact, expanded and collapsed",
  render: () => (
    <PromptEditorStory
      compact
      messages={[
        {
          role: "system",
          content:
            "You are an expert topic classifier. Follow the rubric and return only the expected output.",
        },
        {
          role: "user",
          content: "Classify this short response.",
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("System"));

    const collapsedButton = canvas.getByRole("button", {
      name: "Expand system prompt message",
    });
    const expandedButton = canvas.getByRole("button", {
      name: "Collapse user prompt message",
    });
    await expect(collapsedButton.getBoundingClientRect().width).toBe(24);
    await expect(collapsedButton.getBoundingClientRect().left).toBe(
      expandedButton.getBoundingClientRect().left,
    );
    await expect(
      collapsedButton.parentElement?.parentElement?.getBoundingClientRect()
        .height,
    ).toBe(36);
    await expect(
      expandedButton.parentElement?.parentElement?.getBoundingClientRect()
        .height,
    ).toBe(36);
  },
});

export const SingleMessage = meta.story({
  name: "(Test) Single user message",
  render: () => (
    <PromptEditorStory
      messages={[
        {
          role: "user",
          content: "Evaluate whether {{output}} correctly answers {{input}}.",
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("User")).not.toBeInTheDocument();
  },
});

export const SingleNonUserMessage = meta.story({
  name: "(Test) Single non-user message",
  render: () => (
    <PromptEditorStory
      messages={[
        {
          role: "system",
          content: "Apply the evaluation rubric consistently.",
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("System")).toBeVisible();
  },
});
