import { act, renderHook } from "@testing-library/react";
import { EvalTargetObject } from "@langfuse/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDatasetExperimentRules,
  useExperimentV2EvaluatorSelection,
} from "./useExperimentV2EvaluatorSelection";

const apiMocks = vi.hoisted(() => ({
  evaluatorOptionsQuery: vi.fn(),
  rulesQuery: vi.fn(),
  createRuleMutation: vi.fn(),
  createRuleMutateAsync: vi.fn(),
  updateRuleMutation: vi.fn(),
  invalidateRules: vi.fn(),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      evalsV2: { rules: { list: { invalidate: apiMocks.invalidateRules } } },
    }),
    evalsV2: {
      options: { useQuery: apiMocks.evaluatorOptionsQuery },
      rules: {
        list: { useQuery: apiMocks.rulesQuery },
        create: { useMutation: apiMocks.createRuleMutation },
        update: { useMutation: apiMocks.updateRuleMutation },
      },
    },
  },
}));

const experimentRootFilter = {
  column: "isExperimentItemRootSpan",
  type: "boolean",
  operator: "=",
  value: true,
} as const;

describe("useExperimentV2EvaluatorSelection", () => {
  beforeEach(() => {
    apiMocks.evaluatorOptionsQuery.mockReturnValue({
      data: [],
      isPending: false,
    });
    apiMocks.rulesQuery.mockReturnValue({
      data: { rules: [] },
      isPending: false,
    });
    apiMocks.createRuleMutation.mockReturnValue({
      isPending: false,
      mutateAsync: apiMocks.createRuleMutateAsync,
    });
    apiMocks.updateRuleMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("does not load evaluation rules before a dataset is selected", () => {
    renderHook(() =>
      useExperimentV2EvaluatorSelection({
        projectId: "project-1",
        datasetId: null,
        enabled: true,
        canWrite: true,
      }),
    );

    expect(apiMocks.rulesQuery).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ enabled: false }),
    );
  });

  it("does not save assignments while existing rules are loading", async () => {
    apiMocks.rulesQuery.mockReturnValue({
      data: undefined,
      isPending: true,
    });

    const { result } = renderHook(() =>
      useExperimentV2EvaluatorSelection({
        projectId: "project-1",
        datasetId: "dataset-1",
        enabled: true,
        canWrite: true,
      }),
    );

    await act(() =>
      result.current.onSaveAssignments([
        { evaluatorId: "evaluator-1", variableMapping: [] } as never,
      ]),
    );

    expect(result.current.isLoadingAssignments).toBe(true);
    expect(apiMocks.createRuleMutateAsync).not.toHaveBeenCalled();
  });

  it("stays ready while an evaluator search is loading", () => {
    vi.useFakeTimers();
    const previousOptions: never[] = [];
    apiMocks.evaluatorOptionsQuery.mockImplementation((input, queryOptions) => {
      const data = input.search
        ? queryOptions.placeholderData?.(previousOptions)
        : previousOptions;
      return {
        data,
        isPending: input.search ? data === undefined : false,
      };
    });

    const { result } = renderHook(() =>
      useExperimentV2EvaluatorSelection({
        projectId: "project-1",
        datasetId: "dataset-1",
        enabled: true,
        canWrite: true,
      }),
    );

    act(() => {
      result.current.onSearchChange("quality");
      vi.advanceTimersByTime(300);
    });

    expect(apiMocks.evaluatorOptionsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "quality" }),
      expect.any(Object),
    );
    expect(result.current.isPending).toBe(false);
  });
});

describe("getDatasetExperimentRules", () => {
  it("only returns the rule scoped to the selected dataset", () => {
    const datasetRule = {
      id: "dataset-rule",
      targetObject: EvalTargetObject.EVENT,
      filter: [
        experimentRootFilter,
        {
          column: "experimentDatasetId",
          type: "stringOptions",
          operator: "any of",
          value: ["dataset-1"],
        },
      ],
    };
    const otherDatasetRule = {
      ...datasetRule,
      id: "other-dataset-rule",
      filter: [
        experimentRootFilter,
        {
          column: "experimentDatasetId",
          type: "stringOptions",
          operator: "any of",
          value: ["dataset-2"],
        },
      ],
    };
    const globalExperimentRule = {
      ...datasetRule,
      id: "global-rule",
      filter: [experimentRootFilter],
    };

    const result = getDatasetExperimentRules(
      [datasetRule, otherDatasetRule, globalExperimentRule] as never,
      "dataset-1",
    );

    expect(result.map((rule) => rule.id)).toEqual(["dataset-rule"]);
  });
});
