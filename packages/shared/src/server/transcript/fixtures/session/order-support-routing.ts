import type { TranscriptFixture } from "../fixture-types";

/**
 * Synthetic reconstruction: IDs, timestamps, names and payloads are placeholders.
 * Each trace has this hierarchy (optional children noted):
 * [SPAN] Support assistant — user/assistant text
 *   [SPAN] Gather context
 *   [SPAN] Respond to request
 *     [SPAN] Escalation classification
 *       [GENERATION] Classify escalation — system/user → structured classification
 *     [GENERATION] Analyze (trace 1 only; I/O unknown)
 *     [SPAN] Check incident
 *     [GENERATION] Select workflow (trace 1 only) — user/system → tool call
 *     [SPAN] Run order workflow
 *       [GENERATION] Manage customer order (trace 1) — system/user → tool call
 *       [GENERATION] Clarify issue (trace 3) — system/user → text
 * All non-root spans intentionally have undefined I/O.
 */

type Seed = TranscriptFixture["observations"][number];

function observation(
  turn: number,
  id: string,
  parent: string | null,
  name: string,
  offset: number,
  details: Partial<Seed> = {},
): Seed {
  return {
    project_id: "transcript-fixture-project",
    trace_id: `order-support-trace-${turn}`,
    id: `order-support-${turn}-${id}`,
    parent_observation_id: parent ? `order-support-${turn}-${parent}` : null,
    type: "SPAN",
    name,
    start_time: new Date(Date.UTC(2026, 0, 1, 12, turn, offset)).toISOString(),
    end_time: new Date(Date.UTC(2026, 0, 1, 12, turn, 20)).toISOString(),
    input: undefined,
    output: undefined,
    ...details,
  };
}

const classification = {
  role: "assistant",
  tool_calls: [],
  content: { classification: "NO_ESCALATION_REQUIRED" },
};
const conversation =
  "USER: Issue with my order --- ASSISTANT: Select the order you need help with: --- ASSISTANT: User is shown the following orders to pick from: .... --- USER: Item 123.";

function baseTrace(turn: number, userContent: unknown): Seed[] {
  return [
    observation(turn, "root", null, "Support assistant", 0, {
      input: "user text",
      output: "assistant text",
    }),
    observation(turn, "context", "root", "Gather context", 1),
    observation(turn, "respond", "root", "Respond to request", 2),
    observation(turn, "escalation", "respond", "Escalation classification", 3),
    observation(turn, "classify", "escalation", "Classify escalation", 4, {
      type: "GENERATION",
      input: JSON.stringify([
        { role: "system", content: "instruction 1" },
        { role: "user", content: userContent },
      ]),
      output: JSON.stringify(classification),
    }),
  ];
}

export const orderSupportRoutingFixture = {
  name: "Order support routing across three session traces",
  scope: "session",
  description:
    "Synthetic three-turn session with classification, workflow selection and tool calls. Later classifiers embed conversation history in a structured user message rather than replaying message arrays. Root text is on spans, one generation has unknown I/O, and separate generations use different system instructions; transcript expectations remain open.",
  observations: [
    ...baseTrace(1, "question"),
    observation(1, "analyze", "respond", "Analyze utterance", 5, {
      type: "GENERATION",
    }),
    observation(1, "incident", "respond", "Check incident", 6),
    observation(1, "select", "respond", "Select workflow", 7, {
      type: "GENERATION",
      input: JSON.stringify({
        messages: [
          { role: "user", content: "question" },
          { role: "system", content: "instruction 2" },
        ],
        tools: [
          {
            type: "function",
            function: {
              parameters: {},
              strict: false,
              description: "Tool to manage customer order",
              name: "manage_customer_order",
            },
          },
          {
            type: "function",
            function: {
              parameters: {},
              strict: false,
              description:
                "Default tool provided out of the box. Use it if specialized tools are less applicable or unavailable.",
              name: "answer_generation",
            },
          },
        ],
      }),
      output: JSON.stringify({
        role: "assistant",
        tool_calls: [
          {
            id: "call_1234567890",
            type: "function",
            function: { name: "manage_customer_order", arguments: {} },
          },
        ],
        content: "",
      }),
    }),
    observation(1, "workflow", "respond", "Run order workflow", 8),
    observation(1, "manage", "workflow", "Manage customer order", 9, {
      type: "GENERATION",
      input: JSON.stringify({
        messages: [
          { role: "system", content: "Instructions 3" },
          { role: "user", content: "Issue with my order" },
        ],
        tools: [
          {
            type: "function",
            function: {
              parameters: {
                type: "object",
                required: [],
                additionalProperties: false,
                properties: {},
              },
              strict: true,
              description: "Retrieves a list of orders for the current user",
              name: "findUserOrders",
            },
          },
          {
            type: "function",
            function: {
              parameters: {
                type: "object",
                required: ["orderId"],
                additionalProperties: false,
                properties: {
                  orderId: {
                    description: "The ID of the order to select",
                    type: "string",
                  },
                },
              },
              strict: true,
              description: "Selects an order from data store.",
              name: "selectUserOrder",
            },
          },
          {
            type: "function",
            function: {
              parameters: {
                type: "object",
                required: [],
                additionalProperties: false,
                properties: {},
              },
              strict: true,
              description: "Answer the user's question",
              name: "answerTool",
            },
          },
        ],
      }),
      output: JSON.stringify({
        role: "assistant",
        tool_calls: [
          {
            id: "call_0987654321",
            type: "function",
            function: { name: "findUserOrders", arguments: {} },
          },
        ],
        content: "",
      }),
    }),
    ...baseTrace(2, { conversation }),
    observation(2, "incident", "respond", "Check incident", 6),
    observation(2, "workflow", "respond", "Run order workflow", 8),
    ...baseTrace(3, {
      conversation: `${conversation} --- ASSISTANT: Great, I can help with that. Please explain what assistance you need. --- USER: No more, thank you.`,
    }),
    observation(3, "incident", "respond", "Check incident", 6),
    observation(3, "workflow", "respond", "Run order workflow", 8),
    observation(3, "clarify", "workflow", "Clarify issue", 9, {
      type: "GENERATION",
      input: JSON.stringify([
        { role: "system", content: "instruction 4" },
        { role: "user", content: "No more, thank you." },
      ]),
      output: JSON.stringify({
        role: "assistant",
        tool_calls: [],
        content: "false-positives",
      }),
    }),
  ],
  // Opaque conversation strings do not replay structured message history.
  // Keep this example for reference; transcript expectations are deferred.
  expected: null,
} satisfies TranscriptFixture;
