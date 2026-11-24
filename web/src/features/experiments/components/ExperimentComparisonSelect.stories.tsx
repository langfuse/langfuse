import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import preview from "../../../../.storybook/preview";
import { ExperimentComparisonSelect } from "./ExperimentComparisonSelect";

type Props = ComponentProps<typeof ExperimentComparisonSelect>;

const latestRun = {
  value: "latest",
  label: "Prompt revision",
  secondaryLabel: "Today",
  badges: ["LATEST"],
  color: "pink",
} satisfies Props["value"][number];

function InteractiveComparisonSelect(args: Props) {
  const [value, setValue] = useState(args.value);
  const [groups, setGroups] = useState(args.groups);
  const [searchQuery, setSearchQuery] = useState(args.searchQuery);
  const query = searchQuery.trim().toLowerCase();

  return (
    <div className="w-96 max-w-full">
      <ExperimentComparisonSelect
        {...args}
        value={value}
        groups={groups
          .map((group) => ({
            ...group,
            expanded: Boolean(query) || group.expanded,
            options: group.options.filter((option) =>
              option.label.toLowerCase().includes(query),
            ),
            onExpandedChange: (expanded: boolean) =>
              setGroups((current) =>
                current.map((entry) =>
                  entry.id === group.id ? { ...entry, expanded } : entry,
                ),
              ),
          }))
          .filter((group) => group.options.length > 0)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onValueChange={setValue}
      />
    </div>
  );
}

const meta = preview.meta({
  component: ExperimentComparisonSelect,
  render: (args) => <InteractiveComparisonSelect {...args} />,
  args: {
    value: [latestRun],
    groups: [
      {
        id: "support",
        label: "Support questions",
        expanded: true,
        onExpandedChange: fn(),
        options: [
          {
            value: "baseline",
            label: "Production baseline",
            badges: ["BASELINE"],
            disabled: true,
          },
          latestRun,
        ],
      },
      {
        id: "billing",
        label: "Billing questions",
        expanded: false,
        onExpandedChange: fn(),
        caption: {
          text: "other dataset",
          description: "Runs on other datasets scored different items.",
        },
        options: [{ value: "billing-run", label: "Billing prompt revision" }],
      },
    ],
    searchQuery: "",
    isLoading: false,
    selectionLimitReached: false,
    onSearchChange: fn(),
    onValueChange: fn(),
  },
});

export const Default = meta.story({});

export const CompareRuns = meta.story({
  name: "(Test) Compare runs",
  args: { value: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Compare" }));
    await userEvent.click(
      await page.findByRole("button", { name: /Billing questions/ }),
    );
    await userEvent.click(
      page.getByRole("option", { name: "Billing prompt revision" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Remove Billing prompt revision" }),
    ).toBeInTheDocument();
  },
});
