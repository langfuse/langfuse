import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import settingsEnterprise from "@/src/features/i18n/messages/zh-CN/settingsEnterprise.json";
import { SupportOrUpgradePage } from "./SupportOrUpgradePage";

describe("billing localization", () => {
  it("renders restricted access guidance in Chinese", () => {
    render(
      <NextIntlClientProvider locale="zh-CN" messages={{ settingsEnterprise }}>
        <SupportOrUpgradePage />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("访问受限")).toBeInTheDocument();
    expect(screen.getByText("此功能需要额外权限")).toBeInTheDocument();
    expect(
      screen.getByText(
        "请联系系统或项目管理员获取访问权限，或升级套餐。如需帮助，请联系支持团队。",
      ),
    ).toBeInTheDocument();
  });
});
