import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";

import { DeactivateEvalConfig } from "@/src/features/evals/components/deactivate-config";
import { type RouterOutputs } from "@/src/utils/api";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  capture: vi.fn(),
  mutateAsync: vi.fn(),
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
            mutateAsync: mocks.mutateAsync,
          };
        }),
      },
    },
  },
}));

describe("DeactivateEvalConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutateAsync.mockResolvedValue(undefined);
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

  it.each([
    {
      currentStatus: "ACTIVE",
      buttonName: "Deactivate",
      nextStatus: "INACTIVE",
      eventName: "eval_config:deactivate",
    },
    {
      currentStatus: "INACTIVE",
      buttonName: "Activate",
      nextStatus: "ACTIVE",
      eventName: "eval_config:activate",
    },
  ])(
    "captures and closes the confirmation popover after a successful $buttonName action",
    async ({ currentStatus, buttonName, nextStatus, eventName }) => {
      const evalConfig = {
        id: "eval-1",
        status: currentStatus,
        timeScope: ["NEW"],
      } as unknown as RouterOutputs["evals"]["configById"];

      render(
        <DeactivateEvalConfig projectId="project-1" evalConfig={evalConfig} />,
      );

      fireEvent.click(screen.getByRole("switch"));
      fireEvent.click(screen.getByRole("button", { name: buttonName }));

      await waitFor(() =>
        expect(mocks.mutateAsync).toHaveBeenCalledWith({
          projectId: "project-1",
          evalConfigId: "eval-1",
          config: { status: nextStatus },
        }),
      );

      expect(mocks.capture).toHaveBeenCalledWith(eventName);
      await waitFor(() =>
        expect(screen.queryByText("Please confirm")).not.toBeInTheDocument(),
      );
    },
  );
});
