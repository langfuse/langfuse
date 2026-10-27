import { fireEvent, render, screen } from "@testing-library/react";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { type RouterOutputs } from "@/src/utils/api";
import { CreateLLMApiKeyForm } from "./CreateLLMApiKeyForm";

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  testProject: vi.fn(),
  listModelsUpdateProject: vi.fn(),
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
        listModels: mutation,
        listModelsUpdate: {
          useMutation: () => ({
            mutateAsync: mocks.listModelsUpdateProject,
            isPending: false,
          }),
        },
      },
      organizationLlmApiKey: {
        all: { useQuery: () => ({ data: { data: [] } }) },
        create: mutation,
        update: mutation,
        test: mutation,
        testUpdate: mutation,
        listModels: mutation,
        listModelsUpdate: mutation,
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

  it("adds fetched models without dropping configured models the endpoint no longer returns", async () => {
    mocks.listModelsUpdateProject.mockResolvedValue({
      success: true,
      models: ["kept-model", "new-model"],
    });
    const existingKey = {
      id: "key",
      projectId: "project",
      provider: "gateway",
      adapter: "openai",
      baseURL: "https://gateway.example.com/v1",
      displaySecretKey: "...test",
      customModels: ["kept-model", "retired-model"],
      withDefaultModels: false,
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

    fireEvent.click(
      screen.getByRole("button", { name: "Show advanced settings" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Fetch models from endpoint" }),
    );

    expect(
      await screen.findByText("Not returned by the endpoint"),
    ).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use 3 models" }));

    expect(
      screen
        .getAllByPlaceholderText(/^Custom model name/)
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(["kept-model", "retired-model", "new-model"]);
  });

  it("selects or clears only the models matching the filter", async () => {
    mocks.listModelsUpdateProject.mockResolvedValue({
      success: true,
      models: ["gpt-a", "gpt-b", "other-model"],
    });
    const existingKey = {
      id: "key",
      projectId: "project",
      provider: "gateway",
      adapter: "openai",
      baseURL: "https://gateway.example.com/v1",
      displaySecretKey: "...test",
      customModels: [],
      withDefaultModels: false,
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

    fireEvent.click(
      screen.getByRole("button", { name: "Show advanced settings" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Fetch models from endpoint" }),
    );

    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Select all" }),
    );
    expect(
      screen.getByRole("button", { name: "Use 0 models" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search models"), {
      target: { value: "gpt" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all shown" }));
    fireEvent.click(screen.getByRole("button", { name: "Use 2 models" }));

    expect(
      screen
        .getAllByPlaceholderText(/^Custom model name/)
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(["gpt-a", "gpt-b"]);
  });
});
