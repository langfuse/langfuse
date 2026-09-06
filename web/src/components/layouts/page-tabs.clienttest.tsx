import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageTabs } from "./page-tabs";
import { NextIntlClientProvider } from "next-intl";
import { SharedUiProvider } from "@/src/utils/shared-ui-translations";
import { getMessages } from "@/src/features/i18n/messages";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    href: { pathname: string };
    onClick?: () => void;
    className?: string;
  }) => (
    <a
      href={href.pathname}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ query: { projectId: "p1" } }),
}));

describe("PageTabs", () => {
  it("fires onClick on a tab that also has an href", () => {
    const onAnalyticsClick = vi.fn();
    render(
      <PageTabs
        activeTab="results"
        tabs={[
          {
            value: "results",
            label: "Results",
            href: "/project/p1/experiments/results",
          },
          {
            value: "analytics",
            label: "Analytics",
            href: "/project/p1/experiments/analytics",
            onClick: onAnalyticsClick,
          },
        ]}
      />,
    );

    const analytics = screen.getByRole("link", { name: "Analytics" });
    expect(analytics).toHaveAttribute(
      "href",
      "/project/p1/experiments/analytics",
    );
    fireEvent.click(analytics);
    expect(onAnalyticsClick).toHaveBeenCalledTimes(1);
  });

  it("localizes known page tab labels", () => {
    render(
      <NextIntlClientProvider locale="zh-CN" messages={getMessages("zh-CN")}>
        <SharedUiProvider>
          <PageTabs
            activeTab="scores"
            tabs={[
              { value: "scores", label: "Scores", href: "/scores" },
              {
                value: "analytics",
                label: "Analytics",
                href: "/scores/analytics",
              },
            ]}
          />
        </SharedUiProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("link", { name: "评分" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "分析" })).toBeInTheDocument();
  });
});
