import preview from "../../../../.storybook/preview";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import {
  InAppAgentWindow,
  type InAppAgentWindowProps,
} from "./InAppAgentWindow";

function StatefulInAppAgentWindow(args: InAppAgentWindowProps) {
  const [, updateArgs] = useArgs<InAppAgentWindowProps>();

  return (
    <InAppAgentWindow
      {...args}
      onExpandedChange={(isExpanded) => {
        updateArgs({ isExpanded });
        args.onExpandedChange(isExpanded);
      }}
    />
  );
}

const meta = preview.meta({
  component: InAppAgentWindow,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="flex h-screen w-full items-center justify-center">
        <Story />
      </div>
    ),
  ],
  args: {
    error: null,
    isExpanded: false,
    isRunning: false,
    onClose: fn(),
    onExpandedChange: fn(),
    onSubmit: fn(),
    showCloseButton: true,
  },
  render: StatefulInAppAgentWindow,
});

export const Empty = meta.story({
  args: {
    messages: [],
  },
});

export const Conversation = meta.story({
  args: {
    messages: [
      {
        id: "user-1",
        role: "user",
        content: [
          {
            type: "text",
            text: "Which traces had the highest latency today?",
          },
        ],
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Start by filtering traces by timestamp, then sort by latency. Open the slowest traces to inspect long-running observations.",
          },
        ],
      },
      {
        id: "user-2",
        role: "user",
        content: [
          {
            type: "text",
            text: "Can I compare that with scores?",
          },
        ],
      },
      {
        id: "assistant-2",
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Yes. Add score filters or group the traces by score name to see whether latency correlates with lower quality.",
          },
        ],
      },
    ],
  },
});

export const LoadingResponse = meta.story({
  args: {
    messages: [
      {
        id: "user-1",
        role: "user",
        content: [
          {
            type: "text",
            text: "Summarize recent ingestion errors.",
          },
        ],
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: [
          {
            type: "loading",
          },
        ],
      },
    ],
  },
});

export const Connecting = meta.story({
  args: {
    isRunning: true,
    messages: [
      {
        id: "user-1",
        role: "user",
        content: [
          {
            type: "text",
            text: "Summarize recent ingestion errors.",
          },
        ],
      },
      {
        id: "connecting",
        role: "assistant",
        content: [
          {
            type: "loading",
            label: "Connecting...",
          },
        ],
      },
    ],
  },
});

export const Error = meta.story({
  args: {
    error: "Assistant is not enabled for this user",
    messages: [
      {
        id: "user-1",
        role: "user",
        content: [
          {
            type: "text",
            text: "Help me inspect this trace.",
          },
        ],
      },
    ],
  },
});
