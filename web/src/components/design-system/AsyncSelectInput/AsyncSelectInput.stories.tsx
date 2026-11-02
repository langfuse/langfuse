import { useState } from "react";
import { Hash } from "@langfuse/icons";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { AsyncSelectInput } from "./AsyncSelectInput";

const meta = preview.meta({ component: AsyncSelectInput });

const onSelect = fn();

export const ExternalResults = meta.story({
  name: "(Test) Selected option persists outside external search results",
  render: () => {
    const [search, setSearch] = useState("");
    const [value, setValue] = useState<
      React.ComponentProps<typeof AsyncSelectInput>["value"]
    >({ value: "saved", label: "Saved channel", icon: Hash });
    return (
      <AsyncSelectInput
        aria-label="Channel"
        value={value}
        onValueChange={(next) => {
          setValue(next);
          onSelect(next);
        }}
        placeholder="Select a channel"
        loading={!search ? { message: "Loading options…" } : undefined}
        search={{
          placeholder: "Search channels",
          value: search,
          onValueChange: setSearch,
        }}
        options={
          search
            ? [{ value: "result", label: "Server result", icon: Hash }]
            : []
        }
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    onSelect.mockClear();
    const trigger = canvas.getByRole("combobox");
    await expect(trigger).toHaveTextContent("Saved channel");
    await userEvent.click(trigger);
    await expect(body.getByRole("status")).toHaveTextContent(
      "Loading options…",
    );
    await expect(
      body.queryByText("No options available."),
    ).not.toBeInTheDocument();
    await userEvent.type(
      body.getByPlaceholderText("Search channels"),
      "unrelated query",
    );
    const result = await body.findByRole("option", { name: "Server result" });
    await expect(result).toBeVisible();
    await expect(body.queryByRole("status")).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(onSelect).toHaveBeenCalledWith({
      value: "result",
      label: "Server result",
      icon: Hash,
    });
    await expect(trigger).toHaveTextContent("Server result");
    await userEvent.click(trigger);
    await expect(body.getByPlaceholderText("Search channels")).toHaveValue("");
    await expect(trigger).toHaveTextContent("Server result");
  },
});

export const CallToActionOption = meta.story({
  name: "(Test) Call to action supports both positions without changing selection",
  args: {
    value: { value: "first", label: "First option" },
    onValueChange: fn(),
    placeholder: "Select an option",
    search: { placeholder: "Search", value: "", onValueChange: fn() },
    options: [
      { value: "first", label: "First option" },
      { value: "second", label: "Second option" },
    ],
    callToActionOption: {
      label: "Create option",
      position: "first",
      onSelect: fn(),
    },
  },
  render: (args) => (
    <div className="flex flex-col gap-2">
      {(["first", "last"] as const).flatMap((position) =>
        [false, true].map((virtualized) => (
          <AsyncSelectInput
            {...args}
            key={`${position}-${virtualized}`}
            aria-label={`${position}-${virtualized}`}
            callToActionOption={
              args.callToActionOption && {
                ...args.callToActionOption,
                position,
              }
            }
            virtualized={virtualized}
          />
        )),
      )}
    </div>
  ),
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    for (const position of ["first", "last"]) {
      for (const trigger of within(canvasElement).getAllByRole("combobox", {
        name: new RegExp(`^${position}-`),
      })) {
        await userEvent.click(trigger);
        await waitFor(() =>
          expect(
            body.getAllByRole("option").map((option) => option.textContent),
          ).toEqual(
            position === "first"
              ? ["Create option", "First option", "Second option"]
              : ["First option", "Second option", "Create option"],
          ),
        );
        await userEvent.keyboard(
          position === "first" ? "{Home}{Enter}" : "{End}{Enter}",
        );
        await expect(trigger).toHaveTextContent("First option");
        await expect(trigger).toHaveAttribute("aria-expanded", "false");
      }
    }
    await expect(args.callToActionOption?.onSelect).toHaveBeenCalledTimes(4);
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
});
