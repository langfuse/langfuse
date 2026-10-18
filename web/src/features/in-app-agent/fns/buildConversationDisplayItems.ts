import {
  IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME,
  type InAppAgentQuestionnaireResult,
} from "@langfuse/shared/in-app-agent";
import type { InAppAgentMessageContent } from "@/src/features/in-app-agent/components/InAppAgentMessage";
import type { InAppAgentWindowMessage } from "@/src/features/in-app-agent/components/InAppAgentWindow";
import type { InAppAgentMessageSource } from "@/src/features/in-app-agent/schema";
import type { InAppAgentToolCallContent } from "@/src/features/in-app-agent/components/utils/utils";
import { parseQuestionnaireToolResult } from "@/src/features/in-app-agent/fns/parseQuestionnaireToolResult";
import { deduplicateBy } from "@/src/utils/arrays";

export type ConversationDisplayItem =
  | {
      type: "user";
      message: InAppAgentWindowMessage;
      hasPreviousMessage: boolean;
    }
  | {
      type: "activity";
      /** Identifies the turn, not its contents: the drawer must survive both
       * the first activity arriving and the run settling without remounting,
       * or an expanded drawer collapses under the user. */
      key: string;
      messages: InAppAgentWindowMessage[];
      startTimestamp?: number;
      endTimestamp?: number;
      followsUser: boolean;
      isInProgress: boolean;
    }
  | {
      type: "assistant";
      message: InAppAgentWindowMessage;
      followsUser: boolean;
      isFinalAnswer: boolean;
    }
  | {
      type: "questionnaire";
      key: string;
      answers: InAppAgentQuestionnaireResult["answers"];
    };

type QuestionnaireDisplayItem = Extract<
  ConversationDisplayItem,
  { type: "questionnaire" }
>;

type InAppAgentTextMessage = InAppAgentWindowMessage & {
  content: Extract<InAppAgentMessageContent, { type: "text" }>;
};

type InAppAgentRedirectActionContent = Extract<
  InAppAgentMessageContent,
  { type: "redirectAction" }
>;

/**
 * Group the transcript into what the window renders: user bubbles, a drawer of
 * work per assistant turn, the turn's answer, and the summary of each answered
 * questionnaire. A questionnaire hands the turn to the user, so it ends the
 * turn before it.
 */
export function buildConversationDisplayItems(
  messages: InAppAgentWindowMessage[],
  isRunUnsettled: boolean,
): ConversationDisplayItem[] {
  const items: ConversationDisplayItem[] = [];
  // The drawer speaks for a turn that has produced nothing yet, so a loading
  // placeholder does not belong in the transcript.
  const visibleMessages = messages.flatMap((message) =>
    message.content.type === "loading"
      ? []
      : splitToolGroupAtQuestionnaires(message),
  );

  for (let index = 0; index < visibleMessages.length; ) {
    const message = visibleMessages[index];
    if (!message) {
      break;
    }

    if (message.role === "user") {
      items.push({
        type: "user",
        message,
        hasPreviousMessage: index > 0,
      });
      index++;
      continue;
    }

    if (getQuestionnaireBoundaryTool(message)) {
      const questionnaireItem = toQuestionnaireItem(message);
      if (questionnaireItem) {
        items.push(questionnaireItem);
      }
      index++;
      continue;
    }

    const turnStartIndex = index;
    while (
      index < visibleMessages.length &&
      visibleMessages[index]?.role === "assistant" &&
      !getQuestionnaireBoundaryTool(visibleMessages[index])
    ) {
      index++;
    }

    const turnMessages = visibleMessages.slice(turnStartIndex, index);
    const endsAtQuestionnaire = Boolean(
      getQuestionnaireBoundaryTool(visibleMessages[index]),
    );
    const isInProgress = isRunUnsettled && index === visibleMessages.length;
    const lastReasoningIndex = turnMessages.findLastIndex(
      (turnMessage) => turnMessage.content.type === "reasoning",
    );
    // Trailing text is the answer; text before the turn's last thought is still
    // work. A proposed redirect is always actionable, so it never stays behind
    // in the drawer. Declared once, with the activity bucket as its exact
    // complement, so no message can fall out of both.
    const isAnswerPart = (
      turnMessage: InAppAgentWindowMessage,
      turnIndex: number,
    ) =>
      !isInProgress &&
      (turnMessage.content.type === "redirectAction" ||
        (turnMessage.content.type === "text" &&
          turnIndex > lastReasoningIndex));
    const answerMessages = turnMessages.filter(isAnswerPart);
    const activityMessages = turnMessages.filter(
      (turnMessage, turnIndex) => !isAnswerPart(turnMessage, turnIndex),
    );
    const turnSources = deduplicateBy(
      turnMessages.flatMap((turnMessage) =>
        turnMessage.content.type === "text"
          ? (turnMessage.content.sources ?? [])
          : [],
      ),
      (source) => source.url,
    );
    // A proposed redirect belongs to the turn, not to whichever block carried
    // it: the tool result is merged into a preceding text message when there is
    // one and emitted standalone when there is not, and either can land in the
    // drawer.
    const turnRedirectAction = turnMessages.reduce<
      InAppAgentRedirectActionContent | undefined
    >(
      (found, turnMessage) => getRedirectAction(turnMessage) ?? found,
      undefined,
    );
    const joinedAnswer = joinAnswerMessages(
      answerMessages,
      turnSources,
      turnRedirectAction,
    );
    const precedingMessage = visibleMessages[turnStartIndex - 1];
    const followsUser =
      precedingMessage?.role === "user" ||
      Boolean(getQuestionnaireBoundaryTool(precedingMessage));

    if (activityMessages.length > 0) {
      items.push({
        type: "activity",
        key: getActivityKey(
          followsUser ? precedingMessage?.id : turnMessages[0]?.id,
        ),
        messages: activityMessages,
        startTimestamp: turnMessages.find(
          (turnMessage) => turnMessage.timestamp !== undefined,
        )?.timestamp,
        endTimestamp:
          joinedAnswer?.timestamp ?? activityMessages.at(-1)?.timestamp,
        followsUser,
        isInProgress,
      });
    }

    if (joinedAnswer) {
      items.push({
        type: "assistant",
        message: joinedAnswer,
        followsUser: activityMessages.length === 0 && followsUser,
        isFinalAnswer: !isInProgress && !endsAtQuestionnaire,
      });
    }
  }

  const lastItem = items.at(-1);
  if (
    isRunUnsettled &&
    (lastItem?.type === "user" || lastItem?.type === "questionnaire")
  ) {
    // Same key the turn will claim once its first message lands, so the caret
    // the user may already have opened is not torn down underneath them.
    items.push({
      type: "activity",
      key: getActivityKey(
        lastItem.type === "user" ? lastItem.message.id : lastItem.key,
      ),
      messages: [],
      followsUser: true,
      isInProgress: true,
    });
  }

  return items;
}

/**
 * A tool call awaiting approval is hoisted into its own card above the
 * composer, so it leaves the transcript. A questionnaire gets a message of its
 * own, splitting the tools around it into separate groups.
 */
function splitToolGroupAtQuestionnaires(
  message: InAppAgentWindowMessage,
): InAppAgentWindowMessage[] {
  if (message.content.type !== "toolGroup") {
    return [message];
  }

  const splitMessages: InAppAgentWindowMessage[] = [];
  let pendingTools: InAppAgentToolCallContent[] = [];
  const flushPendingTools = () => {
    if (pendingTools.length === 0) {
      return;
    }
    splitMessages.push({
      ...message,
      id:
        splitMessages.length === 0
          ? message.id
          : `${message.id}-tools-${splitMessages.length}`,
      content: { type: "toolGroup", tools: pendingTools },
    });
    pendingTools = [];
  };

  message.content.tools.forEach((tool, toolIndex) => {
    if (isQuestionnaireBoundaryTool(tool)) {
      flushPendingTools();
      splitMessages.push({
        ...message,
        id: `${message.id}-questionnaire-${toolIndex}`,
        content: { type: "toolGroup", tools: [tool] },
      });
    } else if (!tool.approval) {
      pendingTools.push(tool);
    }
  });
  flushPendingTools();

  return splitMessages;
}

/** A pending questionnaire is answered in its hoisted card, not here. */
function toQuestionnaireItem(
  message: InAppAgentWindowMessage,
): QuestionnaireDisplayItem | null {
  const questionnaireResult = parseQuestionnaireToolResult(
    getQuestionnaireBoundaryTool(message)?.result,
  );

  return questionnaireResult
    ? {
        type: "questionnaire",
        key: message.id,
        answers: questionnaireResult.answers,
      }
    : null;
}

function getRedirectAction(
  message: InAppAgentWindowMessage,
): InAppAgentRedirectActionContent | undefined {
  if (message.content.type === "redirectAction") {
    return message.content;
  }

  return message.content.type === "text"
    ? message.content.redirectAction
    : undefined;
}

/**
 * Fold a turn's answer blocks into the single bubble the user reads. Each field
 * takes the last block that defined it, except `sources`, which arrive already
 * unioned across the whole turn so a citation earned mid-turn is not lost.
 */
function joinAnswerMessages(
  messages: InAppAgentWindowMessage[],
  turnSources: InAppAgentMessageSource[],
  turnRedirectAction: InAppAgentRedirectActionContent | undefined,
): InAppAgentWindowMessage | null {
  const textMessages = messages.filter(
    (message): message is InAppAgentTextMessage =>
      message.content.type === "text",
  );
  const lastText = textMessages.at(-1);

  // A turn can end on a bare redirect with no text to attach it to.
  if (!lastText) {
    return messages.at(-1) ?? null;
  }

  const lastDefined = <T>(
    pick: (message: InAppAgentTextMessage) => T | undefined,
  ): T | undefined =>
    textMessages.reduce<T | undefined>(
      (found, message) => pick(message) ?? found,
      undefined,
    );
  const runId = lastDefined((message) => message.runId);
  const feedbackMessageId = lastDefined((message) => message.feedbackMessageId);
  const feedback = lastDefined((message) => message.content.feedback);

  return {
    ...lastText,
    ...(runId ? { runId } : {}),
    ...(feedbackMessageId ? { feedbackMessageId } : {}),
    content: {
      type: "text",
      text: textMessages.map((message) => message.content.text).join("\n\n"),
      ...(textMessages.some((message) => message.content.isStreaming)
        ? { isStreaming: true }
        : {}),
      ...(turnSources.length > 0 ? { sources: turnSources } : {}),
      ...(feedback ? { feedback } : {}),
      ...(turnRedirectAction ? { redirectAction: turnRedirectAction } : {}),
    },
  };
}

function isQuestionnaireBoundaryTool(tool: InAppAgentToolCallContent) {
  return (
    tool.name === IN_APP_AGENT_QUESTIONNAIRE_TOOL_NAME &&
    (tool.approval !== undefined ||
      parseQuestionnaireToolResult(tool.result) !== null)
  );
}

function getQuestionnaireBoundaryTool(
  message: InAppAgentWindowMessage | undefined,
) {
  if (message?.content.type !== "toolGroup") {
    return undefined;
  }

  const [tool, ...otherTools] = message.content.tools;
  if (!tool || otherTools.length > 0 || !isQuestionnaireBoundaryTool(tool)) {
    return undefined;
  }

  return tool;
}

function getActivityKey(turnAnchorMessageId: string | undefined) {
  return `activity-${turnAnchorMessageId ?? "start"}`;
}
