/**
 * Formatted (pretty) view must render empty input and empty output the same
 * way: JSON `null`, not JS `undefined`. Input used to be coalesced with
 * `?? null` while output was passed through.
 */
import { render } from "@testing-library/react";

const prettyJsonView = vi.hoisted(() => ({
  calls: [] as { title?: string; json?: unknown }[],
}));
vi.mock("@/src/components/ui/PrettyJsonView", () => ({
  PrettyJsonView: (props: { title?: string; json?: unknown }) => {
    prettyJsonView.calls.push({ title: props.title, json: props.json });
    return <div data-testid="pretty-json-view">{props.title}</div>;
  },
}));

vi.mock("./components/CorrectedOutputField", () => ({
  CorrectedOutputField: () => <div data-testid="corrected-output" />,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@langfuse/shared", () => ({
  deepParseJson: (value: unknown) => value,
}));

vi.mock("../../hooks/useChatMLParser", () => ({
  useChatMLParser: () => ({
    canDisplayAsChat: false,
    allMessages: [],
    additionalInput: undefined,
    allTools: [],
    toolCallCounts: new Map(),
    toolCallsByName: new Map(),
    messageToToolCallNumbers: new Map(),
    toolNameToDefinitionNumber: new Map(),
    inputMessageCount: 0,
  }),
}));

import { IOPreviewPretty } from "./IOPreviewPretty";

describe("IOPreviewPretty empty JSON null vs undefined", () => {
  beforeEach(() => {
    prettyJsonView.calls = [];
  });

  it("passes JSON null for both empty input and empty output", () => {
    render(
      <IOPreviewPretty
        input={undefined}
        output={undefined}
        parsedInput={undefined}
        parsedOutput={undefined}
        hideIfNull={false}
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );

    const inputCall = prettyJsonView.calls.find((c) => c.title === "Input");
    const outputCall = prettyJsonView.calls.find((c) => c.title === "Output");
    expect(inputCall?.json).toBeNull();
    expect(outputCall?.json).toBeNull();
  });

  it("keeps parsed JSON null for both fields", () => {
    render(
      <IOPreviewPretty
        input={undefined}
        output={undefined}
        parsedInput={null}
        parsedOutput={null}
        hideIfNull={false}
        showCorrections={false}
        projectId="p"
        traceId="t"
      />,
    );

    const inputCall = prettyJsonView.calls.find((c) => c.title === "Input");
    const outputCall = prettyJsonView.calls.find((c) => c.title === "Output");
    expect(inputCall?.json).toBeNull();
    expect(outputCall?.json).toBeNull();
  });
});
