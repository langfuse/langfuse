import { useState, type ComponentProps } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "@/.storybook/preview";
import { ControlledFilterBuilderEditor } from "./ControlledFilterBuilderEditor";

const defaultArgs = {
  columns: [{ id: "name", name: "Name", type: "string", internal: "name" }],
  draft: [{}],
  onDraftChange: fn(),
} satisfies ComponentProps<typeof ControlledFilterBuilderEditor>;

const meta = preview.meta({ component: ControlledFilterBuilderEditor });

export const ExternalDraft = meta.story({
  args: defaultArgs,
  render: function Render(args) {
    const [draft, setDraft] = useState<
      ComponentProps<typeof ControlledFilterBuilderEditor>["draft"]
    >(args.draft);
    const [editorVersion, setEditorVersion] = useState(0);

    return (
      <>
        <ControlledFilterBuilderEditor
          {...args}
          draft={draft}
          key={editorVersion}
          onDraftChange={(next, result) => {
            setDraft(next);
            args.onDraftChange(next, result);
          }}
        />
        <button
          type="button"
          onClick={() => {
            setEditorVersion(editorVersion + 1);
            setDraft([{}]);
          }}
        >
          Reset draft
        </button>
      </>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByLabelText("Column"));
    await userEvent.click(await page.findByRole("option", { name: "Name" }));

    await expect(canvas.getByRole("textbox", { name: "Value" })).toBeVisible();
    await expect(args.onDraftChange).toHaveBeenCalledWith(
      [expect.objectContaining({ column: "Name", operator: "=" })],
      { validFilters: [] },
    );

    await userEvent.click(canvas.getByRole("button", { name: "Reset draft" }));
    await expect(
      canvas.queryByRole("textbox", { name: "Value" }),
    ).not.toBeInTheDocument();
  },
});
