import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import simplifiedChineseAuxSettings from "@/src/features/i18n/messages/zh-CN/auxSettings.json";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { projectId: "project-1" } }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/src/components/layouts/header", () => ({
  default: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

vi.mock("@/src/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock("@/src/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/src/components/layouts/settings-table-card", () => ({
  SettingsTableCard: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/src/components/design-system/Codeblock/Codeblock", () => ({
  CodeBlock: () => null,
}));

vi.mock("@/src/components/design-system/Switch/Switch", () => ({
  Switch: () => <input type="checkbox" readOnly />,
}));

vi.mock("@/src/components/ui/CodeJsonViewer", () => ({
  CodeView: () => null,
}));

vi.mock("@/src/components/table/use-cases/models", () => ({
  default: () => null,
}));

vi.mock("@/src/components/table/use-cases/score-configs", () => ({
  ScoreConfigsTable: () => null,
}));

vi.mock("@/src/features/batch-actions/components/BatchActionsTable", () => ({
  BatchActionsTable: () => null,
}));

vi.mock("@/src/features/batch-exports/components/BatchExportsTable", () => ({
  BatchExportsTable: () => null,
}));

vi.mock("@/src/features/automations/components/automationForm", () => ({
  AutomationForm: () => null,
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: ({ scope }: { scope: string }) =>
    !["datasets:CUD", "batchExports:read"].includes(scope),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    notificationPreferences: {
      getForProject: {
        useQuery: () => ({
          data: [{ channel: "EMAIL", type: "COMMENT_MENTION", enabled: true }],
          isLoading: false,
          refetch: vi.fn(),
        }),
      },
      update: {
        useMutation: () => ({
          mutateAsync: vi.fn(),
          isError: true,
        }),
      },
    },
  },
}));

vi.mock(
  "@/src/features/notifications/hooks/useProjectNotificationChannels",
  () => ({
    useProjectNotificationChannels: () => ({
      hasAccess: true,
      channels: [],
      isLoading: false,
      mode: "list",
      editingChannel: null,
      webhookSecret: "webhook-secret",
      isDeleting: false,
      isTogglingEvent: false,
      isEventEnabled: () => false,
      actions: {
        openCreate: vi.fn(),
        openEdit: vi.fn(),
        deleteChannel: vi.fn(),
        setEventEnabled: vi.fn(),
        onFormSuccess: vi.fn(),
        closeForm: vi.fn(),
        dismissWebhookSecret: vi.fn(),
      },
    }),
  }),
);

import { PersonalNotificationSettings } from "@/src/features/notifications/components/PersonalNotificationSettings";
import { ProjectNotificationChannels } from "@/src/features/notifications/components/ProjectNotificationChannels";
import { WebhookSecretRender } from "@/src/features/automations/components/WebhookSecretRender";
import { DeveloperToolsSettings } from "@/src/features/developer-tools/components/DeveloperToolsSettings";
import { ModelsSettings } from "@/src/features/models/components/ModelSettings";
import { ScoreConfigSettings } from "@/src/features/score-configs/components/ScoreConfigSettings";
import { BatchActionsSettingsPage } from "@/src/features/batch-actions/components/BatchActionsSettingsPage";
import { BatchExportsSettingsPage } from "@/src/features/batch-exports/components/BatchExportsSettingsPage";

const renderInChinese = (children: ReactNode) =>
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{ auxSettings: simplifiedChineseAuxSettings }}
    >
      {children}
    </NextIntlClientProvider>,
  );

describe("auxiliary settings localization", () => {
  it("renders personal and project notification settings in Chinese", () => {
    renderInChinese(
      <>
        <PersonalNotificationSettings />
        <ProjectNotificationChannels projectId="project-1" />
        <WebhookSecretRender webhookSecret="webhook-secret" />
      </>,
    );

    expect(screen.getByText("个人通知")).toBeInTheDocument();
    expect(screen.getByText("评论提及")).toBeInTheDocument();
    expect(screen.getByText("项目通知")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "添加渠道" }),
    ).toBeInTheDocument();
    expect(screen.getByText("评估器已停用")).toBeInTheDocument();
    expect(screen.getByText("Webhook 密钥已创建")).toBeInTheDocument();
    expect(screen.getAllByText("Webhook 密钥")).toHaveLength(2);
  });

  it("renders the auxiliary project settings in Chinese", () => {
    renderInChinese(
      <>
        <DeveloperToolsSettings projectId="project-1" />
        <ModelsSettings projectId="project-1" />
        <ScoreConfigSettings projectId="project-1" />
        <BatchActionsSettingsPage projectId="project-1" />
        <BatchExportsSettingsPage projectId="project-1" />
      </>,
    );

    expect(screen.getByText("智能体技能")).toBeInTheDocument();
    expect(screen.getAllByText("管理 API 密钥")).toHaveLength(2);
    expect(screen.getByText("模型定义")).toBeInTheDocument();
    expect(screen.getByText("评分配置")).toBeInTheDocument();
    expect(screen.getByText("人工标注")).toHaveAttribute(
      "href",
      "https://langfuse.com/docs/evaluation/evaluation-methods/annotation",
    );
    expect(screen.getByText("批量操作")).toBeInTheDocument();
    expect(screen.getByText("导出")).toBeInTheDocument();
    expect(screen.getAllByText("无权访问")).toHaveLength(2);
  });
});
