import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import chineseMessages from "@/src/features/i18n/messages/zh-CN/playgroundDashboard.json";

import { GenerationOutput } from "./GenerationOutput";

vi.mock("../context", () => ({
  usePlaygroundContext: () => ({
    output: "customer-generated output",
    outputReasoning: "",
    outputJson: '{"secret":"customer-generated output"}',
    addMessage: vi.fn(),
    outputToolCalls: [],
    scrollToMessage: vi.fn(),
  }),
}));

const renderChinese = () =>
  render(
    <NextIntlClientProvider
      locale="zh-CN"
      messages={{ playgroundDashboard: chineseMessages }}
    >
      <GenerationOutput />
    </NextIntlClientProvider>,
  );

describe("GenerationOutput session recording privacy", () => {
  it("blocks generated output from PostHog session recordings", () => {
    renderChinese();

    expect(screen.getByText("customer-generated output")).toHaveClass(
      "ph-no-capture",
    );
  });

  it("localizes output controls", () => {
    renderChinese();

    expect(screen.getByText("输出")).toBeInTheDocument();
    expect(screen.getByTitle("复制输出")).toBeInTheDocument();
    expect(screen.getByText("添加到消息")).toBeInTheDocument();
  });
});
