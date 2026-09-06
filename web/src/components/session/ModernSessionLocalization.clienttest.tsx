import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import chineseMessages from "@/src/features/i18n/messages/zh-CN/sessions.json";

vi.mock("@/src/components/ui/dialog", () => ({
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock("@/src/features/filters/components/filter-builder", () => ({
  InlineFilterBuilder: () => <div data-testid="inline-filter-builder" />,
}));

vi.mock("@/src/components/ui/dropdown-menu", () => ({
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItemWithSecondaryAction: ({
    title,
    secondaryAction,
  }: {
    title: string;
    secondaryAction?: { ariaLabel?: string };
  }) => (
    <div>
      <button type="button">{title}</button>
      {secondaryAction ? (
        <button type="button" aria-label={secondaryAction.ariaLabel} />
      ) : null}
    </div>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <h3>{children}</h3>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

import { ModernSessionFilterDialogContent } from "./ModernSessionFilterDialogContent";
import { ModernSessionSaveViewDialogContent } from "./ModernSessionSaveViewDialogContent";
import {
  type ModernSessionViewDropdownMenuControls,
  ModernSessionViewDropdownMenu,
} from "./ModernSessionViewDropdownMenu";

const renderChinese = (element: React.ReactNode) =>
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{ sessions: chineseMessages }}
    >
      {element}
    </NextIntlClientProvider>,
  );

describe("modern session localization", () => {
  it("localizes the save-view dialog", () => {
    renderChinese(
      <ModernSessionSaveViewDialogContent
        isSaving={false}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "保存为新视图" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "保存视图" }),
    ).toBeInTheDocument();
  });

  it("localizes the filter dialog actions", () => {
    renderChinese(
      <ModernSessionFilterDialogContent
        initialFilters={[]}
        filterColumns={[]}
        filterColumnsWithCustomSelect={[]}
        viewActions={{
          type: "update",
          viewName: "重点视图",
          isUpdating: false,
          onCreate: vi.fn(),
          onUpdate: vi.fn(),
        }}
        onCancel={vi.fn()}
        onApplyFilters={vi.fn()}
      />,
    );

    expect(screen.getByTestId("inline-filter-builder")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "筛选观测" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "保存为新视图" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "更新“重点视图”" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "应用筛选" }),
    ).toBeInTheDocument();
  });

  it("localizes system presets while preserving saved view names", () => {
    const controls = {
      matchingSystemPresetId: "__langfuse_with_io__",
      matchingSavedViewId: "saved-view-id",
      savedViews: [
        {
          id: "saved-view-id",
          name: "Customer view",
          filters: [],
          columnOrder: [],
          columnVisibility: {},
          orderBy: null,
          searchQuery: "",
        },
      ],
      onApplyPreset: vi.fn(),
      onApplySavedView: vi.fn(),
      onManageViews: vi.fn(),
      onOpenFilterDialog: vi.fn(),
    } satisfies ModernSessionViewDropdownMenuControls;

    renderChinese(<ModernSessionViewDropdownMenu controls={controls} />);

    expect(screen.getByText("系统预设")).toBeInTheDocument();
    expect(screen.getByText("已保存的视图")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "所有包含输入/输出的观测" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "每个追踪的首次 LLM 调用" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "每个追踪的末次 LLM 调用" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Customer view" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "已选择所有包含输入/输出的观测",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "已选择Customer view" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "管理视图" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "应用自定义筛选" }),
    ).toBeInTheDocument();
  });
});
