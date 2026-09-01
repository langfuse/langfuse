import { ChevronDown, MoreVertical } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import preview from "../../../../../../../../.storybook/preview";
import { PromptVariableEditor } from "./PromptVariableEditor";

const meta = preview.meta({ component: PromptVariableEditor });

export const Default = meta.story({
  args: {
    value: "Evaluate whether the response answers the user's question.",
    onChange: fn(),
    showPreviewToggle: true,
    previewEnabled: false,
    onPreviewEnabledChange: fn(),
  },
});

export const MappedVariables = meta.story({
  args: {
    value:
      "Compare {{input}} with {{output}} and explain whether the response is correct.",
    onChange: fn(),
    variableStatus: {
      input: { status: "valid" },
      output: {
        status: "invalid",
        message: "Output is not mapped to the sample observation",
      },
    },
    variableMappings: {
      input: "Observation input",
      output: "Not mapped",
    },
    showPreviewToggle: true,
    previewEnabled: false,
    onPreviewEnabledChange: fn(),
  },
});

export const Preview = meta.story({
  args: {
    value:
      "Question: {{input}}\nResponse: {{output}}\n\nEvaluate whether the response is correct.",
    onChange: fn(),
    variableStatus: {
      input: { status: "valid" },
      output: { status: "valid" },
    },
    variableMappings: {
      input: "Observation input",
      output: "Observation output",
    },
    showPreviewToggle: true,
    previewEnabled: true,
    onPreviewEnabledChange: fn(),
    preview: {
      status: "ready",
      fragments: [
        { type: "text", text: "Question: " },
        {
          type: "variable",
          name: "input",
          value: "What is the capital of France?",
        },
        { type: "text", text: "\nResponse: " },
        {
          type: "variable",
          name: "output",
          value: "The capital of France is Paris.",
        },
        {
          type: "text",
          text: "\n\nEvaluate whether the response is correct.",
        },
      ],
    },
  },
});

export const PreviewUnavailable = meta.story({
  args: {
    value: "Input: {{input}}\nResponse: {{output}}",
    onChange: fn(),
    showPreviewToggle: true,
    previewEnabled: false,
    onPreviewEnabledChange: fn(),
    previewDisabledReason:
      "Select a sample observation in the test panel to preview the interpolated prompt.",
    preview: {
      status: "unavailable",
      message:
        "Select a sample observation in the test panel to preview the interpolated prompt.",
    },
  },
});

export const MessageHeader = meta.story({
  args: {
    value: "Evaluate whether {{output}} is correct.",
    onChange: fn(),
    showPreviewToggle: true,
    previewEnabled: false,
    onPreviewEnabledChange: fn(),
    onToolbarClick: fn(),
    toolbarStart: (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0"
        >
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
        <Badge
          variant="tertiary"
          size="sm"
          className="h-5 shrink-0 leading-none"
        >
          User
        </Badge>
      </>
    ),
    toolbarActions: (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Prompt message settings"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </Button>
    ),
  },
});

export const CollapsedMessage = meta.story({
  args: {
    value: "Evaluate whether {{output}} is correct.",
    onChange: fn(),
    showPreviewToggle: true,
    previewEnabled: false,
    onPreviewEnabledChange: fn(),
    onToolbarClick: fn(),
    collapsed: true,
    toolbarStart: (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="shrink-0"
        >
          <ChevronDown className="h-3.5 w-3.5 shrink-0 -translate-x-0.5 -rotate-90" />
        </Button>
        <Badge
          variant="tertiary"
          size="sm"
          className="h-5 shrink-0 leading-none"
        >
          User
        </Badge>
        <span className="text-muted-foreground min-w-0 flex-1 truncate px-1 text-xs leading-none">
          Evaluate whether the response is correct and follows the rubric.
        </span>
      </>
    ),
    toolbarActions: (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Prompt message settings"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </Button>
    ),
  },
});

export const ReadOnly = meta.story({
  args: {
    value: "Return a score for {{output}} and explain the evidence behind it.",
    onChange: fn(),
    variableStatus: { output: { status: "valid" } },
    variableMappings: { output: "Observation output" },
    readOnly: true,
  },
});

export const SearchPanel = meta.story({
  name: "(Test) Search Panel",
  args: {
    value:
      "Return only valid JSON. Do not add markdown or an explanation around the JSON object.",
    onChange: fn(),
    showPreviewToggle: true,
    previewEnabled: false,
    onPreviewEnabledChange: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = canvasElement.querySelector<HTMLElement>(".cm-content");
    if (!editor) throw new Error("Prompt editor not found");

    await userEvent.click(editor);
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "f",
        code: "KeyF",
        metaKey: isMac,
        ctrlKey: !isMac,
        bubbles: true,
      }),
    );

    const findInput = await canvas.findByRole("textbox", { name: "Find" });
    await userEvent.type(findInput, "JSON");
    await expect(
      canvasElement.querySelector(".cm-panels-top .cm-search"),
    ).toBeInTheDocument();
  },
});
