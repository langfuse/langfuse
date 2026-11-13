import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EventsSearchBarRow } from "./EventsSearchBarRow";
import { createSearchBarStore } from "../store/searchBarStore";

const { capture, mutateAsync } = vi.hoisted(() => ({
  capture: vi.fn(),
  mutateAsync: vi.fn(),
}));
vi.mock("@/src/features/projects/hooks", () => ({
  useQueryProject: () => ({ organization: { aiFeaturesEnabled: true } }),
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => capture,
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    searchBar: {
      generateFilter: {
        useMutation: () => ({ mutateAsync, isPending: false }),
      },
    },
  },
}));

afterEach(() => vi.clearAllMocks());

it("discards an AI response after switching project with the same draft", async () => {
  let resolve!: (value: {
    filters: {
      column: string;
      type: "stringOptions";
      operator: "any of";
      value: string[];
    }[];
    unknownScoreNames: string[];
  }) => void;
  mutateAsync.mockImplementationOnce(
    () => new Promise((settle) => (resolve = settle)),
  );
  const store = createSearchBarStore();
  store.getState().actions.setDraft("level:ERROR");
  const onApplyFilters = vi.fn();
  const props = {
    tableName: "observations",
    store,
    commit: () => store.getState().draft,
    observed: {},
    onApplyFilters,
  };
  const { rerender } = render(
    <EventsSearchBarRow {...props} projectId="project-a" />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Ask AI to build or refine filters" }),
  );
  const input = screen.getByRole("textbox", {
    name: "Ask AI to build filters",
  });
  fireEvent.change(input, { target: { value: "only errors" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(mutateAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: "project-a",
      currentQuery: "level:ERROR",
    }),
  );

  rerender(<EventsSearchBarRow {...props} projectId="project-b" />);
  await act(async () => {
    resolve({
      filters: [
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR"],
        },
      ],
      unknownScoreNames: [],
    });
  });
  expect(onApplyFilters).not.toHaveBeenCalled();
});
