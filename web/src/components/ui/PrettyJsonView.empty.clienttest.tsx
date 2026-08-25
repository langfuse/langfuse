/**
 * Empty I/O must render as JSON `null` in both pretty and JSON views.
 * `undefined` is a JS artifact (optional props, `value ?? undefined` at call
 * sites); JSON has no undefined, so the two views must not disagree.
 */
import { render, screen } from "@testing-library/react";
import type * as CodeJsonViewerModule from "@/src/components/ui/CodeJsonViewer";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

const jsonView = vi.hoisted(() => ({
  json: undefined as unknown,
}));
vi.mock("@/src/components/ui/CodeJsonViewer", async (importOriginal) => {
  const actual = await importOriginal<typeof CodeJsonViewerModule>();
  return {
    ...actual,
    JSONView: (props: { json?: unknown; title?: string }) => {
      jsonView.json = props.json;
      return <div data-testid="json-view">{props.title}</div>;
    },
  };
});

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";

describe("PrettyJsonView empty JSON null vs undefined", () => {
  beforeEach(() => {
    jsonView.json = undefined;
  });

  it("shows null in pretty view for a missing/undefined value", () => {
    render(
      <PrettyJsonView json={undefined} title="Output" currentView="pretty" />,
    );

    expect(screen.getByText("null")).toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("shows null in pretty view for JSON null", () => {
    render(<PrettyJsonView json={null} title="Input" currentView="pretty" />);

    expect(screen.getByText("null")).toBeInTheDocument();
    expect(screen.queryByText("undefined")).not.toBeInTheDocument();
  });

  it("hands JSON null to JSONView when parsedJson is null and json is undefined", () => {
    render(
      <PrettyJsonView
        json={undefined}
        parsedJson={null}
        title="Output"
        currentView="json"
      />,
    );

    expect(jsonView.json).toBeNull();
  });

  it("hands JSON null to JSONView when both json and parsedJson are undefined", () => {
    render(
      <PrettyJsonView json={undefined} title="Output" currentView="json" />,
    );

    expect(jsonView.json).toBeNull();
  });
});
