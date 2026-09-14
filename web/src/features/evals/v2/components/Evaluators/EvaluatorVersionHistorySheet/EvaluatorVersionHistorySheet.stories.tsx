import { fn } from "storybook/test";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import preview from "../../../../../../../.storybook/preview";
import { EvaluatorVersionHistorySheet } from "./EvaluatorVersionHistorySheet";
import type { EvaluatorVersion } from "./types";

const version = {
  id: "version-2",
  version: 2,
  createdAt: new Date("2026-07-01"),
  type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
  sourceCode: null,
  sourceCodeLanguage: null,
  promptMessages: [{ role: "user" as const, content: "Judge this response." }],
  provider: "openai",
  model: "gpt-4.1-mini",
  modelParams: null,
  vars: [],
  variableMapping: null,
  outputDefinition: null,
  createdByUser: { name: "Ada Lovelace", email: "ada@example.com" },
} satisfies EvaluatorVersion;

const meta = preview.meta({ component: EvaluatorVersionHistorySheet });

const defaultArgs = {
  open: true,
  onOpenChange: fn(),
  evaluatorName: "Answer quality",
  versions: [version, { ...version, id: "version-1", version: 1 }],
  currentVersionId: version.id,
  defaultModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
  onVersionExpansionChange: fn(),
  onRestoreVersion: fn(),
  isLoading: false,
  hasMore: false,
  isLoadingMore: false,
  onLoadMore: fn(),
};

export const VersionList = meta.story({
  args: defaultArgs,
});

export const ExpandedVersion = meta.story({
  args: { ...defaultArgs, defaultExpandedVersionId: version.id },
});
