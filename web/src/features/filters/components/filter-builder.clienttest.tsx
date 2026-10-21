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
