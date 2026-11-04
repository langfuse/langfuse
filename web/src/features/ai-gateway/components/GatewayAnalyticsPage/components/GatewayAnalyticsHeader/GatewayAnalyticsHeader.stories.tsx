import preview from "@/.storybook/preview";
import { Button } from "@/src/components/design-system/Button/Button";
import { GatewayAnalyticsHeader } from "./GatewayAnalyticsHeader";

const meta = preview.meta({ component: GatewayAnalyticsHeader });

export const AllUsage = meta.story({
  args: {
    children: (
      <div className="flex items-center gap-2">
        <Button variant="secondary" text="User" />
        <Button variant="secondary" text="Gateway key" />
      </div>
    ),
  },
});

export const OwnUsage = meta.story({
  args: {
    description: "Cost and usage of your requests made through the AI Gateway.",
    children: <Button variant="secondary" text="Gateway key" />,
  },
});
