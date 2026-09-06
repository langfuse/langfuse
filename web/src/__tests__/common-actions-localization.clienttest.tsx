import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ActionButton } from "@/src/components/ActionButton";
import { getMessages } from "@/src/features/i18n/messages";

vi.mock("posthog-js/react", () => ({
  usePostHog: () => ({ capture: vi.fn() }),
}));

vi.mock("@/src/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  HoverCardPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("common action localization", () => {
  it("localizes permission feedback without changing button content", () => {
    render(
      <NextIntlClientProvider locale="zh-CN" messages={getMessages("zh-CN")}>
        <ActionButton hasAccess={false}>Create</ActionButton>
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(
      screen.getByText("你没有访问此资源的权限，请联系管理员授权。"),
    ).toBeVisible();
  });
});
