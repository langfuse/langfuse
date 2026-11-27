import { type PromptVariable } from "@langfuse/shared";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../../../.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

import { ImportPromptVariablesDialog } from "./ImportPromptVariablesDialog";

function ImportPromptVariablesDialogStory({
  promptVariables,
  onImport,
}: {
  promptVariables: PromptVariable[];
  onImport: (values: Record<string, string>) => void;
}) {
  return (
    <DialogController<boolean>
      initialState={() => true}
      renderDialog={({ closeDialog }) => (
        <ImportPromptVariablesDialog
          promptVariables={promptVariables}
          onImport={onImport}
          onClose={closeDialog}
        />
      )}
    >
      {({ openDialog }) => (
        <Button text="Import JSON" onClick={() => openDialog(true)} />
      )}
    </DialogController>
  );
}

const onImport = fn<(values: Record<string, string>) => void>();

const meta = preview.meta({
  component: ImportPromptVariablesDialogStory,
  parameters: { layout: "fullscreen" },
  args: {
    promptVariables: [
      { name: "storeName", value: "Tokyo Store", isUsed: true },
      {
        name: "summary",
        value: "Great service.\nFriendly staff.",
        isUsed: true,
      },
      { name: "unused", value: "Keep this value", isUsed: false },
    ],
    onImport,
  },
});

export const Default = meta.story({});

export const ValidatesAndImports = meta.story({
  name: "(Test) Validates and imports",
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = body.getByRole("textbox", { name: "Variable values (JSON)" });
    onImport.mockClear();

    await userEvent.clear(input);
    await userEvent.paste('{"storeName":42}');
    await userEvent.click(
      body.getByRole("button", { name: "Import variables" }),
    );

    await expect(body.getByRole("alert")).toHaveTextContent(
      "The value for storeName must be a string.",
    );
    await expect(onImport).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.paste('{"storeName":"Osaka Store","summary":"Updated"}');
    await userEvent.click(
      body.getByRole("button", { name: "Import variables" }),
    );

    await expect(onImport).toHaveBeenCalledTimes(1);
    await expect(onImport).toHaveBeenCalledWith({
      storeName: "Osaka Store",
      summary: "Updated",
    });
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  },
});

export const ImportsPartialValues = meta.story({
  name: "(Test) Imports partial values without changing whitespace",
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = body.getByRole("textbox", { name: "Variable values (JSON)" });
    const summary = "  first line\nsecond line\t ";
    onImport.mockClear();

    await userEvent.clear(input);
    await userEvent.paste(JSON.stringify({ storeName: "", summary }));
    await userEvent.click(
      body.getByRole("button", { name: "Import variables" }),
    );

    await expect(onImport).toHaveBeenCalledTimes(1);
    await expect(onImport).toHaveBeenCalledWith({ storeName: "", summary });
    await expect(onImport.mock.calls[0]?.[0]).not.toHaveProperty("unused");
  },
});

export const RejectsInvalidInputs = meta.story({
  name: "(Test) Rejects invalid input without partially importing",
  play: async ({ canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = body.getByRole("textbox", { name: "Variable values (JSON)" });
    onImport.mockClear();

    const invalidInputs = [
      ["malformed JSON", '{"storeName":'],
      ["null", "null"],
      ["an array", '["Tokyo Store"]'],
      ["a scalar", '"Tokyo Store"'],
      ["an empty object", "{}"],
      ["a numeric value", '{"storeName":"New store","summary":42}'],
      ["a boolean value", '{"storeName":"New store","summary":false}'],
      ["a null value", '{"storeName":"New store","summary":null}'],
      ["an object value", '{"storeName":"New store","summary":{}}'],
      ["an array value", '{"storeName":"New store","summary":[]}'],
      ["an unknown key", '{"storeName":"New store","unknown":"value"}'],
      ["a message placeholder", '{"storeName":"New store","history":"[]"}'],
      [
        "an unknown prototype key",
        '{"storeName":"New store","__proto__":"value"}',
      ],
    ] as const;

    for (const [name, json] of invalidInputs) {
      await step(`Rejects ${name}`, async () => {
        await userEvent.clear(input);
        await userEvent.paste(json);
        await userEvent.click(
          body.getByRole("button", { name: "Import variables" }),
        );

        await expect(onImport).not.toHaveBeenCalled();
        await expect(body.getByRole("alert")).toBeVisible();
        await expect(body.getByRole("dialog")).toBeVisible();
      });
    }
  },
});

export const ImportsPrototypeNamedVariables = meta.story({
  name: "(Test) Imports prototype-named variables as own properties",
  args: {
    promptVariables: ["__proto__", "constructor", "toString"].map((name) => ({
      name,
      value: "old",
      isUsed: true,
    })),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = body.getByRole("textbox", { name: "Variable values (JSON)" });
    onImport.mockClear();

    await userEvent.clear(input);
    await userEvent.paste(
      '{"__proto__":"proto value","constructor":"constructor value","toString":"string value"}',
    );
    await userEvent.click(
      body.getByRole("button", { name: "Import variables" }),
    );

    await expect(onImport).toHaveBeenCalledTimes(1);
    const imported = onImport.mock.calls[0]?.[0];
    await expect(imported).toEqual(
      Object.fromEntries([
        ["__proto__", "proto value"],
        ["constructor", "constructor value"],
        ["toString", "string value"],
      ]),
    );
    for (const name of ["__proto__", "constructor", "toString"]) {
      await expect(Object.hasOwn(imported ?? {}, name)).toBe(true);
    }
  },
});

export const PrivateValidationErrors = meta.story({
  name: "(Test) Clears validation errors and protects customer content",
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = body.getByRole("textbox", { name: "Variable values (JSON)" });

    await userEvent.clear(input);
    await userEvent.paste('{"privateUnknownVariable":"customer content"}');
    await userEvent.click(
      body.getByRole("button", { name: "Import variables" }),
    );

    const error = body.getByRole("alert");
    await expect(error).toHaveTextContent("privateUnknownVariable");
    await expect(input.closest(".ph-no-capture")).not.toBeNull();
    await expect(error.closest(".ph-no-capture")).not.toBeNull();
    await expect(input).toHaveAttribute("aria-invalid", "true");

    await userEvent.clear(input);
    await userEvent.paste('{"storeName":"New store"}');

    await expect(body.queryByRole("alert")).not.toBeInTheDocument();
    await expect(input).toHaveAttribute("aria-invalid", "false");
  },
});

export const DiscardsCancelledDrafts = meta.story({
  name: "(Test) Discards cancelled drafts and reopens with current values",
  render: (args) => {
    const [variables, setVariables] = useState(args.promptVariables);

    return (
      <DialogController<boolean>
        initialState={() => true}
        renderDialog={({ closeDialog }) => (
          <ImportPromptVariablesDialog
            promptVariables={variables}
            onImport={args.onImport}
            onClose={closeDialog}
          />
        )}
      >
        {({ openDialog }) => (
          <Button
            text="Open latest values"
            onClick={() => {
              setVariables([
                { name: "storeName", value: "Latest store", isUsed: true },
              ]);
              openDialog(true);
            }}
          />
        )}
      </DialogController>
    );
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = body.getByRole("textbox", { name: "Variable values (JSON)" });
    onImport.mockClear();

    await userEvent.clear(input);
    await userEvent.paste('{"unknown":"cancelled draft"}');
    await userEvent.click(
      body.getByRole("button", { name: "Import variables" }),
    );
    await expect(body.getByRole("alert")).toBeVisible();
    await userEvent.click(body.getByRole("button", { name: "Cancel" }));

    await expect(onImport).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(body.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await userEvent.click(
      body.getByRole("button", { name: "Open latest values" }),
    );

    await expect(
      body.getByRole("textbox", { name: "Variable values (JSON)" }),
    ).toHaveValue(JSON.stringify({ storeName: "Latest store" }, null, 2));
    await expect(body.queryByRole("alert")).not.toBeInTheDocument();
  },
});
