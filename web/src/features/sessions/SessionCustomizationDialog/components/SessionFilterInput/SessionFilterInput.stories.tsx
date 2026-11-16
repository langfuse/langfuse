import { useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../../../.storybook/preview";
import { WORD_JOINER } from "@/src/components/design-system/QueryTokens/QueryTokens.constants";
import {
  SessionFilterInput,
  useSessionFilterInput,
} from "./SessionFilterInput";

const generation: FilterState[number] = {
  column: "type",
  type: "string",
  operator: "=",
  value: "GENERATION",
};

const meta = preview.meta({
  component: function SessionFilterInputExample({
    initialFilters,
    onRead,
  }: {
    initialFilters: FilterState;
    onRead: (filters: FilterState | null) => void;
  }) {
    const [filters, setFilters] = useState(initialFilters);
    const input = useSessionFilterInput({
      projectId: "storybook-project",
      filters,
      onFiltersChange: setFilters,
    });
    return (
      <div className="flex w-full max-w-xl flex-col gap-4">
        <SessionFilterInput
          {...input.inputProps}
          inputId="observation-filters"
        />
        <output aria-label="Preview filters">
          {JSON.stringify(input.filters)}
        </output>
        <output aria-label="Committed filters">
          {JSON.stringify(filters)}
        </output>
        <output aria-label="Query validity">
          {input.invalid ? "Invalid" : "Valid"}
        </output>
        <button type="button" onClick={() => onRead(input.readFilters())}>
          Read filters
        </button>
        <button type="button" onClick={() => input.applyFilters([generation])}>
          Apply generation preset
        </button>
        <button type="button" onClick={() => setFilters([generation])}>
          Replace external filters
        </button>
      </div>
    );
  },
  args: { initialFilters: [], onRead: fn() },
});

export default meta;

export const TestInvalidDraftKeepsPreview = meta.story({
  name: "(Test) Invalid draft keeps last valid preview",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Observation filters" });
    await userEvent.click(input);
    await userEvent.paste("type:=GENERATION");
    await expect(
      JSON.parse(
        canvas.getByLabelText("Preview filters").textContent ?? "null",
      ),
    ).toEqual([generation]);
    await userEvent.paste(" -type:=GENERATION");
    await expect(canvas.getByLabelText("Query validity")).toHaveTextContent(
      "Invalid",
    );
    await expect(
      JSON.parse(
        canvas.getByLabelText("Preview filters").textContent ?? "null",
      ),
    ).toEqual([generation]);
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Read filters" }));
    await expect(args.onRead).toHaveBeenLastCalledWith(null);
    await expect(input).toHaveAttribute("aria-invalid", "true");
  },
});

export const TestCommitCompletion = meta.story({
  name: "(Test) Completion commits its edited value",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Observation filters" });
    await userEvent.click(input);
    await userEvent.paste("type:GEN");
    await userEvent.click(
      await within(document.body).findByRole("option", { name: /GENERATION/ }),
    );
    await expect(
      JSON.parse(
        canvas.getByLabelText("Committed filters").textContent ?? "null",
      ),
    ).toEqual([generation]);
    await expect(input.textContent?.replaceAll(WORD_JOINER, "")).toBe(
      "type:=GENERATION ",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Read filters" }));
    await expect(args.onRead).toHaveBeenLastCalledWith([generation]);
    await expect(input.textContent?.replaceAll(WORD_JOINER, "")).toBe(
      "type:=GENERATION ",
    );
  },
});

export const TestPreserveHiddenFilters = meta.story({
  name: "(Test) Preserve hidden filters until their field is edited",
  args: {
    initialFilters: [
      {
        column: "name",
        type: "arrayOptions",
        operator: "all of",
        value: ["agent"],
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Observation filters" });
    await expect(input.textContent?.replaceAll(WORD_JOINER, "")).toBe("");
    await userEvent.click(input);
    await userEvent.paste("type:=GENERATION");
    await expect(
      JSON.parse(
        canvas.getByLabelText("Preview filters").textContent ?? "null",
      ),
    ).toEqual([generation, ...args.initialFilters]);
    await userEvent.clear(input);
    await userEvent.paste("name:agent");
    await userEvent.click(canvas.getByRole("button", { name: "Read filters" }));
    await expect(args.onRead).toHaveBeenLastCalledWith([
      { column: "name", type: "string", operator: "contains", value: "agent" },
    ]);
  },
});

export const TestExternalFilterChanges = meta.story({
  name: "(Test) External filter changes replace local drafts",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Observation filters" });
    await userEvent.click(input);
    await userEvent.paste("name:unfinished");
    await userEvent.click(
      canvas.getByRole("button", { name: "Replace external filters" }),
    );
    await expect(input.textContent?.replaceAll(WORD_JOINER, "")).toBe(
      "type:=GENERATION",
    );
    await expect(
      JSON.parse(
        canvas.getByLabelText("Preview filters").textContent ?? "null",
      ),
    ).toEqual([generation]);
    await userEvent.clear(input);
    await userEvent.click(input);
    await userEvent.paste("name:agent");
    await expect(input.textContent?.replaceAll(WORD_JOINER, "")).toBe(
      "name:agent",
    );
  },
});

export const TestPresetsAndClear = meta.story({
  name: "(Test) Apply presets and clear filters",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Apply generation preset" }),
    );
    const input = canvas.getByRole("combobox", { name: "Observation filters" });
    await expect(input.textContent?.replaceAll(WORD_JOINER, "")).toBe(
      "type:=GENERATION",
    );
    await userEvent.clear(input);
    await userEvent.click(canvas.getByRole("button", { name: "Read filters" }));
    await expect(args.onRead).toHaveBeenLastCalledWith([]);
    await expect(canvas.getByLabelText("Committed filters")).toHaveTextContent(
      "[]",
    );
    await expect(input.textContent?.replaceAll(WORD_JOINER, "")).toBe("");
  },
});
