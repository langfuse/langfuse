import { act, fireEvent, render, screen } from "@testing-library/react";

import type * as LangfuseEnvCode from "@/src/features/public-api/hooks/useLangfuseEnvCode";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock("@/src/utils/api", () => ({
  api: {
    projectApiKeys: {
      create: {
        useMutation: (options: {
          onSuccess: (
            data: { secretKey: string },
            variables: { projectId: string },
          ) => void;
        }) => ({
          isPending: false,
          mutateAsync: async (variables: { projectId: string }) => {
            const data = await mutateAsync(variables);
            options.onSuccess(data, variables);
            return data;
          },
        }),
      },
    },
    useUtils: () => ({ projectApiKeys: { invalidate: vi.fn() } }),
  },
  reportNonTrpcError: vi.fn(),
}));

vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

vi.mock("@/src/features/public-api/hooks/useLangfuseEnvCode", async (orig) => ({
  ...(await orig<typeof LangfuseEnvCode>()),
  useLangfuseBaseUrl: () => "http://localhost:3000",
}));

import { TracesSetupOnboardingCard } from "./TracesSetupOnboardingCard";

describe("TracesSetupOnboardingCard", () => {
  it("shows a created key only in the project it was created in", async () => {
    mutateAsync.mockResolvedValue({ secretKey: "sk-lf-project-a" });
    const { rerender } = render(
      <TracesSetupOnboardingCard projectId="project-a" />,
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Create new API key" }),
      );
    });
    expect(mutateAsync).toHaveBeenCalledWith({ projectId: "project-a" });
    expect(
      screen.queryByRole("button", { name: "Create new API key" }),
    ).not.toBeInTheDocument();

    rerender(<TracesSetupOnboardingCard projectId="project-b" />);

    // Project A's secret would not authenticate against project B.
    expect(
      screen.getByRole("button", { name: "Create new API key" }),
    ).toBeInTheDocument();
  });
});
