import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/src/components/ui/sheet";
import {
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/src/components/ui/sidebar";
import { CommandDialog } from "@/src/components/ui/command";
import { MultiSelectCombobox } from "@/src/components/ui/multi-select-combobox";
import { Dropzone } from "@/src/components/design-system/Dropzone/Dropzone";
import { LAYER_ORDER } from "@/src/components/ui/layer";
import { SharedUiProvider } from "@/src/utils/shared-ui-translations";
import chineseMessages from "@/src/features/i18n/messages/zh-CN/sharedUi.json";

vi.mock("next/router", () => ({
  useRouter: () => ({
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

vi.mock("@/src/hooks/use-mobile", () => ({ useIsMobile: () => false }));

function installOverlayLayers() {
  const root = document.createElement("div");
  root.setAttribute("data-overlay-root", "");
  for (const layer of LAYER_ORDER) {
    const element = document.createElement("div");
    element.setAttribute("data-layer", layer);
    root.appendChild(element);
  }
  document.body.appendChild(root);
}

const renderChinese = (children: ReactNode) =>
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{ sharedUi: chineseMessages }}
    >
      <SharedUiProvider>{children}</SharedUiProvider>
    </NextIntlClientProvider>,
  );

describe("shared UI control localization", () => {
  beforeEach(installOverlayLayers);

  afterEach(() => {
    document.querySelector("[data-overlay-root]")?.remove();
  });

  it("localizes dialog accessibility labels", () => {
    renderChinese(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });

  it("localizes sheet accessibility labels", () => {
    renderChinese(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });

  it("localizes sidebar accessibility labels", () => {
    renderChinese(
      <SidebarProvider>
        <SidebarTrigger />
        <SidebarRail />
      </SidebarProvider>,
    );

    expect(screen.getAllByRole("button", { name: "切换侧边栏" })).toHaveLength(
      2,
    );
    expect(screen.getByTitle("切换侧边栏")).toBeInTheDocument();
  });

  it("localizes the command dialog title", () => {
    renderChinese(
      <CommandDialog open>
        <div>Content</div>
      </CommandDialog>,
    );

    expect(screen.getByRole("heading", { name: "搜索" })).toBeInTheDocument();
  });

  it("localizes combobox and dropzone empty states", () => {
    renderChinese(
      <>
        <MultiSelectCombobox
          selectedItems={[]}
          onItemsChange={vi.fn()}
          searchQuery=""
          onSearchChange={vi.fn()}
          searchResults={[]}
          renderItem={() => null}
          renderSelectedItem={() => null}
          getItemKey={(item: string) => item}
        />
        <Dropzone
          accept={{ "image/png": [] }}
          isDisabled={false}
          minSize={undefined}
          maxSize={undefined}
          maxFiles={1}
          onDrop={vi.fn()}
          onError={vi.fn()}
          src={undefined}
          variant="panel"
        />
      </>,
    );

    const search = screen.getByPlaceholderText("搜索...");
    fireEvent.focus(search);

    expect(screen.getByText("暂无结果")).toBeInTheDocument();
    expect(screen.getByText("上传文件")).toBeInTheDocument();
    expect(screen.getByText("拖放文件或点击上传")).toBeInTheDocument();
    expect(screen.getByText("支持 image/png.")).toBeInTheDocument();
  });
});
