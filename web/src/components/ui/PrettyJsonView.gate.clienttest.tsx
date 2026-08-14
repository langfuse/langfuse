/**
 * PrettyJsonView must short-circuit a multi-MB top-level string to the bounded
 * LargeStringFallback and NEVER mount the unvirtualized JSON viewer (JSONView /
 * react18-json-view) or the lazy table with it (LFE-10991). These tests pin
 * that branch selection: over-limit strings render the fallback only, while a
 * normal small string still mounts the viewer.
 */
import { render, screen } from "@testing-library/react";
import type * as CodeJsonViewerModule from "@/src/components/ui/CodeJsonViewer";

// LargeStringFallback's only provider-bound dependency — stub it so the test
// needs no PostHogProvider.
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

// JSONView is the unvirtualized react18-json-view path we must NOT reach for an
// over-limit string. Stub only it (keep the module's other exports) so its
// mounting is observable by test id.
vi.mock("@/src/components/ui/CodeJsonViewer", async (importOriginal) => {
  const actual = await importOriginal<typeof CodeJsonViewerModule>();
  return {
    ...actual,
    JSONView: (props: { title?: string }) => (
      <div data-testid="json-view">{props.title}</div>
    ),
  };
});

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { LARGE_STRING_RENDER_CHAR_LIMIT } from "@/src/components/ui/largeStringGate";

describe("PrettyJsonView large-string gate (LFE-10991)", () => {
  it("renders the bounded fallback and mounts neither the JSON viewer nor the table for an over-limit string", () => {
    const huge = "x".repeat(LARGE_STRING_RENDER_CHAR_LIMIT + 1);
    const { container } = render(<PrettyJsonView json={huge} title="Input" />);

    // Bounded fallback + download affordance are shown...
    expect(screen.getByText(/Large string —/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Download full value/i }),
    ).toBeInTheDocument();

    // ...and the unvirtualized viewer + lazy table were never mounted.
    expect(screen.queryByTestId("json-view")).not.toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();

    // The multi-MB string is not dumped into the DOM (only the bounded preview).
    expect(container.textContent?.length ?? 0).toBeLessThan(10_000);
  });

  it("renders normally (JSON viewer mounted, no fallback) for small I/O", () => {
    render(<PrettyJsonView json={{ foo: "bar", n: 1 }} title="Input" />);

    expect(screen.queryByText(/Large string —/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("json-view")).toBeInTheDocument();
  });

  it("shows the loading/parsing state (not the fallback) while a parse is in-flight, even if the raw json string is over the limit", () => {
    // The JSON tab passes the raw `json` (a stringified payload) alongside a
    // not-yet-ready `parsedJson` during the worker-parse window. Its JSON-quoted
    // form can itself exceed the limit — but gating on it would flash the
    // fallback and offer a quoted-form download before the parse settles.
    const hugeRawJson = JSON.stringify({
      x: "y".repeat(LARGE_STRING_RENDER_CHAR_LIMIT),
    });
    expect(hugeRawJson.length).toBeGreaterThan(LARGE_STRING_RENDER_CHAR_LIMIT);

    render(
      <PrettyJsonView
        json={hugeRawJson}
        parsedJson={undefined}
        isParsing
        title="Input"
      />,
    );

    // No fallback, no quoted-form download — the normal parsing state shows.
    expect(screen.queryByText(/Large string —/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Download full value/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Parsing in background/i)).toBeInTheDocument();
  });

  it("still gates a genuinely huge SETTLED top-level string (parse finished)", () => {
    const hugePlainString = "z".repeat(LARGE_STRING_RENDER_CHAR_LIMIT + 1);
    render(
      <PrettyJsonView
        json="ignored-raw"
        parsedJson={hugePlainString}
        title="Input"
      />,
    );

    expect(screen.getByText(/Large string —/i)).toBeInTheDocument();
    expect(screen.queryByTestId("json-view")).not.toBeInTheDocument();
  });
});
