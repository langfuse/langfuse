import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { V4IntroDialog } from "./V4IntroDialog";

describe("V4IntroDialog localization", () => {
  it("renders the introduction in Chinese", () => {
    render(
      <NextIntlClientProvider
        locale="zh-CN"
        messages={{
          coreDetails: {
            events: {
              v4Intro: {
                title: "欢迎使用更快的 Langfuse",
                imageAlt: "Langfuse 性能提升对比",
                introduction:
                  "我们围绕观测重新构建了数据模型，因此图表、筛选和 API 的速度显著提升。",
                observationsTitle: "全新的观测表格",
                observationsDescription:
                  "您的追踪仍然保留。默认视图现在会显示所有观测。",
                rootFilter: "根观测 -> 是",
                savedViewsTitle: "全新的表格视图保存功能",
                savedViewsDescription:
                  "将表格筛选保存为组织范围的视图，让整个团队从同一视图开始。",
                bestPractices: "最佳实践 ->",
                liveTracesTitle: "希望实时看到追踪？",
                liveTracesDescription:
                  "请将 SDK 升级到最新版本。旧版 SDK 仍然可用，但追踪可能需要约 10 分钟才会显示。",
                upgradeGuide: "升级指南 ->",
                docs: "阅读 v4 文档 ->",
                confirm: "知道了 ->",
              },
            },
          },
        }}
      >
        <V4IntroDialog open onConfirm={vi.fn()} onDismiss={vi.fn()} />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("dialog", { name: "欢迎使用更快的 Langfuse" }),
    ).toBeInTheDocument();
    expect(screen.getByText("全新的观测表格")).toBeInTheDocument();
    expect(screen.getByAltText("Langfuse 性能提升对比")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "知道了 ->" }),
    ).toBeInTheDocument();
  });
});
