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
    initialViewMode: "conversational" as const,
    onApply: fn(),
    preview: { traces: [], pending: false, error: undefined },
  },
});

export default meta;

export const TestObservationFilters = meta.story({
  name: "(Test) Observation filters",
  play: async ({ args }) => {
    const body = within(document.body);
    await expect(
      body.getByRole("heading", { name: /Trace: chat/ }),
    ).toBeInTheDocument();
    await expect(
      body.queryByRole("group", { name: "Trace chat" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      body.getByRole("button", { name: "Collapse trace chat" }),
    );
    await expect(
      body.queryByRole("group", { name: "Observation completion" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      body.getByRole("button", { name: "Expand trace chat" }),
    );
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
    await userEvent.click(body.getByRole("button", { name: "Apply changes" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      [
        { column: "traceName", type: "string", operator: "=", value: "chat" },
        { column: "name", type: "string", operator: "=", value: "completion" },
      ],
      "hide",
      "conversational",
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
              userId: null,
              environment: "default",
              traceTags: [],
              metadata: {},
              name: "agent",
              type: "SPAN",
              level: "DEFAULT",
              isRootObservation: true,
              parentObservationId: null,
            },
            {
              id: "child",
              userId: null,
              environment: "default",
              traceTags: [],
              metadata: {},
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
              userId: null,
              environment: "default",
              traceTags: [],
              metadata: {},
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

export const Default = meta.story({
  tags: ["!test"],
  args: TestObservationFilters.input.args,
});

export const TestInvalidDraftKeepsPreview = TestObservationFilters.extend({
  play: async ({ args }) => {
    const body = within(document.body);
    const input = body.getByRole("combobox", { name: "Search" });
    await userEvent.click(input);
    await userEvent.paste("name:=completion");
    const completion = body.getByRole("group", {
      name: "Observation completion",
    });
    const agent = body.getByRole("group", { name: "Observation agent" });
    await expect(
      within(completion).queryByText("Excluded by filters"),
    ).not.toBeInTheDocument();
    await expect(
      within(agent).getByText("Excluded by filters"),
    ).toBeInTheDocument();

    await userEvent.type(input, " unknown:value");
    await userEvent.type(input, " more");
    await expect(
      body.getByRole("button", { name: "Generations" }),
    ).toBeDisabled();
    await expect(
      within(completion).queryByText("Excluded by filters"),
    ).not.toBeInTheDocument();
    await expect(
      within(agent).getByText("Excluded by filters"),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Apply changes" }));
    await expect(args.onApply).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.paste("name:=agent");
    await expect(
      within(completion).getByText("Excluded by filters"),
    ).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Apply changes" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      [{ column: "name", type: "string", operator: "=", value: "agent" }],
      "show",
      "conversational",
    );
  },
});

export const TestPreserveSkippedFilters = TestObservationFilters.extend({
  args: {
    initialFilters: [
      { column: "userId", type: "string", operator: "=", value: "user" },
      {
        column: "environment",
        type: "string",
        operator: "=",
        value: "production",
      },
      {
        column: "traceTags",
        type: "arrayOptions",
        operator: "any of",
        value: ["important"],
      },
      {
        column: "metadata",
        type: "stringObject",
        key: "region",
        operator: "=",
        value: "eu",
      },
    ],
    preview: {
      pending: false,
      error: undefined,
      traces: [
        {
          id: "trace",
          name: "chat",
          truncated: false,
          observations: [
            {
              id: "root",
              parentObservationId: null,
              name: "agent",
              type: "GENERATION",
              level: "DEFAULT",
              isRootObservation: true,
              userId: "user",
              environment: "production",
              traceTags: ["important"],
              metadata: { region: "eu" },
            },
          ],
        },
      ],
    },
  },
  play: async ({ args }) => {
    const body = within(document.body);
    await expect(
      body.queryByText("Excluded by filters"),
    ).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Apply changes" }));
    await expect(args.onApply).toHaveBeenCalledWith(
      args.initialFilters,
      "show",
      "conversational",
    );
    await userEvent.click(body.getByRole("button", { name: "Generations" }));
    await userEvent.click(body.getByRole("button", { name: "Apply changes" }));
    await expect(args.onApply).toHaveBeenLastCalledWith(
      [
        { column: "type", type: "string", operator: "=", value: "GENERATION" },
        ...args.initialFilters,
      ],
      "show",
      "conversational",
    );
  },
});

export const TestConfirmAllObservationsExcluded = TestObservationFilters.extend(
  {
    args: {
      initialFilters: [
        { column: "name", type: "string", operator: "=", value: "no-match" },
      ],
    },
    play: async ({ args }) => {
      const body = within(document.body);
      await userEvent.click(
        body.getByRole("button", { name: "Apply changes" }),
      );
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
      await userEvent.click(
        body.getByRole("button", { name: "Apply changes" }),
      );
      await userEvent.click(
        await body.findByRole("button", { name: "Apply filters anyway" }),
      );
      await expect(args.onApply).toHaveBeenCalledTimes(1);
      await expect(args.onApply).toHaveBeenCalledWith(
        args.initialFilters,
        "show",
        "conversational",
      );
    },
  },
);
