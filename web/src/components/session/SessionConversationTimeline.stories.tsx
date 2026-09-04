import preview from "../../../.storybook/preview";
import { expect, fn, userEvent, within } from "storybook/test";
import { type ComponentProps } from "react";

import { SessionConversationTimeline } from "@/src/components/session/SessionConversationTimeline";

type TimelineProps = ComponentProps<typeof SessionConversationTimeline>;
type LoadedState = Extract<TimelineProps["state"], { type: "loaded" }>;
type Observation = LoadedState["observations"][number];

const trace = {
  id: "trace-order-support-8f3a2",
  name: "Resolve delivery address request",
  timestamp: new Date("2026-01-01T12:14:03.000Z"),
  environment: "production",
  userId: "customer-48291",
  observationCount: 5,
  latencyMs: 4260,
  scores: [],
} satisfies TimelineProps["trace"];

const observations = [
  {
    id: "generation-1",
    name: "Plan support response",
    type: "GENERATION",
    startTime: new Date("2026-01-01T12:14:03.000Z"),
    input: JSON.stringify([
      {
        role: "system",
        content:
          "You are Acme's customer support agent. Verify order details before making changes. Never promise an address update after an order has shipped.",
      },
      {
        role: "user",
        content:
          "Hi, I just noticed order #LF-20481 is going to my old address. Can you send it to 12 Market Street, San Francisco, CA 94105 instead?",
      },
    ]),
    output: JSON.stringify({
      role: "assistant",
      content: "I'll check whether the order can still be updated.",
      tool_calls: [
        {
          id: "call-order-lookup",
          type: "function",
          function: {
            name: "get_order",
            arguments: '{"orderId":"LF-20481"}',
          },
        },
      ],
    }),
    metadata: { model: "gpt-4.1", region: "us-west-2" },
    latency: 0.81,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
  {
    id: "tool-order-lookup",
    name: "Get order",
    type: "TOOL",
    startTime: new Date("2026-01-01T12:14:03.810Z"),
    input: JSON.stringify({ orderId: "LF-20481" }),
    output: JSON.stringify({
      orderId: "LF-20481",
      status: "processing",
      carrier: "UPS",
      estimatedDelivery: "2026-01-04",
      shippingAddress: {
        line1: "800 Pine Street",
        city: "Seattle",
        state: "WA",
        postalCode: "98101",
      },
    }),
    metadata: { cache: "miss" },
    latency: 0.34,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
  {
    id: "generation-2",
    name: "Decide next action",
    type: "GENERATION",
    startTime: new Date("2026-01-01T12:14:04.150Z"),
    input: JSON.stringify({
      role: "tool",
      tool_call_id: "call-order-lookup",
      content: JSON.stringify({
        orderId: "LF-20481",
        status: "processing",
        addressCanBeChanged: true,
      }),
    }),
    output: JSON.stringify({
      role: "assistant",
      content:
        "The order is still processing, so I can update the delivery address.",
      tool_calls: [
        {
          id: "call-address-update",
          type: "function",
          function: {
            name: "update_shipping_address",
            arguments: JSON.stringify({
              orderId: "LF-20481",
              address: {
                line1: "12 Market Street",
                city: "San Francisco",
                state: "CA",
                postalCode: "94105",
                country: "US",
              },
            }),
          },
        },
      ],
    }),
    metadata: { model: "gpt-4.1", finishReason: "tool_calls" },
    latency: 0.93,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
  {
    id: "tool-address-update",
    name: "Update shipping address",
    type: "TOOL",
    startTime: new Date("2026-01-01T12:14:05.080Z"),
    input: JSON.stringify({
      orderId: "LF-20481",
      address: "12 Market Street, San Francisco, CA 94105",
    }),
    output: JSON.stringify({
      success: true,
      confirmationId: "addr_7b19c2",
      updatedAt: "2026-01-01T12:14:05.410Z",
    }),
    metadata: { service: "order-management" },
    latency: 0.33,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
  {
    id: "generation-3",
    name: "Compose final response",
    type: "GENERATION",
    startTime: new Date("2026-01-01T12:14:05.410Z"),
    input: JSON.stringify({
      role: "tool",
      tool_call_id: "call-address-update",
      content: JSON.stringify({ success: true, confirmationId: "addr_7b19c2" }),
    }),
    output: JSON.stringify({
      role: "assistant",
      content:
        "Your shipping address has been updated to **12 Market Street, San Francisco, CA 94105**.\n\nOrder **#LF-20481** is still expected by **January 4**. You'll receive tracking details by email once it ships.",
    }),
    metadata: { model: "gpt-4.1", finishReason: "stop" },
    latency: 0.85,
    inputTruncated: false,
    outputTruncated: false,
    metadataTruncated: false,
  },
] as unknown as Observation[];

const loadedArgs = {
  trace,
  turnNumber: 1,
  idleGapSeconds: 10 * 60,
  state: {
    type: "loaded",
    observations,
  },
  showSystemPrompt: true,
  onOpenTrace: fn(),
  onOpenObservation: fn(),
} satisfies TimelineProps;

const meta = preview.meta({
  component: SessionConversationTimeline,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
});

export default meta;

export const Loaded = meta.story({ args: loadedArgs });

export const SystemPromptHidden = meta.story({
  args: { ...loadedArgs, showSystemPrompt: false },
});

export const Loading = meta.story({
  args: { ...loadedArgs, state: { type: "loading" } },
});

export const Error = meta.story({
  args: { ...loadedArgs, state: { type: "error" } },
});

export const Empty = meta.story({
  args: {
    ...loadedArgs,
    state: { type: "empty", message: "This trace has no observations." },
  },
});

export const FilteredEmpty = meta.story({
  args: {
    ...loadedArgs,
    state: {
      type: "empty",
      message: "No observation matches the “Generations” view in this trace.",
    },
  },
});

export const TruncatedObservation = meta.story({
  args: {
    ...loadedArgs,
    state: {
      type: "loaded",
      observations: [
        {
          ...observations[0]!,
          input: "First 4,000 characters of the input…",
          output: "First 4,000 characters of the output…",
          inputTruncated: true,
          outputTruncated: true,
        },
      ],
    },
  },
});

export const OpenObservation = meta.story({
  name: "(Test) Opens Observation",
  args: { ...loadedArgs, onOpenObservation: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /Plan support response/i }),
    );
    await expect(args.onOpenObservation).toHaveBeenCalledWith("generation-1");
  },
});

export const ExpandToolObservation = meta.story({
  name: "(Test) Expands Tool Observation Without Moving Header",
  args: loadedArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const header = canvas.getByRole("button", { name: "Get order" });
    const initialTop = header.getBoundingClientRect().top;
    const expandButton = canvas.getByRole("button", {
      name: "Expand Get order",
    });

    await userEvent.click(expandButton);
    await expect(header.getBoundingClientRect().top).toBe(initialTop);

    await userEvent.click(
      canvas.getByRole("button", { name: "Collapse Get order" }),
    );
    await expect(header.getBoundingClientRect().top).toBe(initialTop);
  },
});
