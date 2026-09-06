import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import { CreateProjectMemberDialogContent } from "./CreateProjectMemberDialogContent";
import simplifiedChineseAccessSettings from "@/src/features/i18n/messages/zh-CN/accessSettings.json";

describe("CreateProjectMemberDialogContent localization", () => {
  it("renders the invitation form in Simplified Chinese", () => {
    render(
      <NextIntlClientProvider
        locale="zh-CN"
        messages={{ accessSettings: simplifiedChineseAccessSettings }}
      >
        <CreateProjectMemberDialogContent
          project={undefined}
          hasOnlySingleProjectAccess={false}
          hasProjectRoleEntitlement={false}
          isSubmitting={false}
          createProjectMember={vi.fn()}
          onSuccess={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("邮箱")).toBeInTheDocument();
    expect(screen.getByText("组织角色")).toBeInTheDocument();
    expect(screen.getAllByText("成员").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "授予访问权限" }),
    ).toBeInTheDocument();
  });
});
