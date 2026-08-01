import { fn } from "storybook/test";
import preview from "../../../../../../../.storybook/preview";
import { EvaluatorVersionHistorySheet } from "./EvaluatorVersionHistorySheet";
import type { EvaluatorVersion } from "./types";

const version = {
  id: "version-2",
  version: 2,
  createdAt: new Date("2026-07-01"),
  type: "LLM_AS_JUDGE",
  sourceCode: null,
  sourceCodeLanguage: null,
  prompt: "Judge this response.",
  provider: "openai",
  model: "gpt-4.1-mini",
  outputDefinition: null,
} satisfies EvaluatorVersion;

const meta = preview.meta({ component: EvaluatorVersionHistorySheet });

const defaultArgs = {
  open: true,
  onOpenChange: fn(),
  evaluatorName: "Answer quality",
  versions: [version, { ...version, id: "version-1", version: 1 }],
  currentVersionId: version.id,
  selectedVersion: undefined,
  selectedVersionModelLabel: "GPT-4.1 mini",
  selectedVersionUsesProjectDefaultModel: false,
  isLoading: false,
  onSelectVersion: fn(),
  onBack: fn(),
};

export const VersionList = meta.story({
  args: defaultArgs,
});

export const SelectedVersion = meta.story({
  args: {
    ...defaultArgs,
    selectedVersion: version,
  },
});
