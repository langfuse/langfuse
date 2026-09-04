import { useState } from "react";
import { fn } from "storybook/test";
import { EvalTemplateTypeEnum } from "@langfuse/shared";

import preview from "../../../../../../../../../.storybook/preview";
import { EvaluatorVersionHistoryList } from "./EvaluatorVersionHistoryList";
import type { EvaluatorVersion } from "../../types";

const version = {
  id: "version-2",
  version: 2,
  createdAt: new Date("2026-07-01"),
  type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
  sourceCode: null,
  sourceCodeLanguage: null,
  promptMessages: [
    {
      role: "user" as const,
      content: "Judge whether the response answers {{query}}.",
    },
  ],
  provider: "openai",
  model: "gpt-4.1-mini",
  modelParams: null,
  vars: [],
  variableMapping: null,
  outputDefinition: null,
  createdByUser: { name: "Ada Lovelace", email: "ada@example.com" },
} satisfies EvaluatorVersion;

const versions = [
  version,
  {
    ...version,
    id: "version-1",
    version: 1,
    createdByUser: { name: null, email: "grace@example.com" },
  },
];

const meta = preview.meta({ component: EvaluatorVersionHistoryList });

type Props = Parameters<typeof EvaluatorVersionHistoryList>[0];

function StatefulVersionList(args: Props) {
  const [expandedVersionId, setExpandedVersionId] = useState(
    args.expandedVersionId,
  );

  return (
    <EvaluatorVersionHistoryList
      {...args}
      expandedVersionId={expandedVersionId}
      onExpandedVersionChange={setExpandedVersionId}
    />
  );
}

const defaultArgs = {
  versions,
  currentVersionId: version.id,
  defaultModel: { provider: "OpenAI", model: "gpt-4.1-mini" },
  expandedVersionId: null,
  onExpandedVersionChange: fn(),
  onRestoreVersion: fn(),
  isLoading: false,
};

export const Collapsed = meta.story({
  args: defaultArgs,
  render: StatefulVersionList,
});

export const ExpandedVersion = meta.story({
  args: { ...defaultArgs, expandedVersionId: version.id },
  render: StatefulVersionList,
});

export const CodeVersion = meta.story({
  args: {
    ...defaultArgs,
    versions: [
      {
        ...version,
        type: EvalTemplateTypeEnum.CODE,
        promptMessages: null,
        sourceCode: "function evaluate(ctx) {\n  return { scores: [] };\n}",
        sourceCodeLanguage: "TYPESCRIPT" as const,
      },
    ],
    expandedVersionId: version.id,
  },
  render: StatefulVersionList,
});

export const Empty = meta.story({
  args: { ...defaultArgs, versions: [], currentVersionId: "" },
});

export const Loading = meta.story({
  args: { ...defaultArgs, versions: [], isLoading: true },
});
