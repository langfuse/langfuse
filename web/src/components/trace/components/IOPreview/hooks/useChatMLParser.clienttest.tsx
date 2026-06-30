import { renderHook } from "@testing-library/react";
import type { Prisma } from "@langfuse/shared";
import { describe, expect, it } from "vitest";

import { useChatMLParser } from "./useChatMLParser";

describe("useChatMLParser", () => {
  it("marks tools as called when the call is in input history", () => {
    const input: Prisma.JsonValue = {
      messages: [
        {
          role: "user",
          content: "yo where's my order",
        },
        {
          id: "fc_order_status",
          type: "function_call",
          status: "completed",
          arguments: '{"orderIds":null}',
          call_id: "call_order_status",
          name: "getOrderStatus",
        },
        {
          type: "function_call_output",
          call_id: "call_order_status",
          output: '[{"orderId":"#W001","status":"delivered"}]',
        },
      ],
      tools: [
        {
          type: "function",
          description: "Get order status.",
          name: "getOrderStatus",
          parameters: {
            type: "object",
            properties: {
              orderIds: {
                anyOf: [
                  { type: "array", items: { type: "string" } },
                  { type: "null" },
                ],
              },
            },
          },
        },
      ],
    };

    const { result } = renderHook(() =>
      useChatMLParser(
        input,
        "Your order #W001 has been delivered.",
        undefined,
        "OpenAI.responses",
      ),
    );

    expect(result.current.allTools.map((tool) => tool.name)).toEqual([
      "getOrderStatus",
    ]);
    expect(result.current.toolCallCounts.get("getOrderStatus")).toBe(1);
    expect(result.current.messageToToolCallNumbers.size).toBe(0);
  });
});
