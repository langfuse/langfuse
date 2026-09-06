import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import remainderUi from "@/src/features/i18n/messages/zh-CN/remainderUi.json";
import { V4MigrationBadgeContent } from "./V4MigrationBadgeContent";
import { V4MigrationExperimentsSection } from "./V4MigrationContent";
import { V4MigrationLoadingState } from "./V4MigrationLoadingState";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

function renderZh(ui: ReactNode) {
  return render(
    <NextIntlClientProvider locale="zh-CN" messages={{ remainderUi }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("V4 migration localization", () => {
  it("renders Chinese status and badge punctuation", () => {
    renderZh(
      <>
        <V4MigrationLoadingState />
        <V4MigrationBadgeContent
          onClick={vi.fn()}
          title="需要处理"
          description="选择升级方式"
        />
      </>,
    );

    expect(screen.getByText("正在检查项目状态…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /需要处理/ })).toHaveTextContent(
      "需要处理。 选择升级方式。",
    );
  });

  it("translates rich migration guidance without changing API paths", () => {
    renderZh(
      <V4MigrationExperimentsSection
        state={{ status: "loaded", result: "required" }}
        upgradePath="api"
        defaultOpen
      />,
    );

    expect(screen.getByText("更新实验")).toBeInTheDocument();
    expect(screen.getByText("POST /dataset-run-items")).toBeInTheDocument();
    expect(screen.getByText(/请将此直接 API 调用替换为/)).toBeInTheDocument();
  });
});
