import preview from "@/.storybook/preview";
import { GatewayOverviewSetupLayout } from "./GatewayOverviewSetupLayout";

const meta = preview.meta({
  component: GatewayOverviewSetupLayout,
  // Spans the full page width, as on Overview.
  parameters: { layout: "fullscreen" },
});

/** The guide has its own stories; a placeholder keeps this one about the layout. */
export const Default = meta.story({
  args: {
    providers: [
      { provider: "ANTHROPIC", isConnected: false },
      { provider: "OPENAI", isConnected: false },
    ],
    children: (
      <p className="text-muted-foreground text-sm">Setup guide goes here.</p>
    ),
  },
});
