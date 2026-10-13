import preview from "../../../../../.storybook/preview";
import { InAppAgentUpdateHighlight } from "./InAppAgentUpdateHighlight";

const meta = preview.meta({
  component: InAppAgentUpdateHighlight,
});

export const Highlighted = meta.story({
  args: {
    updateId: "assistant-update",
    children: (
      <div className="bg-muted rounded-md p-6">
        Evaluator configuration updated
      </div>
    ),
  },
});

export const Idle = meta.story({
  args: {
    updateId: null,
    children: (
      <div className="bg-muted rounded-md p-6">Evaluator configuration</div>
    ),
  },
});
