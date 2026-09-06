import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { Dialog, DialogContent } from "@/src/components/ui/dialog";
import { DeleteOrganizationDialogContent } from "@/src/features/organizations/components/DeleteOrganizationDialogContent";
import { DeleteProjectDialog } from "@/src/features/projects/components/DeleteProjectDialog";
import { TransferProjectDialogContent } from "@/src/features/projects/components/TransferProjectDialogContent";
import { getMessages } from "@/src/features/i18n/messages";

const provider = (children: React.ReactNode) => (
  <NextIntlClientProvider locale="zh-CN" messages={getMessages("zh-CN")}>
    <Dialog open>{children}</Dialog>
  </NextIntlClientProvider>
);

describe("workspace danger action localization", () => {
  it("localizes the organization deletion dialog", () => {
    render(
      provider(
        <DialogContent>
          <DeleteOrganizationDialogContent
            confirmMessage="acme"
            hasProjects={false}
            isPending={false}
            onConfirm={vi.fn()}
          />
        </DialogContent>,
      ),
    );

    expect(screen.getByRole("heading", { name: "删除组织" })).toBeVisible();
    expect(screen.getByText("请输入“acme”以确认操作。")).toBeVisible();
    expect(screen.getByRole("button", { name: "删除组织" })).toBeVisible();
  });

  it("localizes the project deletion dialog", () => {
    render(
      provider(
        <DialogContent>
          <DeleteProjectDialog
            confirmMessage="acme/production"
            isPending={false}
            onSubmit={vi.fn()}
          />
        </DialogContent>,
      ),
    );

    expect(screen.getByRole("heading", { name: "删除项目" })).toBeVisible();
    expect(
      screen.getByText("请输入“acme/production”以确认操作。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "删除项目" })).toBeVisible();
  });

  it("localizes the project transfer dialog", () => {
    render(
      provider(
        <TransferProjectDialogContent
          projectName="Production"
          organizationName="Acme"
          organizations={[{ id: "org-2", name: "Example" }]}
          isPending={false}
          onConfirm={vi.fn()}
        />,
      ),
    );

    expect(screen.getByRole("heading", { name: "转移项目" })).toBeVisible();
    expect(screen.getByText("警告")).toBeVisible();
    expect(screen.getByText("选择新组织")).toBeVisible();
    expect(
      screen.getByText("请输入“acme/production”以确认操作。"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "转移项目" })).toBeVisible();
  });
});
