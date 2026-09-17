import type { TranscriptFixture } from "../fixture-types";
import { supportCopilotRefundLoopFixture } from "../trace/support-copilot-refund-loop";

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

export const supportCopilotFollowUpFixture = {
  name: "support copilot follow-up replays history across two traces",
  scope: "session",
  description:
    "Two complete refund workflows share a conversation. The second trace replays the first trace's final history in every generation; repeated history retains its first attribution, and new calls/results retain the second trace's IDs.",
  observations: [...firstTrace.observations, ...followUpObservations],
  expected: {
    threads: [
      {
        observations: [
          ...firstThread.observations,
          ...followUpCopy(firstThread.observations),
        ],
        messages: [
          ...firstThread.messages,
          ...followUpCopy(
            firstThread.messages.filter((message) => message.role !== "system"),
          ),
        ],
      },
    ],
  },
} satisfies TranscriptFixture;
