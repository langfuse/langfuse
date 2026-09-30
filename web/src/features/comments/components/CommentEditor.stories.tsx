import { useRef, useState, type ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { Button } from "@/src/components/ui/button";
import { CommentEditor, type CommentEditorHandle } from "./CommentEditor";

const meta = preview.meta({ component: CommentEditor });

function ControlledEditor(args: ComponentProps<typeof CommentEditor>) {
  const [value, setValue] = useState(args.value);
  return (
    <CommentEditor
      {...args}
      value={value}
      onChange={(nextValue) => {
        setValue(nextValue);
        args.onChange(nextValue);
      }}
    />
  );
}

export const Empty = meta.story({
  args: { value: "", onChange: fn() },
  render: (args) => <ControlledEditor {...args} />,
});

export const TestEmptyCaret = meta.story({
  name: "(Test) Keeps The Empty Caret Inside The Scrollport",
  args: { value: "", onChange: fn() },
  render: (args) => <ControlledEditor {...args} />,
  play: async ({ canvasElement }) => {
    const textbox = within(canvasElement).getByRole("textbox", {
      name: "New comment",
    });
    await userEvent.click(textbox);
    await expect(textbox).toHaveFocus();
    await waitFor(() => {
      const editor = textbox.closest(".cm-editor");
      const cursor = editor?.querySelector(".cm-cursor-primary");
      const scroller = editor?.querySelector(".cm-scroller");
      expect(cursor).not.toBeNull();
      expect(scroller).not.toBeNull();
      if (!cursor || !scroller) return;
      const caretBounds = cursor.getBoundingClientRect();
      const scrollBounds = scroller.getBoundingClientRect();
      expect(caretBounds.left).toBeGreaterThanOrEqual(scrollBounds.left);
      expect(caretBounds.right).toBeLessThanOrEqual(scrollBounds.right);
    });
  },
});

export const WithMentions = meta.story({
  args: {
    value: "Could @[Alice](user:alice_1) review this **response**?\nThanks!",
    onChange: fn(),
  },
  render: (args) => <ControlledEditor {...args} />,
});

export const Disabled = meta.story({
  args: {
    value: "Thanks @[Alice](user:alice_1)!",
    onChange: fn(),
    disabled: true,
  },
});

export const TestInsertedMention = meta.story({
  name: "(Test) Inserts Mention Without Exposing Syntax",
  args: { value: "Review @al", onChange: fn(), onCursorChange: fn() },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    const editorRef = useRef<CommentEditorHandle>(null);
    return (
      <>
        <CommentEditor
          {...args}
          ref={editorRef}
          value={value}
          onChange={(nextValue) => {
            setValue(nextValue);
            args.onChange(nextValue);
          }}
        />
        <Button
          onClick={() =>
            editorRef.current?.replaceRange(
              7,
              10,
              "@[Alice [Ops]](user:alice_1) ",
            )
          }
        >
          Mention Alice
        </Button>
      </>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Mention Alice" }),
    );
    const raw = "Review @[Alice [Ops]](user:alice_1) ";
    await expect(args.onChange).toHaveBeenLastCalledWith(raw);
    await expect(args.onCursorChange).toHaveBeenLastCalledWith(raw.length);
    const textbox = canvas.getByRole("textbox", { name: "New comment" });
    await expect(textbox).toHaveTextContent("Review @Alice [Ops]");
    await expect(textbox).not.toHaveTextContent("user:alice_1");
    await userEvent.keyboard("Looks good");
    await expect(args.onChange).toHaveBeenLastCalledWith(`${raw}Looks good`);
  },
});

export const TestAtomicMentionNavigation = meta.story({
  name: "(Test) Navigates And Deletes A Whole Mention",
  args: {
    value: "Hi @[Alice](user:alice_1)!",
    onChange: fn(),
    onCursorChange: fn(),
  },
  render: (args) => <ControlledEditor {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const textbox = canvas.getByRole("textbox", { name: "New comment" });
    await userEvent.click(textbox);
    await userEvent.keyboard("{End}{ArrowLeft}");
    await expect(args.onCursorChange).toHaveBeenLastCalledWith(
      args.value.length - 1,
    );
    await userEvent.keyboard("{ArrowLeft}");
    await expect(args.onCursorChange).toHaveBeenLastCalledWith(3);
    await userEvent.keyboard("{ArrowRight}{Backspace}");
    await expect(args.onChange).toHaveBeenLastCalledWith("Hi !");
    await expect(textbox).toHaveTextContent("Hi !");
  },
});

export const TestMultilineMentionName = meta.story({
  name: "(Test) Preserves Multiline Mention Names In Storage",
  args: {
    value: "@[Alice [Ops]\nOn call](user:alice_1)",
    onChange: fn(),
  },
  render: (args) => <ControlledEditor {...args} />,
  play: async ({ args, canvasElement }) => {
    const textbox = within(canvasElement).getByRole("textbox", {
      name: "New comment",
    });
    await expect(textbox).toHaveTextContent("@Alice [Ops] On call");
    await expect(textbox).not.toHaveTextContent("user:alice_1");
    await userEvent.click(textbox);
    await userEvent.keyboard("{End} thanks");
    await expect(args.onChange).toHaveBeenLastCalledWith(
      `${args.value} thanks`,
    );
  },
});

export const TestHandledKeyDoesNotEdit = meta.story({
  name: "(Test) Lets The Composer Handle Enter Before Editing",
  args: {
    value: "Draft",
    onChange: fn(),
    onKeyDown: fn((event: KeyboardEvent) => event.key === "Enter"),
    id: "comment-content",
    "aria-invalid": true,
    "aria-describedby": "comment-error",
  },
  render: (args) => (
    <>
      <ControlledEditor {...args} />
      <p id="comment-error">Comment is too long.</p>
    </>
  ),
  play: async ({ args, canvasElement }) => {
    const textbox = within(canvasElement).getByRole("textbox", {
      name: "New comment",
    });
    await expect(textbox).toHaveAttribute("id", "comment-content");
    await expect(textbox).toHaveAttribute("aria-invalid", "true");
    await expect(textbox).toHaveAccessibleDescription("Comment is too long.");
    await userEvent.click(textbox);
    await userEvent.keyboard("{End}{Enter}!");
    await expect(args.onChange).toHaveBeenLastCalledWith("Draft!");
    await expect(args.onKeyDown).toHaveBeenCalled();
  },
});
