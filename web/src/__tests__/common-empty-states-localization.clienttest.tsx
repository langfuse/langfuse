import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { DataTable } from "@/src/components/table/data-table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { getMessages } from "@/src/features/i18n/messages";

vi.mock("next/router", () => ({
  useRouter: () => ({ query: {} }),
}));

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

const renderChinese = (children: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="zh-CN" messages={getMessages("zh-CN")}>
      {children}
    </NextIntlClientProvider>,
  );

describe("common empty state localization", () => {
  it("localizes the generic no-data state", () => {
    renderChinese(<NoDataOrLoading isLoading={false} />);

    expect(screen.getByText("暂无数据")).toBeVisible();
  });

  it("localizes the default empty table message", () => {
    const columns: LangfuseColumnDef<{ name: string }>[] = [
      { accessorKey: "name", id: "name", header: "Name" },
    ];

    renderChinese(
      <DataTable
        tableName="localizedEmptyTable"
        columns={columns}
        hidePagination
        data={{ isLoading: false, isError: false, data: [] }}
      />,
    );

    expect(screen.getByText("没有结果。")).toBeVisible();
  });

  it("updates a memoized empty table when the locale changes", () => {
    const columns: LangfuseColumnDef<{ name: string }>[] = [
      { accessorKey: "name", id: "name", header: "Name" },
    ];
    const table = (
      <DataTable
        tableName="memoizedLocalizedEmptyTable"
        columns={columns}
        hidePagination
        data={{ isLoading: false, isError: false, data: [] }}
        peekView={{
          itemType: "TRACE",
          closePeek: vi.fn(),
          tableName: "memoizedLocalizedEmptyTable",
          isV4: false,
        }}
      />
    );
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={getMessages("en")}>
        {table}
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("No results.")).toBeVisible();

    rerender(
      <NextIntlClientProvider locale="zh-CN" messages={getMessages("zh-CN")}>
        {table}
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("没有结果。")).toBeVisible();
  });
});
