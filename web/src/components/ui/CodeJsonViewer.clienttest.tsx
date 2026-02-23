import { render } from "@testing-library/react";
import { JsonSkeleton } from "./CodeJsonViewer";

jest.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

jest.mock("../../features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => jest.fn(),
}));

jest.mock("../../features/theming/useMarkdownContext", () => ({
  useMarkdownContext: () => ({ setIsMarkdownEnabled: jest.fn() }),
}));

jest.mock("./LangfuseMediaView", () => ({
  LangfuseMediaView: () => null,
}));

jest.mock("./MarkdownJsonView", () => ({
  MarkdownJsonViewHeader: () => null,
}));

jest.mock("../../features/prompts/components/prompt-content-utils", () => ({
  renderRichPromptContent: () => null,
}));

jest.mock("../../utils/clipboard", () => ({
  copyTextToClipboard: () => Promise.resolve(),
}));

describe("JsonSkeleton", () => {
  it("applies a top margin by default", () => {
    const { container } = render(<JsonSkeleton />);
    const root = container.firstElementChild;

    expect(root).not.toBeNull();
    expect(root?.classList.contains("mt-1")).toBe(true);
  });
});
