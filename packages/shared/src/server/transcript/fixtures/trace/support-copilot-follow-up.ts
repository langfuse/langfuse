import type { NormalizedMessage } from "../../../../utils/normalized-io";
import type { TranscriptFixture } from "../fixture-types";
import {
  charges,
  classification,
  copilotSystemPrompt,
  createRefundArguments,
  createRefundToolCallId,
  customerMessage,
  finalReply,
  findChargesArguments,
  findChargesToolCallId,
  refund,
  supportCopilotRefundLoopFixture,
} from "./support-copilot-refund-loop";

const firstTrace = supportCopilotRefundLoopFixture;
const firstThread = firstTrace.expected.threads[0];
const draft = firstTrace.observations.find((observation) =>
  observation.id.endsWith("-drf"),
)!;
const completedHistory = [
  ...JSON.parse(draft.input!).messages,
  JSON.parse(draft.output!),
];

// Repeat the same workflow for another charge, with distinct trace/call IDs.
function followUpCopy<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value)
      .replaceAll("sa2026083102o", "sa2026083102p")
      .replaceAll("call_find_2", "call_find_3")
      .replaceAll("call_act_2", "call_act_3")
      .replaceAll("ch_3PqK", "ch_4PqK")
      .replaceAll("re_18Lk1Q", "re_28Lk1Q")
      .replaceAll("inv_20260709", "inv_20260809")
      .replaceAll(
        "Hi — I was charged twice",
        "Thanks for resolving that. I was also charged twice",
      )
      .replaceAll("2026-07", "2026-08")
      .replaceAll("2026-08-31T12:33:", "2026-08-31T12:35:"),
  );
}

const followUpObservations = firstTrace.observations.map((original) => {
  const observation = followUpCopy(original);
  // Both traces belong to the same project.
  observation.project_id = original.project_id;
  if (observation.type === "GENERATION") {
    const input = JSON.parse(observation.input!);
    observation.input = JSON.stringify({
      ...input,
      messages: [
        ...completedHistory,
        ...input.messages.filter(
          (message: { role: string }) => message.role !== "system",
        ),
      ],
    });
  }
  return observation;
});

/** The first conversation as every generation of the second trace receives it. */
const replayedHistory: NormalizedMessage[] = [
  {
    role: "system",
    source: "input",
    parts: [{ type: "text", text: copilotSystemPrompt }],
  },
  {
    role: "user",
    source: "input",
    parts: [{ type: "text", text: customerMessage }],
  },
  {
    role: "assistant",
    source: "input",
    parts: [{ type: "text", text: classification.content }],
  },
  {
    role: "assistant",
    source: "input",
    parts: [
      {
        type: "tool-call",
        toolCallId: findChargesToolCallId,
        toolName: "stripe_find_charges",
        input: findChargesArguments,
        toolType: "function",
      },
    ],
  },
  {
    role: "tool",
    source: "input",
    parts: [
      {
        type: "tool-result",
        toolCallId: findChargesToolCallId,
        output: charges,
      },
    ],
  },
  {
    role: "assistant",
    source: "input",
    parts: [
      {
        type: "tool-call",
        toolCallId: createRefundToolCallId,
        toolName: "stripe_create_refund",
        input: createRefundArguments,
        toolType: "function",
      },
    ],
  },
  {
    role: "tool",
    source: "input",
    parts: [
      {
        type: "tool-result",
        toolCallId: createRefundToolCallId,
        output: refund,
      },
    ],
  },
  {
    role: "assistant",
    source: "input",
    parts: [{ type: "text", text: "Resolution complete." }],
  },
  {
    role: "user",
    source: "input",
    parts: [{ type: "text", text: "Draft the reply." }],
  },
  {
    role: "assistant",
    source: "input",
    parts: [{ type: "text", text: finalReply }],
  },
];

export const supportCopilotFollowUpFixture = {
  name: "support copilot follow-up inherits the first workflow as history",
  description:
    "A second refund workflow whose generations replay the first trace's final history before the new customer message. That replay becomes the conversation history; the current turn holds only this trace's workflow with its own IDs.",
  observations: followUpObservations,
  expected: {
    threads: [
      {
        conversationHistory: replayedHistory,
        currentTurn: {
          messages: followUpCopy(
            firstThread.currentTurn.messages.filter(
              (message) => message.role !== "system",
            ),
          ),
          observations: followUpCopy(firstThread.currentTurn.observations),
        },
      },
    ],
  },
} satisfies TranscriptFixture;
