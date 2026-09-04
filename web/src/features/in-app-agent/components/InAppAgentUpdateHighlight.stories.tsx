import preview from "../../../../.storybook/preview";
import { InAppAgentUpdateHighlight } from "./InAppAgentUpdateHighlight";

const meta = preview.meta({ component: InAppAgentUpdateHighlight });

export const Highlighted = meta.story({
  args: {
    updateId: "assistant-update",
    children: (
      <div className="rounded-md border p-4">
        Content updated by the Assistant
      </div>
    ),
  },
});
