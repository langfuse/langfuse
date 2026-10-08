import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { SessionCustomizationDialog } from "./SessionCustomizationDialog";

const meta = preview.meta({
  component: SessionCustomizationDialog,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <DialogController<null>
        initialState={() => null}
        renderDialog={() => <Story />}
      >
        {() => null}
      </DialogController>
    ),
  ],
  args: {
    projectId: "storybook-project",
    initialFilters: [],
    initialUnmatchedTraces: "show" as const,
    observed: {
      traceTags: [{ value: "billing" }, { value: "urgent" }],
    },
    onApply: fn(),
    preview: { traces: [], pending: false, error: undefined },
  },
});

export default meta;

export const TestObservationFilters = meta.story({
  name: "(Test) Observation filters",
  play: async ({ args }) => {
    const body = within(document.body);
    const completion = await body.findByRole("group", {
      name: "Observation completion",
    });
    const input = body.getByRole("combobox", { name: "Search" });
    await userEvent.click(input);
    await userEvent.paste("traceName:=other name:=completion");
    await expect(
      within(completion).getByText("Excluded by filters"),
    ).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.paste("traceName:=chat observationName:=completion");
    await expect(
      within(completion).queryByText("Excluded by filters"),
    ).not.toBeInTheDocument();
    await expect(
      within(body.getByRole("group", { name: "Observation agent" })).getByText(
        "Excluded by filters",
      ),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("radio", { name: "Hide" }));
    await expect(args.onApply).not.toHaveBeenCalled();
    await userEvent.click(body.getByRole("button", { name: "Apply filters" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      [
        { column: "traceName", type: "string", operator: "=", value: "chat" },
        { column: "name", type: "string", operator: "=", value: "completion" },
      ],
      "hide",
    );
  },
  args: {
    preview: {
      pending: false,
      error: undefined,
      traces: [
        {
          id: "trace-1",
          name: "chat",
          truncated: true,
          observations: [
            {
              id: "root",
              name: "agent",
              type: "SPAN",
              level: "DEFAULT",
              isRootObservation: true,
              parentObservationId: null,
            },
            {
              id: "child",
              name: "completion",
              type: "GENERATION",
              level: "DEFAULT",
              isRootObservation: false,
              parentObservationId: "root",
            },
          ],
        },
        {
          id: "unmatched",
          name: "other",
          truncated: false,
          observations: [
            {
              id: "other-root",
              name: "other root",
              type: "SPAN",
              level: "DEFAULT",
              isRootObservation: true,
              parentObservationId: null,
            },
          ],
        },
      ],
    },
  },
});

export const Default = meta.story({ args: TestObservationFilters.input.args });

export const TestConfirmAllObservationsExcluded = Default.extend({
  args: {
    initialFilters: [
      { column: "name", type: "string", operator: "=", value: "no-match" },
    ],
  },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(body.getByRole("button", { name: "Apply filters" }));
    const confirmation = await body.findByRole("dialog", {
      name: "Apply filters with no matching observations?",
    });
    await expect(args.onApply).not.toHaveBeenCalled();
    await userEvent.click(
      within(confirmation).getByRole("button", { name: "Cancel" }),
    );
    await expect(args.onApply).not.toHaveBeenCalled();
    await expect(
      await body.findByRole("dialog", { name: "Customize session view" }),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Apply filters" }));
    await userEvent.click(
      await body.findByRole("button", { name: "Apply filters anyway" }),
    );
    await expect(args.onApply).toHaveBeenCalledTimes(1);
    await expect(args.onApply).toHaveBeenCalledWith(
      args.initialFilters,
      "show",
    );
  },
});
