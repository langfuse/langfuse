import { fn } from "storybook/test";
import preview from "../../../../../../../.storybook/preview";
import { EvaluatorVersionHistoryList } from "./EvaluatorVersionHistoryList";
import type { EvaluatorVersion } from "./types";

const version = {
  id: "version-2",
  version: 2,
  createdAt: new Date("2026-07-01"),
  type: "LLM_AS_JUDGE",
  sourceCode: null,
  sourceCodeLanguage: null,
  prompt: "Judge this",
  provider: "openai",
  model: "gpt-4.1-mini",
  outputDefinition: null,
} satisfies EvaluatorVersion;
const meta = preview.meta({ component: EvaluatorVersionHistoryList });
export const WithCurrentVersion = meta.story({
  args: {
    versions: [version, { ...version, id: "version-1", version: 1 }],
    currentVersionId: version.id,
    isLoading: false,
    onSelectVersion: fn(),
  },
});
export const Loading = meta.story({
  args: {
    versions: [],
    currentVersionId: "",
    isLoading: true,
    onSelectVersion: fn(),
  },
});
