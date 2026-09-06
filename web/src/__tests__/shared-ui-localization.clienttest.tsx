import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import {
  useReactTable,
  getCoreRowModel,
  type Row,
} from "@tanstack/react-table";
import { type ReactNode } from "react";
import { LoadingLayout } from "@/src/components/layouts/app-layout/variants/LoadingLayout";
import { ErrorPage } from "@/src/components/error-page";
import { CrashModal } from "@/src/components/CrashModal/CrashModal";
import { DataTablePagination } from "@/src/components/table/data-table-pagination";
import { ValueCell } from "@/src/components/table/ValueCell";
import { Combobox } from "@/src/components/ui/combobox";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { type JsonTableRow } from "@/src/components/table/utils/jsonExpansionUtils";
import chineseMessages from "@/src/features/i18n/messages/zh-CN/sharedUi.json";
import { SharedUiProvider } from "@/src/utils/shared-ui-translations";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated" }),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/", push: vi.fn() }),
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

const renderChinese = (element: ReactNode) =>
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{ sharedUi: chineseMessages }}
    >
      <SharedUiProvider>{element}</SharedUiProvider>
    </NextIntlClientProvider>,
  );

function PaginationHarness() {
  const table = useReactTable({
    data: [{ id: "1" }],
    columns: [{ accessorKey: "id" }],
    getCoreRowModel: getCoreRowModel(),
  });

  return <DataTablePagination table={table} isLoading={false} />;
}

describe("shared UI localization", () => {
  it("localizes loading, error, and crash states", () => {
    renderChinese(
      <>
        <LoadingLayout />
        <ErrorPage message="说明" />
        <CrashModal
          description="说明"
          sentryEventId="event-id"
          showReturnHome
          statusCode={500}
        />
      </>,
    );

    expect(screen.getByRole("heading", { name: /加载中/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "错误" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "出现错误" }),
    ).toBeInTheDocument();
    expect(screen.getByText("错误 500")).toBeInTheDocument();
    expect(screen.getByText("错误 ID")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回首页" })).toBeInTheDocument();
  });

  it("localizes pagination labels and navigation controls", () => {
    renderChinese(<PaginationHarness />);

    expect(screen.getByText("每页行数")).toBeInTheDocument();
    expect(screen.getByText("第")).toBeInTheDocument();
    expect(screen.getByText("页，共 1 页")).toBeInTheDocument();
    expect(screen.getByText("转到第一页")).toBeInTheDocument();
    expect(screen.getByText("转到上一页")).toBeInTheDocument();
    expect(screen.getByText("转到下一页")).toBeInTheDocument();
    expect(screen.getByText("转到最后一页")).toBeInTheDocument();
  });

  it("localizes value previews and cell actions", () => {
    const row = {
      id: "row-1",
      original: {
        key: "payload",
        value: {},
        type: "object",
        level: 0,
        hasChildren: false,
      },
      getIsExpanded: () => false,
      subRows: [],
    } as unknown as Row<JsonTableRow>;

    renderChinese(
      <ValueCell
        row={row}
        expandedCells={new Set()}
        toggleCellExpansion={() => undefined}
      />,
    );

    expect(screen.getByText("空对象")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "复制单元格值" }),
    ).toBeInTheDocument();
  });

  it("localizes shared combobox and confirmation defaults", () => {
    renderChinese(
      <>
        <Combobox options={[]} />
        <ConfirmDialog
          open
          onOpenChange={() => undefined}
          title="删除项目"
          onConfirm={() => undefined}
        />
      </>,
    );

    expect(screen.getByText("选择选项...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认" })).toBeInTheDocument();
  });
});
