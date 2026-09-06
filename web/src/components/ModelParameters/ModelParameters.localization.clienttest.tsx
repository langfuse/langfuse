import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ReactNode } from "react";
import { type UIModelParams } from "@langfuse/shared";
import { ModelParameters } from "@/src/components/ModelParameters";
import { LLMApiKeyComponent } from "@/src/components/ModelParameters/LLMApiKeyComponent";
import { SharedUiProvider } from "@/src/utils/shared-ui-translations";
import chineseMessages from "@/src/features/i18n/messages/zh-CN/sharedUi.json";

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-id",
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: ({ scope }: { scope: string }) =>
    scope !== "llmApiKeys:read",
}));

vi.mock("@/src/features/public-api/components/CreateLLMApiKeyDialog", () => ({
  CreateLLMApiKeyDialog: () => null,
}));

const modelParams = {
  adapter: { value: "openai", enabled: true },
  provider: { value: "openai", enabled: true },
  model: { value: "gpt-4o", enabled: true },
} as unknown as UIModelParams;

const renderChinese = (children: ReactNode) =>
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{ sharedUi: chineseMessages }}
    >
      <SharedUiProvider>{children}</SharedUiProvider>
    </NextIntlClientProvider>,
  );

describe("model parameter localization", () => {
  it("localizes the empty model configuration state", () => {
    renderChinese(
      <ModelParameters
        modelParams={modelParams}
        availableProviders={[]}
        availableModels={[]}
        providerModelCombinations={[]}
        updateModelParamValue={vi.fn()}
      />,
    );

    expect(screen.getByText("模型")).toBeInTheDocument();
    expect(screen.getByText("项目中未设置 LLM API 密钥。")).toBeInTheDocument();
  });

  it("localizes API key access messaging", () => {
    renderChinese(
      <LLMApiKeyComponent projectId="project-id" modelParams={modelParams} />,
    );

    expect(screen.getByText("API 密钥")).toBeInTheDocument();
    expect(
      screen.getByText("只有所有者和管理员角色可以查看 LLM API 密钥。"),
    ).toBeInTheDocument();
  });
});
