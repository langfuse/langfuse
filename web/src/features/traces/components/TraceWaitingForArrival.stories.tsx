import preview from "../../../../.storybook/preview";
import { TraceWaitingForArrival } from "./TraceWaitingForArrival";

const meta = preview.meta({
  component: TraceWaitingForArrival,
  parameters: {
    layout: "fullscreen",
  },
  render: () => (
    <div className="h-screen">
      <TraceWaitingForArrival />
    </div>
  ),
});

export const Default = meta.story({});
