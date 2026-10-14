import { fn } from "storybook/test";
import { Plug } from "lucide-react";

import preview from "../../../../../.storybook/preview";
import { LlmConnectionEmptyState } from "@/src/features/public-api/components/LlmConnectionEmptyState/LlmConnectionEmptyState";
import {
  LLMApiKeySettingsTable,
  type LLMApiKeySettingsTableRow,
} from "./LLMApiKeySettingsTable";

const meta = preview.meta({ component: LLMApiKeySettingsTable });

export const Default = meta.story({
  args: {
    createAction: {
      hasAccess: true,
      label: "Project Connection",
      onClick: fn(),
    },
    deleteAction: { hasAccess: true, onClick: fn() },
    updateAction: { hasAccess: true, onClick: fn() },
    emptyState: (
      <LlmConnectionEmptyState
        icon={Plug}
        title="No project connections"
        description="Project connections are only available in llm-app and take precedence over organization connections with the same provider."
      />
    ),
    data: {
      status: "success",
      data: [
        {
          id: "connection-1",
          projectId: "project-1",
          createdAt: new Date("2026-09-01"),
          updatedAt: new Date("2026-09-01"),
          provider: "OpenAI",
          adapter: "openai" as LLMApiKeySettingsTableRow["adapter"],
          baseURL: null,
          displaySecretKey: "sk-...test",
          customModels: [],
          withDefaultModels: true,
          extraHeaderKeys: [],
          config: null,
          secretKey: undefined,
          extraHeaders: undefined,
          authMethod: undefined,
        },
        {
          id: "connection-2",
          projectId: "project-1",
          createdAt: new Date("2026-09-02"),
          updatedAt: new Date("2026-09-02"),
          provider: "Azure OpenAI",
          adapter: "openai" as LLMApiKeySettingsTableRow["adapter"],
          baseURL: "https://example.openai.azure.com",
          displaySecretKey: "••••••••",
          customModels: [],
          withDefaultModels: true,
          extraHeaderKeys: ["api-version"],
          config: null,
          secretKey: undefined,
          extraHeaders: undefined,
          authMethod: undefined,
        },
      ],
    },
  },
});

export const Empty = meta.story({
  args: {
    ...Default.input.args,
    data: { status: "success", data: [] },
  },
});

export const Loading = meta.story({
  args: {
    ...Default.input.args,
    data: { status: "loading" },
    loadingRowCount: 5,
  },
});
