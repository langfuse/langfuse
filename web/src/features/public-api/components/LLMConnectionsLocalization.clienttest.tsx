import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import simplifiedChineseLlmConnections from "@/src/features/i18n/messages/zh-CN/llmConnections.json";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-1",
}));

vi.mock("@/src/ee/features/ui-customization/useUiCustomization", () => ({
  useUiCustomization: () => undefined,
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({ llmApiKey: { invalidate: mocks.invalidate } }),
    llmApiKey: {
      all: {
        useQuery: () => ({ data: { data: [] } }),
      },
      create: {
        useMutation: () => ({ mutateAsync: mocks.mutateAsync }),
      },
      update: {
        useMutation: () => ({ mutateAsync: mocks.mutateAsync }),
      },
      test: {
        useMutation: () => ({ mutateAsync: mocks.mutateAsync }),
      },
      testUpdate: {
        useMutation: () => ({ mutateAsync: mocks.mutateAsync }),
      },
      delete: {
        useMutation: () => ({
          mutateAsync: mocks.mutateAsync,
          isPending: false,
        }),
      },
    },
  },
  reportNonTrpcError: vi.fn(),
}));

vi.mock("@/src/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogBody: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { LlmApiKeyList } from "./LLMApiKeyList";
import { CreateLLMApiKeyDialog } from "./CreateLLMApiKeyDialog";
import { UpdateLLMApiKeyDialog } from "./UpdateLLMApiKeyDialog";
import { CreateLLMApiKeyForm } from "./CreateLLMApiKeyForm";

const renderInChinese = (children: ReactNode) =>
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{ llmConnections: simplifiedChineseLlmConnections }}
    >
      {children}
    </NextIntlClientProvider>,
  );

describe("LLM connections localization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the list and create/update dialogs in Chinese", () => {
    renderInChinese(
      <>
        <LlmApiKeyList projectId="project-1" />
        <CreateLLMApiKeyDialog open={false} setOpen={vi.fn()} />
        <UpdateLLMApiKeyDialog
          apiKey={{} as never}
          projectId="project-1"
          open={false}
        />
      </>,
    );

    expect(screen.getByText("LLM 连接")).toBeInTheDocument();
    expect(screen.getByText("提供商")).toBeInTheDocument();
    expect(screen.getByText("适配器")).toBeInTheDocument();
    expect(screen.getByText("基础 URL")).toBeInTheDocument();
    expect(screen.getByText("无")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "添加 LLM 连接" }),
    ).toHaveLength(2);
    expect(screen.getAllByText("新建 LLM 连接")).toHaveLength(2);
    expect(screen.getByText("更新 LLM 连接")).toBeInTheDocument();
  });

  it("renders the default connection form and validation in Chinese", async () => {
    renderInChinese(
      <CreateLLMApiKeyForm
        projectId="project-1"
        onSuccess={vi.fn()}
        customization={null}
      />,
    );

    expect(screen.getByText("LLM 适配器")).toBeInTheDocument();
    expect(screen.getByText("提供商名称")).toBeInTheDocument();
    expect(screen.getByText("API 密钥")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "显示高级设置" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "创建连接" }));

    expect(
      await screen.findByText("请输入用于标识此连接的提供商名称。"),
    ).toBeInTheDocument();
    expect(await screen.findByText("请输入密钥。")).toBeInTheDocument();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});
