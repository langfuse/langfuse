import { StrictMode, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    naturalLanguageFilters: { createCompletion: { useMutation: vi.fn() } },
  },
}));

describe("filter builder change notifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("keeps a new row controlled while choosing its column and entering a value", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.scrollIntoView = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const onChange = vi.fn();
    render(
      <InlineFilterBuilder
        columns={[
          {
            id: "userId",
            name: "User ID",
            type: "string",
            internal: "user_id",
          },
        ]}
        columnIdentifier="id"
        filterState={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add filter/ }));
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(screen.getByRole("option", { name: "User ID" }));
    fireEvent.change(screen.getByPlaceholderText("string"), {
      target: { value: "user-1" },
    });

    expect(onChange).toHaveBeenLastCalledWith([
      {
        column: "userId",
        type: "string",
        operator: "=",
        value: "user-1",
        key: undefined,
      },
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });
  it.each([
    ["inline", InlineFilterBuilder],
    ["popover", PopoverFilterBuilder],
  ] as const)(
    "%s notifies the parent once per edit, outside React state updaters",
    (kind, Builder) => {
      const onChange = vi.fn();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      function Harness() {
        const [filters, setFilters] = useState<FilterState>([
          { column: "name", type: "string", operator: "=", value: "first" },
        ]);
        return (
          <Builder
            columns={[
              { id: "name", name: "Name", type: "string", internal: "name" },
            ]}
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
      fireEvent.change(screen.getByPlaceholderText("string"), {
        target: { value: "second" },
      });
      fireEvent.change(screen.getByPlaceholderText("string"), {
        target: { value: "third" },
      });

      expect(onChange.mock.calls.map(([filters]) => filters[0].value)).toEqual([
        "second",
        "third",
      ]);
      expect(consoleError).not.toHaveBeenCalled();
    },
  );
});
