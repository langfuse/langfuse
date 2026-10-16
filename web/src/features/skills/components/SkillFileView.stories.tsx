import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { SkillFileView } from "./SkillFileView";

const meta = preview.meta({ component: SkillFileView });

const content =
  "---\nname: review-code\ndescription: Review a change for correctness.\n---\n\n# Instructions\n\nRead **carefully**.";

export const Viewing = meta.story({
  args: { path: "SKILL.md", content, mode: { kind: "view" } },
});

export const DraftPreview = meta.story({
  name: "(Test) Preview preserves unsaved edits",
  args: { path: "SKILL.md", content, mode: { kind: "view" } },
  render: function Render(args) {
    const [draft, setDraft] = useState(args.content);
    return (
      <SkillFileView
        {...args}
        content={draft}
        mode={{ kind: "draft", editable: true, onChange: setDraft }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("tab", { name: "Raw" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const editor = canvas.getByRole("textbox");
    await userEvent.click(editor);
    await userEvent.keyboard(
      /Mac|iPhone|iPad/.test(navigator.platform)
        ? "{Meta>}{ArrowDown}{/Meta}"
        : "{Control>}{End}{/Control}",
    );
    await userEvent.keyboard("{End}{Enter}{Enter}Unsaved preview text");
    await userEvent.click(canvas.getByRole("tab", { name: "Formatted" }));
    await expect(canvas.getByText("Unsaved preview text")).toBeVisible();
    await expect(
      canvas.getByRole("region", { name: "Skill front matter" }),
    ).toHaveTextContent("review-code");
    await userEvent.click(canvas.getByRole("tab", { name: "Raw" }));
    await expect(canvas.getByRole("textbox")).toHaveTextContent(
      "Unsaved preview text",
    );
  },
});

export const RawSource = meta.story({
  name: "(Test) Views original source",
  args: { path: "SKILL.md", content, mode: { kind: "view" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Raw" }));
    await expect(
      canvas.getByRole("tabpanel").querySelector("pre")?.textContent,
    ).toBe(content);
    await userEvent.click(canvas.getByRole("tab", { name: "Formatted" }));
    await expect(
      canvas.getByRole("heading", { name: "Instructions" }),
    ).toBeVisible();
  },
});
