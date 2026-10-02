import { randomUUID } from "node:crypto";

export const createInAppAgentConversationId = () =>
  `aconv_${randomUUID().replaceAll("-", "")}`;
export const createInAppAgentRunId = () =>
  `arun_${randomUUID().replaceAll("-", "")}`;
export const createInAppAgentMessageId = () =>
  `amsg_${randomUUID().replaceAll("-", "")}`;
export const createInAppAgentRoutineId = () =>
  `artn_${randomUUID().replaceAll("-", "")}`;
