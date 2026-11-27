import { useState } from "react";
import { StateEffect } from "@codemirror/state";
import { EditorView } from "@uiw/react-codemirror";
import { expect, fn, userEvent, waitFor } from "storybook/test";

import preview from "../../../.storybook/preview";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

const meta = preview.meta({
  component: CodeMirrorEditor,
});

export const EmptyPrompt = meta.story({
  args: {
    value: "",
    mode: "prompt",
    onChange: fn(),
    minHeight: 120,
    lineNumbers: false,
    placeholder: "Enter user here.",
  },
});

export const Json = meta.story({
  args: {
    value: "",
    mode: "json",
    onChange: fn(),
    minHeight: 120,
    placeholder: "Enter JSON",
  },
});

function isReconfigureSpec(value: unknown): boolean {
  if (!value || typeof value !== "object" || !("effects" in value)) {
    return false;
  }

  const effects = Array.isArray(value.effects)
    ? value.effects
    : [value.effects];
  return effects.some(
    (effect) =>
      effect != null &&
      typeof effect === "object" &&
      "is" in effect &&
      typeof effect.is === "function" &&
      effect.is(StateEffect.reconfigure),
  );
}

export const BlocksSessionRecording = meta.story({
  name: "(Test) Blocks Session Recording",
  args: {
    value: "customer payload",
    mode: "text",
    onChange: fn(),
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(canvasElement.querySelector(".cm-editor")).toBeTruthy();
    });
    expect(canvasElement.querySelector(".ph-no-capture")).toBeInTheDocument();
  },
});

export const TypesFirstCharacter = meta.story({
  name: "(Test) Types First Character",
  render: function TypesFirstCharacterStory() {
    const [value, setValue] = useState("");
    return (
      <CodeMirrorEditor
        mode="prompt"
        value={value}
        lineNumbers={false}
        placeholder="Enter user here."
        onChange={(next) => setValue(next)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const editor = await waitFor(() => {
      const content = canvasElement.querySelector<HTMLElement>(".cm-content");
      if (!content) {
        throw new Error("Prompt editor not found");
      }
      return content;
    });

    const view = EditorView.findFromDOM(editor);
    if (!view) {
      throw new Error("Prompt editor view not found");
    }

    let reconfiguredAfterMount = false;
    const dispatch = view.dispatch.bind(view);
    const wrappedDispatch: EditorView["dispatch"] = ((...input: unknown[]) => {
      if (input.some(isReconfigureSpec)) {
        reconfiguredAfterMount = true;
      }
      (dispatch as (...args: unknown[]) => void)(...input);
    }) as EditorView["dispatch"];
    view.dispatch = wrappedDispatch;

    await userEvent.click(editor);
    await userEvent.keyboard("hello");

    await waitFor(() => {
      expect(editor).toHaveTextContent("hello");
    });

    const deadline = Date.now() + 200;
    while (!reconfiguredAfterMount && Date.now() < deadline) {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    }

    expect(reconfiguredAfterMount).toBe(false);
  },
});
