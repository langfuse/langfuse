import { StrictMode, useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { FilterState } from "@langfuse/shared";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { InlineFilterBuilder, PopoverFilterBuilder } from "./filter-builder";

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project",
}));
vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: () => ({ organization: undefined }),
}));
vi.mock("@/src/features/organizations/hooks", () => ({
  useLangfuseCloudRegion: () => ({ isLangfuseCloud: false }),
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    naturalLanguageFilters: { createCompletion: { useMutation: vi.fn() } },
  },
}));

describe("filter builder change notifications", () => {
  const scrollIntoView = Element.prototype.scrollIntoView;
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("reports incomplete object keys and unfinished rows until they are completed or removed", () => {
    function Harness() {
      const [valid, setValid] = useState(true);
      const [filters, setFilters] = useState<FilterState>([
        {
          column: "Metadata",
          type: "stringObject",
          key: "abc",
          operator: "is set",
          value: "",
        },
      ]);
      return (
        <>
          <InlineFilterBuilder
            columns={[
              {
                id: "metadata",
                name: "Metadata",
                type: "stringObject",
                internal: "metadata",
              },
            ]}
            filterState={filters}
            onChange={setFilters}
            onValidityChange={setValid}
          />
          <button disabled={!valid}>Run query</button>
        </>
      );
    }
    render(
      <TooltipProvider>
        <Harness />
      </TooltipProvider>,
    );
    const runQuery = screen.getByRole("button", { name: "Run query" });
    fireEvent.change(screen.getByPlaceholderText("key"), {
      target: { value: "" },
    });
    expect(runQuery).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("key"), {
      target: { value: "abc" },
    });
    expect(runQuery).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Add filter/ }));
    expect(runQuery).toBeDisabled();
    fireEvent.click(
      within(screen.getByText("And").closest("tr")!).getByRole("button"),
    );
    expect(runQuery).toBeEnabled();
  });
  it.each([
    ["inline", InlineFilterBuilder],
    ["popover", PopoverFilterBuilder],
  ] as const)(
    "%s keeps new rows controlled and notifies the parent once per edit",
    (kind, Builder) => {
      const onChange = vi.fn();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      function Harness() {
        const [filters, setFilters] = useState<FilterState>([]);
        return (
          <Builder
            columns={[
              {
                id: "userId",
                name: "User ID",
                type: "string",
                internal: "user_id",
              },
            ]}
            columnIdentifier={kind === "inline" ? "id" : undefined}
            filterState={filters}
            onChange={(next: FilterState) => {
              onChange(next);
              setFilters(next);
            }}
          />
        );
      }
      render(
        <StrictMode>
          <TooltipProvider>
            <Harness />
          </TooltipProvider>
        </StrictMode>,
      );
      if (kind === "popover")
        fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
      else fireEvent.click(screen.getByRole("button", { name: /Add filter/ }));
      fireEvent.click(screen.getAllByRole("combobox")[0]);
      fireEvent.click(screen.getByRole("option", { name: "User ID" }));
      onChange.mockClear();
      fireEvent.change(screen.getByPlaceholderText("string"), {
        target: { value: "second" },
      });
      fireEvent.change(screen.getByPlaceholderText("string"), {
        target: { value: "third" },
      });

      expect(onChange.mock.calls.map(([filters]) => filters)).toEqual(
        ["second", "third"].map((value) => [
          {
            column: kind === "inline" ? "userId" : "User ID",
            type: "string",
            operator: "=",
            value,
          },
        ]),
      );
      expect(consoleError).not.toHaveBeenCalled();
    },
  );
});
