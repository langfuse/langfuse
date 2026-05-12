import React from "react";
import { render } from "@testing-library/react";
import { toast } from "sonner";

import { DeactivateEvalConfig } from "@/src/features/evals/components/deactivate-config";
import { type RouterOutputs } from "@/src/utils/api";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  capture: vi.fn(),
  mutationOptions: undefined as
    | {
        onSuccess?: () => void;
        onError?: (error: { message: string }) => void;
      }
    | undefined,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => mocks.capture,
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      evals: {
        invalidate: mocks.invalidate,
      },
    }),
    evals: {
      updateEvalJob: {
        useMutation: vi.fn((options) => {
          mocks.mutationOptions = options;
          return {
            isPending: false,
            mutateAsync: vi.fn(),
          };
        }),
      },
    },
  },
}));

describe("DeactivateEvalConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutationOptions = undefined;
  });

  it("surfaces evaluator update failures via toast", () => {
    const evalConfig = {
      id: "eval-1",
      status: "ACTIVE",
      timeScope: ["NEW", "EXISTING"],
    } as unknown as RouterOutputs["evals"]["configById"];

    render(
      <DeactivateEvalConfig projectId="project-1" evalConfig={evalConfig} />,
    );

    mocks.mutationOptions?.onError?.({
      message:
        "The evaluator ran on existing traces already. This cannot be changed anymore.",
    });

    expect(toast.error).toHaveBeenCalledWith(
      "The evaluator ran on existing traces already. This cannot be changed anymore.",
    );
  });

  it("invalidates evaluator queries after successful status update", () => {
    const evalConfig = {
      id: "eval-1",
      status: "ACTIVE",
      timeScope: ["NEW"],
    } as unknown as RouterOutputs["evals"]["configById"];

    render(
      <DeactivateEvalConfig projectId="project-1" evalConfig={evalConfig} />,
    );

    mocks.mutationOptions?.onSuccess?.();

    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
  });
});
