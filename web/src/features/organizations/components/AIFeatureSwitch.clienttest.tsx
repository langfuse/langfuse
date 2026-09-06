import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import AIFeatureSwitch from "./AIFeatureSwitch";
import englishSettingsEnterprise from "@/src/features/i18n/messages/en/settingsEnterprise.json";
import simplifiedChineseSettingsEnterprise from "@/src/features/i18n/messages/zh-CN/settingsEnterprise.json";

const mocks = vi.hoisted(() => ({
  isLangfuseCloud: true,
  aiFeaturesTracingConfigured: true,
  organization: {
    id: "org-1",
    aiFeaturesEnabled: true,
    aiTelemetryEnabled: true,
  } as {
    id: string;
    aiFeaturesEnabled: boolean;
    aiTelemetryEnabled: boolean;
  } | null,
  hasAccess: true,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      environment: {
        aiFeaturesTracingConfigured: mocks.aiFeaturesTracingConfigured,
      },
    },
    update: vi.fn(),
  }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkOrganizationAccess", () => ({
  useHasOrganizationAccess: () => mocks.hasAccess,
}));

vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({
    isLangfuseCloud: mocks.isLangfuseCloud,
    region: mocks.isLangfuseCloud ? "US" : undefined,
  }),
  useQueryOrganization: () => mocks.organization,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      organizations: { byId: { invalidate: vi.fn() } },
    }),
    organizations: {
      update: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@/src/components/layouts/header", () => ({
  default: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

const renderSwitch = (locale: "en" | "zh-CN" = "en") =>
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={{
        settingsEnterprise:
          locale === "en"
            ? englishSettingsEnterprise
            : simplifiedChineseSettingsEnterprise,
      }}
    >
      <AIFeatureSwitch />
    </NextIntlClientProvider>,
  );

describe("AIFeatureSwitch", () => {
  beforeEach(() => {
    mocks.isLangfuseCloud = true;
    mocks.aiFeaturesTracingConfigured = true;
    mocks.organization = {
      id: "org-1",
      aiFeaturesEnabled: true,
      aiTelemetryEnabled: true,
    };
    mocks.hasAccess = true;
  });

  it("hides product-improvement telemetry when the AI-features project is not configured", () => {
    mocks.aiFeaturesTracingConfigured = false;

    renderSwitch();

    expect(
      screen.getByText("Enable AI powered features for your organization"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("AI Data Use for Product/Service Improvement"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Traces are sent to Langfuse Cloud/),
    ).not.toBeInTheDocument();
  });

  it("shows product-improvement telemetry on Cloud when AI features and tracing are on", () => {
    renderSwitch();

    expect(
      screen.getByText("AI Data Use for Product/Service Improvement"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Traces are sent to Langfuse Cloud/),
    ).not.toBeInTheDocument();
  });

  it("hides product-improvement telemetry on self-hosted even when tracing is configured", () => {
    mocks.isLangfuseCloud = false;

    renderSwitch();

    expect(
      screen.queryByText("AI Data Use for Product/Service Improvement"),
    ).not.toBeInTheDocument();
  });

  it("renders organization AI settings in Chinese", () => {
    renderSwitch("zh-CN");

    expect(
      screen.getByRole("heading", { name: "AI 功能" }),
    ).toBeInTheDocument();
    expect(screen.getByText("为组织启用 AI 功能")).toBeInTheDocument();
    expect(screen.getByText("使用 AI 数据改进产品和服务")).toBeInTheDocument();
  });
});
