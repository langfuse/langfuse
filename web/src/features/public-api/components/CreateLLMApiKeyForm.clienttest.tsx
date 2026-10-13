import { fireEvent, render, screen } from "@testing-library/react";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { type RouterOutputs } from "@/src/utils/api";
import { CreateLLMApiKeyForm } from "./CreateLLMApiKeyForm";

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/utils/api", () => {
  const mutation = { useMutation: () => ({ mutateAsync: vi.fn() }) };
  return {
    api: {
      llmApiKey: {
        all: { useQuery: () => ({ data: { data: [] } }) },
        create: mutation,
        update: mutation,
        test: mutation,
        testUpdate: mutation,
      },
      useUtils: () => ({ llmApiKey: { invalidate: vi.fn() } }),
    },
    reportNonTrpcError: vi.fn(),
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
        projectId="project"
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
});
