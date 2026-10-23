import { IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME } from "@langfuse/shared/in-app-agent";
import type { InAppAgentWindowMessage } from "@/src/features/in-app-agent/components/InAppAgentWindow";
import type { InAppAgentToolCallContent } from "@/src/features/in-app-agent/components/utils/utils";
import {
  buildConversationDisplayItems,
  type ConversationDisplayItem,
} from "./buildConversationDisplayItems";

const userMessage: InAppAgentWindowMessage = {
  id: "user-1",
  role: "user",
  content: { type: "text", text: "Set up an evaluator." },
};

const introMessage: InAppAgentWindowMessage = {
  id: "assistant-intro",
  role: "assistant",
  content: { type: "text", text: "A few quick questions before I set it up." },
};

const answerMessage: InAppAgentWindowMessage = {
  id: "assistant-answer",
  role: "assistant",
  content: { type: "text", text: "The evaluator runs on staging." },
};

const searchTool: InAppAgentToolCallContent = {
  type: "tool",
  name: "langfuse_searchDocs",
  status: "succeeded",
  args: "{}",
  result: "[]",
};

const answers = [
  { question: "Which environment?", answer: ["Staging"], skipped: false },
];

function questionnaireTool(
  state: Pick<InAppAgentToolCallContent, "status" | "approval" | "result">,
): InAppAgentToolCallContent {
  return {
    type: "tool",
    name: IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME,
    args: "{}",
    ...state,
  };
}

function toolGroupMessage(
  id: string,
  tools: InAppAgentToolCallContent[],
): InAppAgentWindowMessage {
  return { id, role: "assistant", content: { type: "toolGroup", tools } };
}

const answeredQuestionnaire = questionnaireTool({
  status: "succeeded",
  result: JSON.stringify({ type: "questionnaireAnswers", answers }),
});

/** The shape of the transcript, without the message payloads. */
function outline(items: ConversationDisplayItem[]) {
  return items.map((item) => {
    if (item.type === "user") {
      return `user ${item.message.id}`;
    }
    if (item.type === "activity") {
      return `activity ${item.key} [${item.messages.map((message) => message.id).join(", ")}]`;
    }
    if (item.type === "assistant") {
      return `${item.isFinalAnswer ? "answer" : "assistant"} ${item.message.id}`;
    }
    return `questionnaire ${item.key}`;
  });
}

describe("buildConversationDisplayItems", () => {
  it.each([
    ["pending", { id: "approval-1", status: "pending" }],
    ["submitting", { id: "approval-1", status: "submitting" }],
  ] as const)(
    "ends the turn at a %s questionnaire so its intro is not hidden in the drawer",
    (_, approval) => {
      const items = buildConversationDisplayItems(
        [
          userMessage,
          introMessage,
          toolGroupMessage("assistant-questionnaire", [
            questionnaireTool({ status: "running", approval }),
          ]),
        ],
        true,
      );

      expect(outline(items)).toEqual([
        "user user-1",
        "assistant assistant-intro",
      ]);
    },
  );

  it("places an answered questionnaire between the text around it", () => {
    const items = buildConversationDisplayItems(
      [
        userMessage,
        introMessage,
        toolGroupMessage("assistant-questionnaire", [answeredQuestionnaire]),
        answerMessage,
      ],
      false,
    );

    expect(outline(items)).toEqual([
      "user user-1",
      "assistant assistant-intro",
      "questionnaire assistant-questionnaire-questionnaire-0",
      "answer assistant-answer",
    ]);
    expect(items[2]).toEqual({
      type: "questionnaire",
      key: "assistant-questionnaire-questionnaire-0",
      answers,
    });
  });

  it("splits the tools around a questionnaire into the turns on either side", () => {
    const items = buildConversationDisplayItems(
      [
        userMessage,
        toolGroupMessage("assistant-tools", [
          searchTool,
          answeredQuestionnaire,
          { ...searchTool, name: "langfuse_listEvaluators" },
        ]),
        answerMessage,
      ],
      false,
    );

    expect(outline(items)).toEqual([
      "user user-1",
      "activity activity-user-1 [assistant-tools]",
      "questionnaire assistant-tools-questionnaire-1",
      "activity activity-assistant-tools-questionnaire-1 [assistant-tools-tools-2]",
      "answer assistant-answer",
    ]);
  });

  it("waits in a drawer keyed to the questionnaire until the next turn starts", () => {
    const items = buildConversationDisplayItems(
      [
        userMessage,
        introMessage,
        toolGroupMessage("assistant-questionnaire", [answeredQuestionnaire]),
      ],
      true,
    );

    expect(items.at(-1)).toEqual({
      type: "activity",
      key: "activity-assistant-questionnaire-questionnaire-0",
      messages: [],
      followsUser: true,
      isInProgress: true,
    });
  });
});
