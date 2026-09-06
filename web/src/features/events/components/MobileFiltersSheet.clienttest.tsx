import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { ControlsContext } from "@/src/components/table/data-table-controls";
import { MobileFiltersSheet } from "./MobileFiltersSheet";

describe("MobileFiltersSheet localization", () => {
  it("renders the mobile filter controls in Chinese", () => {
    render(
      <NextIntlClientProvider
        locale="zh-CN"
        messages={{
          coreObservability: {
            events: {
              filters: "筛选",
              closeFilters: "关闭筛选",
              quickPresets: "快捷预设",
              myViews: "我的视图",
              clearAll: "全部清除",
              showResults: "显示结果",
              showResultsCount: "显示 {count} 条结果",
            },
          },
        }}
      >
        <ControlsContext.Provider
          value={{
            open: true,
            setOpen: vi.fn(),
            tableName: "test",
            isMobile: true,
          }}
        >
          <MobileFiltersSheet
            activeCount={1}
            resultCount={12}
            onClearAll={vi.fn()}
            presets={<div>preset</div>}
            savedViews={<div>view</div>}
          />
        </ControlsContext.Provider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("button", { name: /筛选/ })).toBeInTheDocument();
    expect(screen.getByText("快捷预设")).toBeInTheDocument();
    expect(screen.getByText("我的视图")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "全部清除" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "显示 12 条结果" }),
    ).toBeInTheDocument();
  });
});
