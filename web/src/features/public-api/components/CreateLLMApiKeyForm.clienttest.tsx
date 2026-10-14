import { fireEvent, render, screen } from "@testing-library/react";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { type RouterOutputs } from "@/src/utils/api";
import { CreateLLMApiKeyForm } from "./CreateLLMApiKeyForm";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  testProject: vi.fn(),
  reportNonTrpcError: vi.fn(),
  reportTrpcErrorWithoutToast: vi.fn(),
}));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/utils/api", () => {
  const mutation = { useMutation: () => ({ mutateAsync: vi.fn() }) };
  return {
    api: {
      llmApiKey: {
        all: { useQuery: () => ({ data: { data: [] } }) },
        create: {
          useMutation: () => ({ mutateAsync: mocks.createProject }),
        },
        update: mutation,
        test: {
          useMutation: () => ({ mutateAsync: mocks.testProject }),
        },
        testUpdate: mutation,
      },
      organizationLlmApiKey: {
        all: { useQuery: () => ({ data: { data: [] } }) },
        create: mutation,
        update: mutation,
        test: mutation,
        testUpdate: mutation,
      },
      useUtils: () => ({
        llmApiKey: { invalidate: vi.fn() },
        organizationLlmApiKey: { invalidate: vi.fn() },
      }),
    },
    reportNonTrpcError: mocks.reportNonTrpcError,
    reportTrpcErrorWithoutToast: mocks.reportTrpcErrorWithoutToast,
  };
});

describe("CreateLLMApiKeyForm", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.testProject.mockResolvedValue({ success: true });
  });

  it("restores a TypeSafe connection's custom base URL after switching upstreams", () => {
    const existingKey = {
      id: "key",
      projectId: "project",
      provider: "jev-via-proxy",
      adapter: "typesafe",
      baseURL: "https://gateway.example.com/v1",
      displaySecretKey: "...test",
      customModels: [],
      withDefaultModels: true,
      extraHeaderKeys: [],
    } as unknown as RouterOutputs["llmApiKey"]["all"]["data"][number];

    render(
      <CreateLLMApiKeyForm
        owner={{ scope: "project", projectId: "project" }}
        onSuccess={vi.fn()}
        customization={null}
        mode="update"
        existingKey={existingKey}
      />,
      { wrapper: LayerProvider },
    );

    fireEvent.click(screen.getByRole("radio", { name: "OpenRouter" }));
    expect(
      screen.queryByRole("textbox", { name: "Custom base URL" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Custom" }));

    expect(
      screen.getByRole("textbox", { name: "Custom base URL" }),
    ).toHaveValue("https://gateway.example.com/v1");
  });

  it("shows save errors in the form instead of reporting a toast", async () => {
    const error = new Error(
      "Project and organization connections with the same provider name must use the same adapter.",
    );
    mocks.createProject.mockRejectedValue(error);

    render(
      <CreateLLMApiKeyForm
        owner={{ scope: "project", projectId: "project" }}
        onSuccess={vi.fn()}
        customization={null}
      />,
      { wrapper: LayerProvider },
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Provider name" }), {
      target: { value: "shared-provider" },
    });
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "secret-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create connection" }));

    expect(await screen.findByText(error.message)).toBeInTheDocument();
    expect(mocks.reportTrpcErrorWithoutToast).toHaveBeenCalledWith(
      error,
      "llm-api-keys",
    );
    expect(mocks.reportNonTrpcError).not.toHaveBeenCalled();
  });
});
