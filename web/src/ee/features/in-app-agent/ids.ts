import { createId } from "@paralleldrive/cuid2";

// more descriptive IDs to easier debug & understand
export const createInAppAgentConversationId = () => `aconv_${createId()}`;
export const createInAppAgentRunId = () => `arun_${createId()}`;
export const createInAppAgentMessageId = () => `amsg_${createId()}`;
export const createInAppAgentMessageFeedbackId = () => `afbk_${createId()}`;
