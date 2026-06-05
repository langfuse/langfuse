import preview from "../../../../.storybook/preview";
import { fn } from "storybook/test";
import { InAppAgentDrawer } from "./InAppAgentDrawer";

const conversations = [
  {
    id: "conversation-1",
    title: "Latency outliers",
    updatedAt: new Date("2026-05-19T10:00:00.000Z"),
  },
  {
    id: "conversation-2",
    title: "Score correlation",
    updatedAt: new Date("2026-05-19T09:00:00.000Z"),
  },
];

const meta = preview.meta({
  component: InAppAgentDrawer,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="h-screen w-full">
        <Story />
      </div>
    ),
  ],
  args: {
    error: null,
    isInputDisabled: false,
    conversations,
    hasMoreConversations: false,
    isLoadingMoreConversations: false,
    selectedConversationId: undefined,
    onLoadMoreConversations: fn(),
    onNewConversation: fn(),
    onSelectConversation: fn(),
    onClose: fn(),
    onSubmit: fn(),
    showCloseButton: true,
  },
});

export const Empty = meta.story({
  args: {
    messages: [],
  },
});

export const Conversation = meta.story({
  args: {
    selectedConversationId: "conversation-1",
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
    isInputDisabled: true,
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
