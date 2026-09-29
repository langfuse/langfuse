import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above these imports, and the mock state lives in
// vi.hoisted, so the hook still loads against the mocked api module.
import { useEvalConfigFilterOptions } from "./useEvalConfigFilterOptions";

const mocks = vi.hoisted(() => ({
  datasetsData: [] as Array<{ id: string; name: string }>,
  eventsData: {} as Record<string, unknown>,
  eventsInput: undefined as unknown,
  eventsOptions: undefined as unknown,
  generationsData: {} as Record<string, unknown>,
  generationsOptions: undefined as unknown,
  tracesData: {} as Record<string, unknown>,
  tracesOptions: undefined as unknown,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    datasets: {
      allDatasetMeta: {
        useQuery: () => ({ data: mocks.datasetsData }),
      },
    },
    events: {
      filterOptions: {
        useQuery: (input: unknown, options: unknown) => {
          mocks.eventsInput = input;
          mocks.eventsOptions = options;
          return { data: mocks.eventsData };
        },
      },
    },
    generations: {
      filterOptions: {
        useQuery: (_input: unknown, options: unknown) => {
          mocks.generationsOptions = options;
          return { data: mocks.generationsData };
        },
      },
    },
    projects: {
      environmentFilterOptions: {
        useQuery: () => ({ data: [] }),
      },
    },
    traces: {
      filterOptions: {
        useQuery: (_input: unknown, options: unknown) => {
          mocks.tracesOptions = options;
          return { data: mocks.tracesData };
        },
      },
    },
  },
}));

describe("useEvalConfigFilterOptions", () => {
  beforeEach(() => {
    mocks.datasetsData = [];
    mocks.eventsData = {};
    mocks.eventsInput = undefined;
    mocks.eventsOptions = undefined;
    mocks.generationsData = {};
    mocks.generationsOptions = undefined;
    mocks.tracesData = {};
    mocks.tracesOptions = undefined;
  });

  it("uses events-backed trace options for v4 evaluators", () => {
    mocks.eventsData = {
      traceName: [{ value: "events-trace", count: 2 }],
      traceTags: [{ value: "events-tag" }],
      name: [{ value: "events-observation" }],
      calledToolNames: [{ value: "events-tool" }],
    };
    const { result } = renderHook(() =>
      useEvalConfigFilterOptions({
        projectId: "project-id",
        useEventsTable: true,
        includeLegacyTraceOptions: false,
      }),
    );

    expect(mocks.eventsInput).toMatchObject({
      projectId: "project-id",
      columns: ["traceName", "traceTags", "name", "calledToolNames"],
    });
    expect(mocks.eventsOptions).toMatchObject({ enabled: true });
    expect(mocks.generationsOptions).toMatchObject({ enabled: false });
    expect(mocks.tracesOptions).toMatchObject({ enabled: false });
    expect(result.current.observationEvalFilterOptions).toMatchObject({
      traceName: [{ value: "events-trace" }],
      tags: [{ value: "events-tag" }],
      name: [{ value: "events-observation" }],
      calledToolNames: [{ value: "events-tool" }],
    });
  });

  it("loads legacy trace options when editing a legacy evaluator on v4", () => {
    renderHook(() =>
      useEvalConfigFilterOptions({
        projectId: "project-id",
        useEventsTable: true,
        includeLegacyTraceOptions: true,
      }),
    );

    expect(mocks.tracesOptions).toMatchObject({ enabled: true });
  });

  it("keeps legacy evaluator options on the legacy repositories", () => {
    mocks.tracesData = {
      name: [{ value: "legacy-trace", count: "1" }],
      tags: [{ value: "legacy-tag" }],
    };
    mocks.generationsData = {
      name: [{ value: "legacy-observation" }],
      calledToolNames: [{ value: "legacy-tool" }],
    };

    const { result } = renderHook(() =>
      useEvalConfigFilterOptions({
        projectId: "project-id",
        useEventsTable: false,
        includeLegacyTraceOptions: false,
      }),
    );

    expect(mocks.eventsOptions).toMatchObject({ enabled: false });
    expect(mocks.generationsOptions).toMatchObject({ enabled: true });
    expect(mocks.tracesOptions).toMatchObject({ enabled: true });
    expect(result.current.observationEvalFilterOptions).toMatchObject({
      traceName: [{ value: "legacy-trace" }],
      tags: [{ value: "legacy-tag" }],
      name: [{ value: "legacy-observation" }],
      calledToolNames: [{ value: "legacy-tool" }],
    });
  });

  it("shows dataset names while keeping IDs in legacy evaluator filters", () => {
    mocks.datasetsData = [{ id: "dataset-id", name: "Filter QA Dataset" }];

    const { result } = renderHook(() =>
      useEvalConfigFilterOptions({
        projectId: "project-id",
        useEventsTable: false,
        includeLegacyTraceOptions: false,
      }),
    );

    expect(result.current.experimentEvalFilterOptions).toEqual({
      experimentDatasetId: [
        {
          value: "dataset-id",
          displayValue: "Filter QA Dataset",
        },
      ],
    });
  });
});
