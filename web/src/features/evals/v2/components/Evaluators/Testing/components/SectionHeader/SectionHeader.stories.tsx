import preview from "../../../../../../../../../.storybook/preview";
import { Button } from "@/src/components/ui/button";
import { SectionHeader } from "./SectionHeader";

const meta = preview.meta({ component: SectionHeader });

export const Default = meta.story({
  args: {
    title: "Filter observations",
    meta: null,
    description:
      "Narrow the observations to representative test data for this evaluator.",
    tooltip: "Filters only affect which observations are available as samples.",
    trailing: null,
  },
});

export const WithTrailingControl = meta.story({
  args: {
    title: "Matching observations",
    meta: <span className="text-muted-foreground text-sm">(12.25k)</span>,
    description:
      "Select an observation to test and verify the variable mapping.",
    tooltip: "Observations matching the current filters and time range.",
    trailing: (
      <Button type="button" variant="outline" size="icon-xs">
        …
      </Button>
    ),
  },
});
